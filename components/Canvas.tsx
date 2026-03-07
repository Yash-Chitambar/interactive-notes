"use client";

// ============================================================
// Canvas.tsx — PERSON 3 OWNS THIS FILE
// Drawing canvas with pointer event handling (works for mouse,
// touch, and Apple Pencil in Safari).
// ============================================================

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

export interface CanvasHandle {
  getSnapshot: () => string; // returns base64 PNG data URL
  clear: () => void;
}

interface CanvasProps {
  onStrokeEnd?: () => void; // called after 500ms idle — triggers VLM analysis
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ onStrokeEnd }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Set up canvas with correct DPR scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const triggerIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      onStrokeEnd?.();
    }, 500);
  }, [onStrokeEnd]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPos.current) return;
    e.preventDefault();

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    triggerIdleTimer();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = false;
    lastPos.current = null;
    triggerIdleTimer();
  };

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      return canvasRef.current?.toDataURL("image/png") ?? "";
    },
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      ctx?.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
});

Canvas.displayName = "Canvas";
export default Canvas;
