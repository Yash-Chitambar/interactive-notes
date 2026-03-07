"use client";

// ============================================================
// hooks/useOvershoot.ts
// Real-time screen vision using Overshoot SDK.
// Reads the student's handwritten drawing from the screen,
// converts equations to LaTeX, and sends the extracted text
// to Gemini for reasoning. This is the only vision layer.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

// Dynamic import so the SSR build doesn't choke on browser APIs.
type RealtimeVisionType = import("overshoot").RealtimeVision;

const OVERSHOOT_API_KEY =
  process.env.NEXT_PUBLIC_OVERSHOOT_API_KEY ?? "";

const OVERSHOOT_MODEL = "Qwen/Qwen3.5-9B";
const OVERSHOOT_PROMPT =
  "Read all the handwritten text, convert equations to latex, and ignore everything else";

interface UseOvershootOptions {
  onResult: (text: string) => void;
}

export function useOvershoot({ onResult }: UseOvershootOptions) {
  const [isActive, setIsActive] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const visionRef = useRef<RealtimeVisionType | null>(null);
  const onResultRef = useRef(onResult);

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
        prompt: OVERSHOOT_PROMPT,
        model: OVERSHOOT_MODEL,
        source: { type: "screen" },
        mode: "frame",
        frameProcessing: { interval_seconds: 0.5 },
        onResult: (r) => {
          if (r.ok && r.result) {
            const text = r.result.trim();
            if (text) {
              setLastResult(text);
              onResultRef.current(text);
            }
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
    visionRef.current = null;
    setIsActive(false);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (isActive) {
      await stopCamera();
    } else {
      await startCamera();
    }
  }, [isActive, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      visionRef.current?.stop().catch(() => {});
    };
  }, []);

  return { isActive, lastResult, error, toggleCamera, startCamera, stopCamera };
}
