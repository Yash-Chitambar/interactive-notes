"use client";

// ============================================================
// useChromaSearch.ts — PERSON 1 OWNS THIS FILE
// Client-side hook to search ChromaDB for relevant note chunks.
// ============================================================

import { useState, useCallback } from "react";
import { ContextChunk } from "@/types";

export function useChromaSearch() {
  const [chunks, setChunks] = useState<ContextChunk[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(async (query: string, k = 5) => {
    if (!query.trim()) return [];
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&k=${k}`);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      const data: ContextChunk[] = await res.json();
      setChunks(data);
      return data;
    } catch (err) {
      console.error("[useChromaSearch]", err);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  return { chunks, isSearching, search };
}
