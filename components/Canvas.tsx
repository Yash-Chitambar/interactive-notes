"use client";

// ============================================================
// Canvas.tsx — PERSON 3 OWNS THIS FILE
// Drawing canvas with pointer event handling (works for mouse,
// touch, and Apple Pencil in Safari).
// ============================================================

import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";

export interface CanvasHandle {
  getSnapshot: () => string; // returns base64 PNG data URL
  clear: () => void;
  hasStrokes: () => boolean; // true if student has drawn anything
}

interface Point {
  x: number;
  y: number;
}

interface StrokePath {
  color: string;
  width: number;
  isEraser: boolean;
  points: Point[];
}

interface CanvasProps {
  onStrokeEnd?: () => void; // called after 500ms idle — triggers VLM analysis
  strokeColor?: string;     // pen color, default #1a1a1a
  strokeWidth?: number;     // line width in CSS px, default 2.5
  isEraser?: boolean;       // eraser mode
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(
  (
    {
      onStrokeEnd,
      strokeColor = "#1a1a1a",
      strokeWidth = 2.5,
      isEraser = false,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDrawing = useRef(false);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastPos = useRef<Point | null>(null);

    // Full path history so we can redraw after resize
    const pathHistory = useRef<StrokePath[]>([]);
    const currentPath = useRef<StrokePath | null>(null);

    // --- helpers ---

    const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

    const applyContextStyle = useCallback(
      (ctx: CanvasRenderingContext2D, path: StrokePath) => {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (path.isEraser) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = path.color;
        }
        ctx.lineWidth = path.width;
      },
      []
    );

    const redrawAll = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      for (const path of pathHistory.current) {
        if (path.points.length < 2) continue;
        ctx.save();
        applyContextStyle(ctx, path);
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }, [applyContextStyle]);

    // --- canvas sizing with ResizeObserver ---

    const initCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Scaling transform must be re-applied after resizing the canvas element
      ctx.scale(dpr, dpr);
      redrawAll();
    }, [redrawAll]);

    useEffect(() => {
      initCanvas();

      const observer = new ResizeObserver(() => {
        initCanvas();
      });

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      return () => observer.disconnect();
    }, [initCanvas]);

    // --- coordinate helpers ---

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    // --- idle / stroke-end debounce ---

    const triggerIdleTimer = useCallback(() => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        onStrokeEnd?.();
      }, 500);
    }, [onStrokeEnd]);

    // --- pointer handlers ---

    const onPointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        isDrawing.current = true;

        const pos = getPos(e);
        lastPos.current = pos;

        const path: StrokePath = {
          color: strokeColor,
          width: strokeWidth,
          isEraser,
          points: [pos],
        };
        currentPath.current = path;
        pathHistory.current.push(path);

        const ctx = getCtx();
        if (!ctx) return;
        ctx.save();
        applyContextStyle(ctx, path);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        // Draw a dot for single taps
        ctx.arc(pos.x, pos.y, path.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
      [strokeColor, strokeWidth, isEraser, applyContextStyle]
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current || !lastPos.current || !currentPath.current) return;
        e.preventDefault();

        const ctx = getCtx();
        if (!ctx) return;

        const pos = getPos(e);
        currentPath.current.points.push(pos);

        ctx.save();
        applyContextStyle(ctx, currentPath.current);
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();

        lastPos.current = pos;
        triggerIdleTimer();
      },
      [applyContextStyle, triggerIdleTimer]
    );

    const onPointerUp = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        isDrawing.current = false;
        lastPos.current = null;
        currentPath.current = null;
        triggerIdleTimer();
      },
      [triggerIdleTimer]
    );

    // --- imperative handle ---

    useImperativeHandle(ref, () => ({
      hasStrokes: () => pathHistory.current.length > 0,
      getSnapshot: () => {
        const canvas = canvasRef.current;
        if (!canvas) return "";
        // Composite onto a white background so PNG is not transparent
        const offscreen = document.createElement("canvas");
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const ctx = offscreen.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);
        ctx.drawImage(canvas, 0, 0);
        // Return at logical (CSS) resolution by scaling down
        const out = document.createElement("canvas");
        out.width = Math.round(canvas.width / dpr);
        out.height = Math.round(canvas.height / dpr);
        const outCtx = out.getContext("2d")!;
        outCtx.drawImage(offscreen, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      },
      clear: () => {
        pathHistory.current = [];
        currentPath.current = null;
        const canvas = canvasRef.current;
        const ctx = getCtx();
        if (!canvas || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      },
    }));

    return (
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{
            touchAction: "none",
            cursor: isEraser ? "cell" : "crosshair",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    );
  }
);

Canvas.displayName = "Canvas";
export default Canvas;
