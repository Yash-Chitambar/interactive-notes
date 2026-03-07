"use client";

// ============================================================
// app/page.tsx — PERSON 3 OWNS THIS FILE (main canvas screen)
// Person 4 owns: layout chrome (header, subject selector)
// Person 2 owns: AudioBar integration
// ============================================================

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  KeyboardEvent,
} from "react";
import { v4 as uuidv4 } from "uuid";
import Canvas, { CanvasHandle } from "@/components/Canvas";
import AIOverlay from "@/components/AIOverlay";
import Toast from "@/components/Toast";
import NotesPanel from "@/components/NotesPanel";
import AudioBar from "@/components/AudioBar";
import SubjectSelector from "@/components/SubjectSelector";
import { useVLMAnalysis } from "@/hooks/useVLMAnalysis";
import { useAudioSession } from "@/hooks/useAudioSession";
import { Annotation, Subject } from "@/types";
import Link from "next/link";

const SESSION_ID = uuidv4(); // one session per page load

// Pen colors available in the toolbar
const PEN_COLORS = [
  { value: "#1a1a1a", label: "Black" },
  { value: "#2563EB", label: "Blue" },
  { value: "#DC2626", label: "Red" },
  { value: "#16A34A", label: "Green" },
] as const;

type PenColor = (typeof PEN_COLORS)[number]["value"];

export default function Home() {
  const [subject, setSubject] = useState<Subject>("math");
  const [tutorMode] = useState<"hint" | "answer">("hint");

  // Toolbar state
  const [penColor, setPenColor] = useState<PenColor>("#1a1a1a");
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [isEraser, setIsEraser] = useState(false);

  // Actual canvas pixel dimensions (updated by ResizeObserver on the container)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 900 });

  // Toast state
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  // Uploaded docs (Person 4 wires this to real upload state)
  const [docs] = useState<Parameters<typeof NotesPanel>[0]["docs"]>([]);

  const canvasRef = useRef<CanvasHandle>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Person 2: audio session
  const { isConnected, isListening, isMuted, transcript, toggleMic, toggleMute, sendCanvasSnapshot, sendTextMessage } =
    useAudioSession();

  // Person 3: VLM analysis
  const { annotations, isAnalyzing, lastSummary, analyze, clearAnnotations } =
    useVLMAnalysis({
      subject,
      tutorMode,
      sessionId: SESSION_ID,
      onSnapshot: sendCanvasSnapshot,
    });

  // --- canvas container sizing ---
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({
          width: Math.round(width),
          height: Math.round(height),
        });
      }
    });

    observer.observe(container);
    // Seed with initial size
    const { width, height } = container.getBoundingClientRect();
    setCanvasSize({ width: Math.round(width), height: Math.round(height) });

    return () => observer.disconnect();
  }, []);

  // --- show toast + speak summary when VLM returns feedback ---
  useEffect(() => {
    if (lastSummary && lastSummary.trim() !== "") {
      setToast({ message: lastSummary, key: Date.now() });
      if (isConnected) sendTextMessage(lastSummary);
    }
  }, [lastSummary]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Escape key clears AI overlay ---
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") clearAnnotations();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearAnnotations]);

  // --- prevent iOS/iPad bounce scroll while drawing ---
  useEffect(() => {
    const prevent = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, []);

  // --- stroke end handler ---
  const handleStrokeEnd = useCallback(() => {
    if (canvasRef.current) {
      analyze(canvasRef.current.getSnapshot);
    }
  }, [analyze]);

  // --- per-annotation dismiss ---
  const handleDismissAnnotation = useCallback(
    (index: number) => {
      // We expose clearAnnotations from the hook; for per-index we filter locally.
      // Since annotations is managed inside the hook we replicate the filtered list
      // by calling the hook's clear and re-setting — instead, we keep a local
      // override list here. Simplest correct approach: just clear all on any dismiss
      // (the hook doesn't expose per-index removal). Team can wire up later.
      clearAnnotations();
    },
    [clearAnnotations]
  );

  // --- toolbar helpers ---
  const handleClearCanvas = useCallback(() => {
    canvasRef.current?.clear();
  }, []);

  const handleClearAI = useCallback(() => {
    clearAnnotations();
  }, [clearAnnotations]);

  const handleEraserToggle = useCallback(() => {
    setIsEraser((v) => !v);
  }, []);

  const handlePenColorSelect = useCallback((color: PenColor) => {
    setPenColor(color);
    setIsEraser(false); // selecting a color exits eraser mode
  }, []);

  return (
    <div
      className="flex flex-col bg-gray-50"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <SubjectSelector value={subject} onChange={setSubject} />
          <span className="text-lg font-bold text-gray-800">Study Buddy</span>
        </div>
        <div className="flex items-center gap-2">
          {isAnalyzing && (
            <span className="flex items-center gap-1.5 text-xs text-blue-500">
              {/* Spinner */}
              <svg
                className="animate-spin h-3.5 w-3.5 text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Analyzing...
            </span>
          )}
          <Link
            href="/settings"
            className="text-gray-400 hover:text-gray-700 text-sm px-2 py-1 rounded"
            title="Settings"
          >
            {/* Gear icon via SVG to avoid emoji rendering differences */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-label="Settings"
            >
              <path
                fillRule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <Link
            href="/review"
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200"
          >
            Review
          </Link>
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-white border-b border-gray-100 flex-shrink-0 flex-wrap z-10">
        {/* Pen color swatches */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Pen color">
          {PEN_COLORS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handlePenColorSelect(value as PenColor)}
              title={label}
              aria-pressed={penColor === value && !isEraser}
              className="rounded-full transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                width: 22,
                height: 22,
                backgroundColor: value,
                border:
                  penColor === value && !isEraser
                    ? "2.5px solid #6366f1"
                    : "2px solid transparent",
                boxShadow:
                  penColor === value && !isEraser
                    ? "0 0 0 1.5px white inset"
                    : "0 0 0 1.5px #d1d5db inset",
                transform: penColor === value && !isEraser ? "scale(1.2)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {/* Stroke width */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="stroke-width"
            className="text-xs text-gray-500 whitespace-nowrap"
          >
            Size
          </label>
          <input
            id="stroke-width"
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
            className="w-20 h-1.5 accent-indigo-500 cursor-pointer"
          />
          <span className="text-xs text-gray-400 w-5 text-right">
            {strokeWidth % 1 === 0 ? strokeWidth : strokeWidth.toFixed(1)}
          </span>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-gray-200" />

        {/* Eraser */}
        <button
          onClick={handleEraserToggle}
          aria-pressed={isEraser}
          title="Eraser (toggle)"
          className={[
            "flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors",
            isEraser
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300",
          ].join(" ")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3.707 14.293a1 1 0 010-1.414l8-8a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-5 5a1 1 0 01-.707.293H7a1 1 0 01-.707-.293l-2.586-2.586zM14 13l-3-3-6 6h3l6-6z"
              clipRule="evenodd"
            />
          </svg>
          Eraser
        </button>

        {/* Clear canvas */}
        <button
          onClick={handleClearCanvas}
          title="Clear canvas"
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Clear
        </button>

        {/* Clear AI hints */}
        {annotations.length > 0 && (
          <button
            onClick={handleClearAI}
            title="Clear AI hints (Esc)"
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            Clear hints
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Notes panel (Person 4) */}
        <NotesPanel docs={docs} />

        {/* Center: Canvas + overlay */}
        <div
          ref={canvasContainerRef}
          className="flex-1 relative bg-white overflow-hidden"
        >
          {/* Paper lines (decorative) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(transparent, transparent 31px, #e5e7eb 31px, #e5e7eb 32px)",
              backgroundPositionY: "8px",
            }}
          />

          {/* Student canvas */}
          <Canvas
            ref={canvasRef}
            onStrokeEnd={handleStrokeEnd}
            strokeColor={penColor}
            strokeWidth={strokeWidth}
            isEraser={isEraser}
          />

          {/* AI annotation overlay */}
          <AIOverlay
            annotations={annotations}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            onDismiss={handleDismissAnnotation}
          />
        </div>
      </div>

      {/* ── Audio bar (Person 2) ── */}
      <AudioBar
        transcript={transcript}
        isListening={isListening}
        isConnected={isConnected}
        isMuted={isMuted}
        onToggleMic={toggleMic}
        onToggleMute={toggleMute}
      />

      {/* ── Toast notification ── */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type="info"
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
