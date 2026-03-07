"use client";

import { useState, useCallback, useRef, Dispatch, SetStateAction } from "react";

export interface StrokePath {
  color: string;
  width: number;
  isEraser: boolean;
  points: { x: number; y: number }[];
}

interface UsePDFReturn {
  pdfFile: File | null;
  pageNumber: number;
  totalPages: number;
  setTotalPages: Dispatch<SetStateAction<number>>;
  loadPDF: (file: File) => void;
  clearPDF: () => void;
  goNext: () => void;
  goPrev: () => void;
  savePageStrokes: (pageNum: number, strokes: StrokePath[]) => void;
  getPageStrokes: (pageNum: number) => StrokePath[];
}

export function usePDF(): UsePDFReturn {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const strokeMap = useRef<Map<number, StrokePath[]>>(new Map());
  // Keep a ref to totalPages so goNext closure is always fresh
  const totalPagesRef = useRef(0);

  const handleSetTotalPages: Dispatch<SetStateAction<number>> = useCallback((val) => {
    setTotalPages((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      totalPagesRef.current = next;
      return next;
    });
  }, []);

  const loadPDF = useCallback((file: File) => {
    strokeMap.current = new Map();
    setPdfFile(file);
    setPageNumber(1);
    totalPagesRef.current = 0;
    setTotalPages(0);
  }, []);

  const clearPDF = useCallback(() => {
    strokeMap.current = new Map();
    setPdfFile(null);
    setPageNumber(1);
    totalPagesRef.current = 0;
    setTotalPages(0);
  }, []);

  const goNext = useCallback(() => {
    setPageNumber((n) => Math.min(n + 1, totalPagesRef.current));
  }, []);

  const goPrev = useCallback(() => {
    setPageNumber((n) => Math.max(n - 1, 1));
  }, []);

  const savePageStrokes = useCallback((pageNum: number, strokes: StrokePath[]) => {
    strokeMap.current.set(pageNum, [...strokes]);
  }, []);

  const getPageStrokes = useCallback((pageNum: number): StrokePath[] => {
    return strokeMap.current.get(pageNum) ?? [];
  }, []);

  return {
    pdfFile,
    pageNumber,
    totalPages,
    setTotalPages: handleSetTotalPages,
    loadPDF,
    clearPDF,
    goNext,
    goPrev,
    savePageStrokes,
    getPageStrokes,
  };
}
