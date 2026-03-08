# Overshoot + Gemini Live: Stroke-Gated Dual Pipeline

**Date:** 2026-03-07
**Status:** Approved, ready for implementation

## Problem

The current Overshoot integration polls the screen every 0.5 seconds on a fixed timer. This causes:
- Gemini Live being interrupted mid-speech with new screen input
- The student having no time to respond before the tutor speaks again
- Excessive API calls with duplicate screen content
- The annotation VLM (Gemini Flash) and voice (Gemini Live) operating as separate, uncoordinated systems

## Solution: Stroke-Gated Dual Pipeline

Replace the polling timer with a stroke-end event trigger. On each stroke-end, two pipelines fire in parallel — but only when Gemini is not currently speaking.

## Architecture

```
stroke-end
    │
    ├─ isSpeaking? ──yes──> DROP BOTH (Gemini is talking)
    │
    └─ no
        │
        ├─ hash unchanged? ──yes──> DROP BOTH (canvas didn't change)
        │
        └─ new content
            ├── Pipeline 1: Overshoot captureOnce()
            │       → LaTeX/text string
            │       → POST /api/analyze
            │       → gemini-3.1-flash-lite-preview
            │       → { annotations, summary }
            │       → AIOverlay bounding boxes
            │
            └── Pipeline 2: canvas.toDataURL()
                    → base64 PNG
                    → WS { type: "canvas_frame", data: base64 }
                    → ws-relay/server.js
                    → gemini.sendRealtimeInput({ video: { data, mimeType: "image/png" } })
                    → Gemini Live has visual context for voice responses
```

## Guard Logic

| State | Action |
|-------|--------|
| `isSpeaking === true` | Drop both pipelines |
| `isListening === true` (student speaking) | Proceed — Live handles concurrent input |
| Canvas hash unchanged since last send | Drop both pipelines |
| Overshoot API key missing | Skip Pipeline 1 silently; Pipeline 2 still runs |
| Gemini Live not connected | Skip Pipeline 2 silently; Pipeline 1 still runs |

## Model Changes

| Use case | Old model | New model |
|----------|-----------|-----------|
| Annotation (bounding boxes) | Gemini Flash (via /api/analyze) | `gemini-3.1-flash-lite-preview` |
| Voice / Live | `gemini-2.5-flash-native-audio-latest` | `gemini-2.5-flash-native-audio-preview-12-2025` |

## Files Changed

| File | Change |
|------|--------|
| `hooks/useOvershoot.ts` | Remove `RealtimeVision` continuous mode. Add `captureOnce()` method. |
| `hooks/useVLMAnalysis.ts` | Remove or merge into useOvershoot. Remove `THROTTLE_MS` and timer logic. |
| `app/api/analyze/route.ts` | Update to `gemini-3.1-flash-lite-preview`. Accept Overshoot LaTeX string + canvas PNG. |
| `hooks/useAudioSession.ts` | Add `sendCanvasFrame(base64: string)` method. New WS message type `canvas_frame`. |
| `ws-relay/server.js` | Handle `canvas_frame` message type via `sendRealtimeInput`. Update model ID. Update system prompt to acknowledge visual input. |
| `app/page.tsx` | `handleStrokeEnd`: add `isSpeaking` guard, call both pipelines, remove old VLM-only call. |

## New WebSocket Protocol

```
Browser → Relay (new):
  { type: "canvas_frame", data: "<base64 PNG>" }

Relay → Gemini Live (new):
  gemini.sendRealtimeInput({ video: { data: base64, mimeType: "image/png" } })
```

Existing protocol messages unchanged.

## Error Handling

- **Overshoot captureOnce() fails** — log, skip silently. Next stroke retries.
- **Gemini Flash Lite returns bad JSON** — return empty annotations array. Overlay stays clear.
- **canvas_frame sent while relay reconnecting** — `readyState !== OPEN` guard drops it silently.
- **No Overshoot API key** — Pipeline 1 skipped entirely. App works voice-only.
- **Very fast drawing** — Hash dedup prevents redundant sends on consecutive identical frames.

## What is Removed

- Fixed 0.5s polling timer in `useOvershoot`
- `THROTTLE_MS` (5s) constant in `useVLMAnalysis`
- Continuous `RealtimeVision` session — replaced by single `captureOnce()` calls
- Overshoot LaTeX injection into Gemini Live as text — replaced by direct canvas PNG image frames
