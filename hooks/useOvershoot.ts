"use client";

// ============================================================
// hooks/useOvershoot.ts
// Real-time camera vision using Overshoot SDK.
// Points the device camera at the student's work and streams
// observations to the onResult callback (wired to Gemini Live).
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

// Dynamic import so the SSR build doesn't choke on browser APIs.
type RealtimeVisionType = import("overshoot").RealtimeVision;

const OVERSHOOT_API_KEY =
  process.env.NEXT_PUBLIC_OVERSHOOT_API_KEY ?? "";

const OVERSHOOT_MODEL = "Qwen/Qwen3-VL-8B-Instruct"; // great for OCR / handwriting

function buildPrompt(subject: string): string {
  return (
    `You are watching a student's handwritten ${subject} work via their camera. ` +
    `Briefly describe any visible errors, unclear steps, or areas of confusion in 1-2 sentences. ` +
    `If the work looks correct or there is nothing to comment on, say "looks good". ` +
    `Be concise and Socratic — hint, don't reveal answers.`
  );
}

interface UseOvershootOptions {
  subject: string;
  onResult: (text: string) => void;
}

export function useOvershoot({ subject, onResult }: UseOvershootOptions) {
  const [isActive, setIsActive] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [lastResult, setLastResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const visionRef = useRef<RealtimeVisionType | null>(null);
  const subjectRef = useRef(subject);
  const onResultRef = useRef(onResult);

  // Keep refs in sync so we don't stale-close over them
  useEffect(() => { subjectRef.current = subject; }, [subject]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const startCamera = useCallback(async () => {
    if (!OVERSHOOT_API_KEY) {
      setError("NEXT_PUBLIC_OVERSHOOT_API_KEY is not set");
      console.error("[useOvershoot] Missing NEXT_PUBLIC_OVERSHOOT_API_KEY");
      return;
    }
    if (visionRef.current?.isActive()) return;

    setError(null);

    try {
      const { RealtimeVision } = await import("overshoot");

      const vision = new RealtimeVision({
        apiKey: OVERSHOOT_API_KEY,
        source: { type: "camera", cameraFacing: "environment" },
        model: OVERSHOOT_MODEL,
        prompt: buildPrompt(subjectRef.current),
        mode: "frame",
        frameProcessing: { interval_seconds: 2 },
        maxOutputTokens: 100,
        onResult: (r) => {
          if (r.ok && r.result && r.result !== "looks good") {
            const text = r.result.trim();
            setLastResult(text);
            onResultRef.current(text);
          }
        },
        onError: (err) => {
          console.error("[useOvershoot] Error:", err);
          setError(err.message);
          setIsActive(false);
          setMediaStream(null);
          visionRef.current = null;
        },
      });

      await vision.start();
      visionRef.current = vision;
      setIsActive(true);

      const stream = vision.getMediaStream();
      if (stream) setMediaStream(stream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[useOvershoot] Failed to start:", msg);
      setError(msg);
    }
  }, []);

  const stopCamera = useCallback(async () => {
    if (!visionRef.current) return;
    await visionRef.current.stop();
    visionRef.current = null;
    setIsActive(false);
    setMediaStream(null);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (isActive) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  // Update prompt live when subject changes
  useEffect(() => {
    if (visionRef.current?.isActive()) {
      visionRef.current.updatePrompt(buildPrompt(subject)).catch(console.warn);
    }
  }, [subject]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      visionRef.current?.stop().catch(() => {});
    };
  }, []);

  return { isActive, mediaStream, lastResult, error, toggleCamera, startCamera, stopCamera };
}
