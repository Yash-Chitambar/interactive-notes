# Overshoot Dual Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 0.5s Overshoot polling loop with a stroke-gated dual pipeline: Overshoot text feeds Gemini Flash Lite for bounding-box annotation, while canvas PNG frames go directly to Gemini Live for voice context.

**Architecture:** On every stroke-end, check `isSpeaking` — if Gemini is talking, drop both pipelines. Otherwise fire in parallel: (1) read the latest Overshoot text + canvas PNG → `gemini-3.1-flash-lite-preview` → annotation overlay, and (2) canvas PNG → Gemini Live via new `canvas_frame` WebSocket message → voice tutor has visual context. Overshoot still runs continuously (screen share granted once) but only its latest buffered text is consumed on stroke-end.

**Tech Stack:** Next.js 15, `@google/generative-ai`, `@google/genai` (Live), `overshoot` SDK, WebSocket relay (Node.js)

---

### Task 1: Update ws-relay — new model + canvas_frame message

**Files:**
- Modify: `ws-relay/server.js:27` (model constant)
- Modify: `ws-relay/server.js:89-92` (system prompt)
- Modify: `ws-relay/server.js:177-224` (message routing switch)

**Step 1: Update model ID**

In `ws-relay/server.js`, change line 27:
```js
// Before:
const MODEL = "gemini-2.5-flash-native-audio-latest";

// After:
const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
```

**Step 2: Update system prompt to acknowledge visual input**

In `_connectGemini()`, replace the `systemPrompt` string (around line 89):
```js
const systemPrompt =
  `You are a friendly, patient Socratic tutor helping a student with ${this.subject}. ` +
  `Never give answers directly — guide with hints and clarifying questions. ` +
  `You will periodically receive images of the student's canvas as they write. ` +
  `Use these images for visual context when responding. ` +
  `Keep every response to two sentences or fewer.`;
```

**Step 3: Add canvas_frame case to the message routing switch**

In `_onClientMessage()`, add a new case before the `default:` (around line 213):
```js
case "canvas_frame": {
  if (!this.gemini) return; // silently drop — Gemini not ready
  const data = (msg.data ?? "").replace(/^data:image\/\w+;base64,/, "");
  if (!data) return;
  try {
    this.gemini.sendRealtimeInput({
      video: { data, mimeType: "image/png" },
    });
  } catch (err) {
    console.warn("[relay] canvas_frame send failed:", err.message);
  }
  break;
}
```

**Step 4: Manual test**

Start relay: `node ws-relay/server.js`
Expected log: `[relay] Listening on ws://localhost:8080`
No errors on startup. Proceed.

**Step 5: Commit**

```bash
git add ws-relay/server.js
git commit -m "feat(relay): add canvas_frame input, update to native audio preview model"
```

---

### Task 2: Add sendCanvasFrame to useAudioSession

**Files:**
- Modify: `hooks/useAudioSession.ts:334` (after `sendTextMessage`)

**Step 1: Add the method after `sendTextMessage`**

In `hooks/useAudioSession.ts`, after the `sendTextMessage` useCallback (around line 337), add:
```ts
/** Send a canvas PNG snapshot to Gemini Live for visual context. */
const sendCanvasFrame = useCallback((base64: string) => {
  // Strip data URL prefix if present — relay handles raw base64
  const data = base64.includes(",") ? base64.split(",")[1] : base64;
  if (data) sendWs({ type: "canvas_frame", data });
}, []);
```

**Step 2: Add to the return object**

In the `return` statement at the bottom of `useAudioSession`, add `sendCanvasFrame`:
```ts
return {
  isConnected,
  isListening,
  isMuted,
  isSpeaking,
  transcript,
  toggleMic,
  toggleMute,
  sendTextMessage,
  sendCanvasFrame,   // <-- add this
  setSubject,
};
```

**Step 3: Manual test**

`npm run dev` — no TypeScript errors. Proceed.

**Step 4: Commit**

```bash
git add hooks/useAudioSession.ts
git commit -m "feat(audio): add sendCanvasFrame to send PNG frames to Gemini Live"
```

---

### Task 3: Refactor useOvershoot — slow interval, buffer latest text

The current hook sends every Overshoot result to Gemini Live via `onResult → sendTextMessage`. We remove that and instead buffer the latest text in a ref so stroke-end can read it on demand. We also slow the capture interval from 0.5s to 2s.

**Files:**
- Modify: `hooks/useOvershoot.ts`

**Step 1: Add a latestTextRef and getLatestText**

Replace the full contents of `hooks/useOvershoot.ts` with:
```ts
"use client";

// ============================================================
// hooks/useOvershoot.ts
// Real-time screen vision using Overshoot SDK.
// Runs continuously while active, buffering the latest LaTeX
// extraction into a ref. Stroke-end reads the buffer — no timer.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

type RealtimeVisionType = import("overshoot").RealtimeVision;

const OVERSHOOT_API_KEY = process.env.NEXT_PUBLIC_OVERSHOOT_API_KEY ?? "";
const OVERSHOOT_MODEL   = "Qwen/Qwen3.5-9B";
const OVERSHOOT_PROMPT  =
  "Read all the handwritten text, convert equations to latex, and ignore everything else";

export function useOvershoot() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const visionRef     = useRef<RealtimeVisionType | null>(null);
  const latestTextRef = useRef<string>("");

  /** Returns the most recent Overshoot extraction (may be empty string). */
  const getLatestText = useCallback(() => latestTextRef.current, []);

  const startCamera = useCallback(async () => {
    if (!OVERSHOOT_API_KEY) {
      setError("NEXT_PUBLIC_OVERSHOOT_API_KEY is not set");
      return;
    }
    if (visionRef.current?.isActive()) return;

    setError(null);

    try {
      const { RealtimeVision } = await import("overshoot");

      const vision = new RealtimeVision({
        apiKey: OVERSHOOT_API_KEY,
        prompt: OVERSHOOT_PROMPT,
        model: OVERSHOOT_MODEL,
        source: { type: "screen" },
        mode: "frame",
        // 2s interval — we only consume on stroke-end, fast polling is wasteful
        frameProcessing: { interval_seconds: 2 },
        onResult: (r) => {
          if (r.ok && r.result) {
            latestTextRef.current = r.result.trim();
          }
        },
        onError: (err) => {
          console.error("[useOvershoot] Error:", err);
          setError(err.message);
          setIsActive(false);
          visionRef.current = null;
        },
      });

      await vision.start();
      visionRef.current = vision;
      setIsActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useOvershoot] Failed to start:", msg);
      setError(msg);
    }
  }, []);

  const stopCamera = useCallback(async () => {
    if (!visionRef.current) return;
    await visionRef.current.stop();
    visionRef.current   = null;
    latestTextRef.current = "";
    setIsActive(false);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (isActive) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      visionRef.current?.stop().catch(() => {});
    };
  }, []);

  return { isActive, error, toggleCamera, getLatestText };
}
```

**Step 2: Manual test**

`npm run dev` — no TypeScript errors. Proceed.

**Step 3: Commit**

```bash
git add hooks/useOvershoot.ts
git commit -m "refactor(overshoot): buffer latest text in ref, remove continuous sendTextMessage, slow to 2s"
```

---

### Task 4: Update AnalyzeRequest type + /api/analyze route

**Files:**
- Modify: `types/index.ts:20-25`
- Modify: `app/api/analyze/route.ts:83` (model name) and `route.ts:92-95` (prompt call)

**Step 1: Add overshoot_text to AnalyzeRequest type**

In `types/index.ts`, update `AnalyzeRequest`:
```ts
export interface AnalyzeRequest {
  image: string;           // base64 PNG (data URL or raw base64)
  subject: Subject;
  session_id: string;
  tutor_mode: TutorMode;
  overshoot_text?: string; // optional LaTeX/text from Overshoot screen capture
}
```

**Step 2: Switch model in /api/analyze**

In `app/api/analyze/route.ts`, change the model name (around line 83):
```ts
// Before:
model: "gemini-2.5-flash",

// After:
model: "gemini-3.1-flash-lite-preview",
```

**Step 3: Extract overshoot_text from body and pass to prompt**

In the same file, update the destructure (around line 56) and the `generateContent` call:
```ts
// Destructure:
const { image, subject, session_id, tutor_mode, overshoot_text } = body;

// Update generateContent call (around line 92):
const result = await model.generateContent([
  { text: buildPrompt(subject, contextText, tutor_mode, overshoot_text) },
  { inlineData: { data: base64Data, mimeType: "image/png" } },
]);
```

**Step 4: Update buildPrompt to accept and use overshoot_text**

Replace the `buildPrompt` function signature and body:
```ts
function buildPrompt(subject: string, context: string, mode: string, overshootText?: string): string {
  const guides: Record<string, string> = {
    math:      "Look for arithmetic errors, wrong signs, incorrect algebra, missing simplification.",
    physics:   "Look for wrong formulas, unit errors, incorrect vector directions, sign mistakes.",
    chemistry: "Look for unbalanced equations, wrong valences, incorrect stoichiometry.",
    english:   "Look for grammar errors, unclear thesis, weak evidence, run-on sentences.",
  };
  const guide = guides[subject] ?? "Look for factual or logical errors.";

  return `You are a patient, encouraging ${subject} tutor reviewing a student's handwritten work on a digital canvas.

${context ? `Student's uploaded notes for context:\n${context}\n\n` : ""}${overshootText ? `Handwritten content extracted from canvas (use for understanding, bounding boxes must reference the image):\n${overshootText}\n\n` : ""}${guide}

Tutor mode: "${mode}"
${mode === "hint"
  ? "NEVER reveal the correct answer — point to where the error is and ask a guiding question."
  : "You may show the correct answer when there is a clear error."}

Rules:
- bbox: tight bounding box [x, y, width, height] in IMAGE pixels around the specific symbol/step with the issue
- type "error": wrong step or answer (severity 2-3)
- type "hint": student is close but needs a nudge (severity 1-2)
- type "praise": clearly correct work (severity 1)
- text: max 60 chars, specific ("Wrong sign here", "Check exponent", "x = -1 not +1")
- If canvas is blank or nearly empty: return annotations=[], summary="Go ahead — start writing!"
- Only annotate what you can clearly see — ignore illegible marks
- summary: one short, encouraging sentence spoken aloud to the student`;
}
```

**Step 5: Manual test**

`npm run dev` — no TypeScript errors. Proceed.

**Step 6: Commit**

```bash
git add types/index.ts app/api/analyze/route.ts
git commit -m "feat(analyze): switch to gemini-3.1-flash-lite-preview, accept overshoot_text in prompt"
```

---

### Task 5: Remove throttle from useVLMAnalysis, accept overshootText param

**Files:**
- Modify: `hooks/useVLMAnalysis.ts`

**Step 1: Remove THROTTLE_MS and lastCalledAt ref, add overshootText param**

Replace the full contents of `hooks/useVLMAnalysis.ts` with:
```ts
"use client";

// ============================================================
// useVLMAnalysis.ts — PERSON 3 OWNS THIS FILE
// Sends canvas snapshot + Overshoot text to /api/analyze.
// Throttle removed — stroke-end + hash dedup is the only gate.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { AnnotationResponse, AnalyzeRequest, Annotation, Subject, TutorMode } from "@/types";

interface UseVLMAnalysisOptions {
  subject: Subject;
  tutorMode: TutorMode;
  sessionId: string;
}

/** Simple djb2-style numeric hash of a string — fast, no crypto needed. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function useVLMAnalysis({ subject, tutorMode, sessionId }: UseVLMAnalysisOptions) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const lastImageHash = useRef<number | null>(null);
  const abortCtrlRef  = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (getSnapshot: () => string, overshootText?: string) => {
      const image = getSnapshot();
      if (!image || image === "data:," || image === "") return;

      // Skip if canvas content hasn't changed since last successful call
      const hash = hashString(image);
      if (hash === lastImageHash.current) return;

      // Cancel any in-flight request before starting a new one
      abortCtrlRef.current?.abort();
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      lastImageHash.current = hash;

      setIsAnalyzing(true);
      try {
        const body: AnalyzeRequest = {
          image,
          subject,
          session_id: sessionId,
          tutor_mode: tutorMode,
          overshoot_text: overshootText,
        };

        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

        if (!res.ok) throw new Error(`analyze failed: ${res.status}`);

        const data: AnnotationResponse = await res.json();
        setAnnotations(data.annotations ?? []);
        setLastSummary(data.summary ?? null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("[useVLMAnalysis]", err);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [subject, tutorMode, sessionId]
  );

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
    setLastSummary(null);
  }, []);

  return { annotations, isAnalyzing, lastSummary, analyze, clearAnnotations };
}
```

**Step 2: Manual test**

`npm run dev` — no TypeScript errors. Proceed.

**Step 3: Commit**

```bash
git add hooks/useVLMAnalysis.ts
git commit -m "refactor(vlm): remove 5s throttle, accept overshootText param for analyze"
```

---

### Task 6: Wire dual pipeline in page.tsx

This is the final wiring step. `handleStrokeEnd` gets the `isSpeaking` guard and fires both pipelines.

**Files:**
- Modify: `app/page.tsx:62-70` (useOvershoot and useAudioSession destructuring)
- Modify: `app/page.tsx:130-134` (handleStrokeEnd)
- Modify: `app/page.tsx:104-110` (lastSummary effect — remove sendTextMessage from here too)

**Step 1: Update useOvershoot destructuring (around line 66)**

```ts
// Before:
const { isActive: isCameraActive, toggleCamera } = useOvershoot({
  onResult: (text) => {
    setToast({ message: text, key: Date.now() });
    if (isConnected) sendTextMessage(text);
  },
});

// After:
const { isActive: isCameraActive, toggleCamera, getLatestText } = useOvershoot();
```

**Step 2: Update useAudioSession destructuring (around line 62)**

```ts
// Before:
const { isConnected, isListening, isMuted, isSpeaking, transcript, toggleMic, toggleMute, sendTextMessage } =
  useAudioSession();

// After:
const { isConnected, isListening, isMuted, isSpeaking, transcript, toggleMic, toggleMute, sendTextMessage, sendCanvasFrame } =
  useAudioSession();
```

**Step 3: Update handleStrokeEnd**

```ts
// Before:
const handleStrokeEnd = useCallback(() => {
  if (canvasRef.current) {
    analyze(canvasRef.current.getSnapshot);
  }
}, [analyze]);

// After:
const handleStrokeEnd = useCallback(() => {
  // Drop both pipelines if Gemini is currently speaking
  if (isSpeaking) return;

  if (canvasRef.current) {
    const overshootText = isCameraActive ? getLatestText() : undefined;

    // Pipeline 1: annotation overlay (Overshoot text + canvas PNG → Gemini Flash Lite)
    analyze(canvasRef.current.getSnapshot, overshootText);

    // Pipeline 2: voice context (canvas PNG → Gemini Live)
    if (isConnected) {
      sendCanvasFrame(canvasRef.current.getSnapshot());
    }
  }
}, [analyze, isSpeaking, isCameraActive, getLatestText, isConnected, sendCanvasFrame]);
```

**Step 4: Remove sendTextMessage from the lastSummary effect**

The voice tutor now gets visual context directly via canvas frames. We no longer need to echo the VLM summary as text into Gemini Live — it creates the double-response problem the user reported.

```ts
// Before (around line 105):
useEffect(() => {
  if (lastSummary && lastSummary.trim() !== "") {
    setToast({ message: lastSummary, key: Date.now() });
    if (isConnected) sendTextMessage(lastSummary);
  }
}, [lastSummary]);

// After:
useEffect(() => {
  if (lastSummary && lastSummary.trim() !== "") {
    setToast({ message: lastSummary, key: Date.now() });
    // Toast only — voice tutor reads the canvas directly via canvas_frame
  }
}, [lastSummary]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 5: Manual end-to-end test**

1. `npm run dev` in terminal 1
2. `node ws-relay/server.js` in terminal 2
3. Open http://localhost:3000
4. Toggle camera (Overshoot) on — screen share permission prompt appears once
5. Draw something on canvas
6. Verify: AI annotation overlay appears (Pipeline 1 working)
7. Toggle mic on, wait for Gemini to connect
8. Draw more — while Gemini is speaking, draw a stroke — nothing should fire
9. After Gemini finishes speaking, draw — both pipelines should fire
10. Speak a question — Gemini should reference what's on the canvas

**Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire stroke-gated dual pipeline — isSpeaking guard, annotation + voice context"
```

---

## Summary of All Changes

| File | What changed |
|------|-------------|
| `ws-relay/server.js` | New model ID, updated system prompt, `canvas_frame` message handler |
| `hooks/useAudioSession.ts` | `sendCanvasFrame()` method added |
| `hooks/useOvershoot.ts` | Continuous mode kept but `onResult` buffers into ref; `getLatestText()` exposed; interval slowed to 2s; `onResult` no longer calls `sendTextMessage` |
| `types/index.ts` | `overshoot_text?: string` added to `AnalyzeRequest` |
| `app/api/analyze/route.ts` | Model → `gemini-3.1-flash-lite-preview`; `overshoot_text` used in prompt |
| `hooks/useVLMAnalysis.ts` | `THROTTLE_MS` removed; `overshootText` param added to `analyze()` |
| `app/page.tsx` | `handleStrokeEnd` gets `isSpeaking` guard + dual pipeline; `lastSummary` effect no longer sends to Gemini Live |
