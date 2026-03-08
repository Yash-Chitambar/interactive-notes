"use client";

import { useState, useCallback } from "react";

export interface SimilarProblemResult {
  similar_problem: string | null;
  source: string | null;
  topic: string | null;
  why_similar: string | null;
  source_url: string | null;
  image: string | null; // base64 PNG
  error?: string;
}

export function useSimilarProblems() {
  const [result, setResult] = useState<SimilarProblemResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findSimilar = useCallback(async (problemDescription: string) => {
    if (!problemDescription.trim()) return;

    setIsSearching(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/similar-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem_description: problemDescription }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to find similar problems");
      }

      const data: SimilarProblemResult = await res.json();
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      return null;
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isSearching, error, findSimilar, clear };
}
