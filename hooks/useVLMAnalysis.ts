"use client";

// ============================================================
// useVLMAnalysis.ts — PERSON 3 OWNS THIS FILE
// Sends canvas snapshot to /api/analyze, returns annotations.
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

const THROTTLE_MS = 5_000; // minimum gap between API calls

export function useVLMAnalysis({ subject, tutorMode, sessionId }: UseVLMAnalysisOptions) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const lastCalledAt = useRef<number>(0);
  const lastImageHash = useRef<number | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (getSnapshot: () => string) => {
      const now = Date.now();

      // Throttle: don't call within THROTTLE_MS of the last call
      if (now - lastCalledAt.current < THROTTLE_MS) return;

      const image = getSnapshot();
      if (!image || image === "data:," || image === "") return;

      // Skip if canvas content hasn't changed since last successful call
      const hash = hashString(image);
      if (hash === lastImageHash.current) return;

      // Cancel any in-flight request before starting a new one
      abortCtrlRef.current?.abort();
      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      lastCalledAt.current = now;
      lastImageHash.current = hash;

      setIsAnalyzing(true);
      try {
        const body: AnalyzeRequest = {
          image,
          subject,
          session_id: sessionId,
          tutor_mode: tutorMode,
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
        if (err instanceof Error && err.name === "AbortError") {
          // Request was intentionally cancelled — not an error
          return;
        }
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
