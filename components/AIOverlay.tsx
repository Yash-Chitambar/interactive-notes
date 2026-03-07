"use client";

// ============================================================
// AIOverlay.tsx — PERSON 3 OWNS THIS FILE
// Renders AI annotations on top of the canvas.
// Pointer-events: none so it doesn't interfere with drawing.
// ============================================================

import { Annotation } from "@/types";

interface AIOverlayProps {
  annotations: Annotation[];
  canvasWidth: number;
  canvasHeight: number;
}

const TYPE_COLORS = {
  error: "#EF4444",
  hint: "#3B82F6",
  praise: "#22C55E",
} as const;

export default function AIOverlay({ annotations, canvasWidth, canvasHeight }: AIOverlayProps) {
  if (annotations.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      preserveAspectRatio="none"
    >
      {annotations.map((ann, i) => {
        const [x, y, w, h] = ann.bbox;
        const color = TYPE_COLORS[ann.type];

        return (
          <g key={i}>
            {/* Bounding box highlight */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={`${color}15`}
              stroke={color}
              strokeWidth="2"
              rx="3"
              className="animate-pulse"
            />
            {/* Annotation label */}
            <foreignObject x={x} y={y - 28} width={Math.max(w, 200)} height={28}>
              <div
                style={{
                  background: color,
                  color: "white",
                  fontSize: "12px",
                  fontFamily: "sans-serif",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  display: "inline-block",
                  maxWidth: "100%",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {ann.type === "error" ? "✗" : ann.type === "hint" ? "💡" : "✓"} {ann.text}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
