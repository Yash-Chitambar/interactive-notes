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
  onSnapshot?: (base64: string) => void; // Person 2 uses this to inject into Gemini Live
}

export function useVLMAnalysis({ subject, tutorMode, sessionId, onSnapshot }: UseVLMAnalysisOptions) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const lastImageHash = useRef<string | null>(null);
  const lastAnalyzedAt = useRef<number>(0);

  const DEBOUNCE_MS = 5000; // minimum 5s between API calls

  const analyze = useCallback(
    async (getSnapshot: () => string) => {
      const now = Date.now();
      if (now - lastAnalyzedAt.current < DEBOUNCE_MS) return;

      const image = getSnapshot();
      if (!image || image === "data:,") return;

      // Skip if canvas hasn't changed
      if (image === lastImageHash.current) return;
      lastImageHash.current = image;
      lastAnalyzedAt.current = now;

      // Let Person 2's audio session know about the new snapshot
      onSnapshot?.(image);

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
        });

        if (!res.ok) throw new Error(`analyze failed: ${res.status}`);

        const data: AnnotationResponse = await res.json();
        setAnnotations(data.annotations ?? []);
        setLastSummary(data.summary ?? null);
      } catch (err) {
        console.error("[useVLMAnalysis]", err);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [subject, tutorMode, sessionId, onSnapshot]
  );

  const clearAnnotations = useCallback(() => setAnnotations([]), []);

  return { annotations, isAnalyzing, lastSummary, analyze, clearAnnotations };
}
