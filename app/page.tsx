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
import { useOvershoot } from "@/hooks/useOvershoot";
import { Annotation, AnnotationResponse, Subject } from "@/types";
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

type AskRect = { x: number; y: number; w: number; h: number };

export default function Home() {
  const [subject, setSubject] = useState<Subject>("math");
  const [tutorMode] = useState<"hint" | "answer">("hint");

  // Toolbar state
  const [penColor, setPenColor] = useState<PenColor>("#1a1a1a");
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [isEraser, setIsEraser] = useState(false);
  const [isAskMode, setIsAskMode] = useState(false);
  const [askRect, setAskRect] = useState<AskRect | null>(null);
  const [askDraft, setAskDraft] = useState("");
  const [isAskSubmitting, setIsAskSubmitting] = useState(false);

  // Actual canvas pixel dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 900 });

  // Toast state
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  // Uploaded docs (Person 4 wires this to real upload state)
  const [docs] = useState<Parameters<typeof NotesPanel>[0]["docs"]>([]);

  const canvasRef = useRef<CanvasHandle>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const askDragRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const lastSpokenAt = useRef<number>(0);
  // Person 2: audio session
  const { isConnected, isListening, isMuted, isSpeaking, transcript, toggleMic, toggleMute, sendTextMessage } =
    useAudioSession();

  // Overshoot: buffers latest screen text; consumed on stroke-end
  const { isActive: isCameraActive, toggleCamera, getLatestText } = useOvershoot();

  // Person 3: VLM analysis
  const { annotations, isAnalyzing, lastSummary, analyze, clearAnnotations, applyResult } =
    useVLMAnalysis({
      subject,
      tutorMode,
      sessionId: SESSION_ID,
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

  // --- show toast; speak summary only when there's an error/hint and 30s have passed ---
  useEffect(() => {
    if (!lastSummary || lastSummary.trim() === "") return;
    setToast({ message: lastSummary, key: Date.now() });

    const hasIssue = annotations.some((a) => a.type === "error" || a.type === "hint");
    const now = Date.now();
    if (hasIssue && isConnected && !isSpeaking && now - lastSpokenAt.current > 30_000) {
      lastSpokenAt.current = now;
      sendTextMessage(lastSummary);
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
    if (isSpeaking) return;
    if (!canvasRef.current?.hasStrokes()) return;

    if (canvasRef.current) {
      const overshootText = isCameraActive ? getLatestText() : undefined;
      analyze(canvasRef.current.getSnapshot, overshootText);
    }
  }, [analyze, isSpeaking, isCameraActive, getLatestText]);

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
    clearAnnotations();
  }, [clearAnnotations]);

  const handleClearAI = useCallback(() => {
    clearAnnotations();
  }, [clearAnnotations]);

  const handleEraserToggle = useCallback(() => {
    setIsEraser((v) => !v);
  }, []);

  const handlePenColorSelect = useCallback((color: PenColor) => {
    setPenColor(color);
    setIsEraser(false);
  }, []);

  const handleAskToggle = useCallback(() => {
    setIsAskMode((prev) => {
      const next = !prev;
      if (!next) {
        setAskRect(null);
        setAskDraft("");
        askDragRef.current = null;
      }
      return next;
    });
    setIsEraser(false);
  }, []);

  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const container = canvasContainerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(clientY - rect.top, 0), rect.height),
    };
  }, []);

  const handleAskPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isAskMode) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-ask-ui]")) return;
      e.preventDefault();
      const pos = getCanvasPos(e.clientX, e.clientY);
      if (!pos) return;
      askDragRef.current = { startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y };
      setAskRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      setAskDraft("");
    },
    [isAskMode, getCanvasPos]
  );

  const handleAskPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isAskMode || !askDragRef.current) return;
      e.preventDefault();
      const pos = getCanvasPos(e.clientX, e.clientY);
      if (!pos) return;
      askDragRef.current.currentX = pos.x;
      askDragRef.current.currentY = pos.y;
      const { startX, startY, currentX, currentY } = askDragRef.current;
      setAskRect({
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        w: Math.abs(currentX - startX),
        h: Math.abs(currentY - startY),
      });
    },
    [isAskMode, getCanvasPos]
  );

  const handleAskPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isAskMode || !askDragRef.current || !askRect) return;
      e.preventDefault();
      askDragRef.current = null;
      const MIN = 10;
      if (askRect.w < MIN || askRect.h < MIN) setAskRect(null);
    },
    [isAskMode, askRect]
  );

  const cropSnapshotToRect = useCallback(
    async (rect: AskRect): Promise<string | null> => {
      if (!canvasRef.current) return null;
      const snapshot = canvasRef.current.getSnapshot();
      if (!snapshot) return null;
      const img = new Image();
      img.src = snapshot;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load canvas snapshot"));
      });
      const scaleX = img.width / canvasSize.width;
      const scaleY = img.height / canvasSize.height;
      const sx = rect.x * scaleX;
      const sy = rect.y * scaleY;
      const sw = Math.max(1, rect.w * scaleX);
      const sh = Math.max(1, rect.h * scaleY);
      const out = document.createElement("canvas");
      out.width = Math.round(sw);
      out.height = Math.round(sh);
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
    [canvasSize.width, canvasSize.height]
  );

  const handleAskCancel = useCallback(() => {
    setIsAskMode(false);
    setAskRect(null);
    setAskDraft("");
    askDragRef.current = null;
  }, []);

  const handleAskSubmit = useCallback(async () => {
    if (!askRect || !askDraft.trim()) return;
    const question = askDraft.trim();
    setIsAskSubmitting(true);
    try {
      const croppedImage = await cropSnapshotToRect(askRect);
      if (!croppedImage) {
        setToast({ message: "Could not capture region.", key: Date.now() });
        return;
      }
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: croppedImage,
          subject,
          session_id: SESSION_ID,
          tutor_mode: tutorMode,
          question,
        }),
      });
      if (!res.ok) {
        setToast({ message: `Analysis failed: ${res.status}`, key: Date.now() });
        return;
      }
      const data: AnnotationResponse = await res.json();
      const mapped: AnnotationResponse = {
        ...data,
        annotations: (data.annotations ?? []).map((ann) => ({
          ...ann,
          bbox: [ann.bbox[0] + askRect.x, ann.bbox[1] + askRect.y, ann.bbox[2], ann.bbox[3]],
        })),
      };
      applyResult(mapped);
      if (data.summary?.trim()) {
        setToast({ message: data.summary, key: Date.now() });
        if (isConnected) sendTextMessage(data.summary);
      }
      setIsAskMode(false);
      setAskRect(null);
      setAskDraft("");
      askDragRef.current = null;
    } catch (err) {
      console.error("Ask region error:", err);
      setToast({ message: "Something went wrong. Try again.", key: Date.now() });
    } finally {
      setIsAskSubmitting(false);
    }
  }, [
    askRect,
    askDraft,
    cropSnapshotToRect,
    subject,
    tutorMode,
    applyResult,
    isConnected,
    sendTextMessage,
  ]);

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

        {/* Ask: draw a box and ask a question about that region */}
        <button
          type="button"
          onClick={handleAskToggle}
          aria-pressed={isAskMode}
          title="Draw a box around an area, then ask a question about it"
          className={[
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors flex-shrink-0",
            isAskMode
              ? "bg-violet-100 border-violet-400 text-violet-800 font-medium"
              : "bg-white border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50/50",
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
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-.A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          Ask
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

          {/* Ask mode: draw bounding box then type question; screenshot of box + question sent to Gemini */}
          <div
            className="absolute inset-0"
            style={{
              pointerEvents: isAskMode ? "auto" : "none",
              cursor: isAskMode ? "crosshair" : "default",
            }}
            onPointerDown={handleAskPointerDown}
            onPointerMove={handleAskPointerMove}
            onPointerUp={handleAskPointerUp}
            onPointerLeave={handleAskPointerUp}
          >
            {askRect && askRect.w >= 10 && askRect.h >= 10 && (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: askRect.x,
                    top: askRect.y,
                    width: askRect.w,
                    height: askRect.h,
                    borderRadius: 4,
                    border: "2px solid rgba(129, 140, 248, 0.9)",
                    backgroundColor: "rgba(129, 140, 248, 0.08)",
                  }}
                />
                <div
                  data-ask-ui
                  style={{
                    position: "absolute",
                    left: Math.min(Math.max(askRect.x, 8), Math.max(8, canvasSize.width - 280)),
                    top: Math.max(8, askRect.y - 88),
                    maxWidth: 280,
                  }}
                  className="z-20"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="rounded-lg bg-white shadow-lg border border-gray-200 p-2.5 space-y-1.5">
                    <div className="text-[11px] text-gray-500">Ask about this region</div>
                    <textarea
                      rows={2}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400 resize-none"
                      placeholder="Type your question…"
                      value={askDraft}
                      onChange={(e) => setAskDraft(e.target.value)}
                      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAskSubmit();
                        }
                      }}
                    />
                    <div className="flex justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={handleAskCancel}
                        className="px-2.5 py-1 text-[11px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAskSubmit()}
                        disabled={!askDraft.trim() || isAskSubmitting}
                        className={`px-3 py-1 text-[11px] rounded text-white ${
                          askDraft.trim() && !isAskSubmitting
                            ? "bg-violet-500 hover:bg-violet-600"
                            : "bg-violet-300 cursor-not-allowed"
                        }`}
                      >
                        {isAskSubmitting ? "Sending…" : "Ask"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Audio bar (Person 2) ── */}
      <AudioBar
        transcript={transcript}
        isConnected={isConnected}
        isListening={isListening}
        isMuted={isMuted}
        isSpeaking={isSpeaking}
        isCameraActive={isCameraActive}
        onToggleMic={toggleMic}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
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
