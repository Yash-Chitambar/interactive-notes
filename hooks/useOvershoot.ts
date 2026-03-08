"use client";

// ============================================================
// hooks/useOvershoot.ts
// Real-time screen vision using Overshoot SDK.
// Runs continuously while active, buffering the latest LaTeX
// extraction into a ref. Stroke-end reads the buffer on demand.
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
    visionRef.current     = null;
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
