"use client";

// ============================================================
// AIOverlay.tsx — PERSON 3 OWNS THIS FILE
// Renders AI annotations on top of the canvas as an SVG layer.
// Pointer-events: none so it doesn't interfere with drawing.
// ============================================================

import { Annotation } from "@/types";

interface AIOverlayProps {
  annotations: Annotation[];
  canvasWidth: number;
  canvasHeight: number;
  onDismiss?: (index: number) => void;
}

const TYPE_COLORS: Record<Annotation["type"], string> = {
  error: "#EF4444",
  hint: "#3B82F6",
  praise: "#22C55E",
};

const TYPE_ICON: Record<Annotation["type"], string> = {
  error: "✕",
  hint: "?",
  praise: "✓",
};

// How many characters fit comfortably in the label before we truncate
const MAX_LABEL_CHARS = 55;

function truncate(text: string): string {
  return text.length > MAX_LABEL_CHARS
    ? text.slice(0, MAX_LABEL_CHARS - 1) + "…"
    : text;
}

export default function AIOverlay({
  annotations,
  canvasWidth,
  canvasHeight,
  onDismiss,
}: AIOverlayProps) {
  if (annotations.length === 0) return null;

  // Label height in viewBox units
  const LABEL_H = 26;
  // Approximate char width in viewBox units at font-size 12
  const CHAR_W = 7;
  // Padding inside label pill
  const PAD_X = 10;
  const ICON_W = 18;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      preserveAspectRatio="none"
    >
      <style>{`
        @keyframes ai-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .ai-annotation {
          animation: ai-fade-in 300ms ease-out both;
        }
        .ai-dismiss {
          pointer-events: all;
          cursor: pointer;
        }
        .ai-dismiss:hover circle {
          opacity: 0.85;
        }
      `}</style>

      {annotations.map((ann, i) => {
        const [x, y, w, h] = ann.bbox;
        const color = TYPE_COLORS[ann.type];
        const icon = TYPE_ICON[ann.type];
        const label = truncate(ann.text);

        // Label pill dimensions
        const labelW = Math.max(w, PAD_X + ICON_W + label.length * CHAR_W + PAD_X);
        // Keep label above the bbox; clamp so it doesn't go above the viewBox
        const labelY = Math.max(0, y - LABEL_H - 4);
        // Clamp label left so it doesn't overflow right edge
        const labelX = Math.min(x, canvasWidth - labelW - 4);

        // Dismiss button sits at top-right of the label pill
        const dismissCX = labelX + labelW - LABEL_H / 2;
        const dismissCY = labelY + LABEL_H / 2;

        return (
          <g
            key={i}
            className="ai-annotation"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {/* Bounding box */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={`${color}18`}
              stroke={color}
              strokeWidth="2"
              strokeDasharray="6 3"
              rx="4"
            />

            {/* Label pill background */}
            <rect
              x={labelX}
              y={labelY}
              width={labelW}
              height={LABEL_H}
              fill={color}
              rx="5"
            />

            {/* Icon character */}
            <text
              x={labelX + PAD_X}
              y={labelY + LABEL_H / 2 + 1}
              dominantBaseline="middle"
              fontFamily="system-ui, sans-serif"
              fontSize="11"
              fontWeight="700"
              fill="white"
            >
              {icon}
            </text>

            {/* Annotation text */}
            <text
              x={labelX + PAD_X + ICON_W}
              y={labelY + LABEL_H / 2 + 1}
              dominantBaseline="middle"
              fontFamily="system-ui, sans-serif"
              fontSize="12"
              fill="white"
            >
              {label}
            </text>

            {/* Connector line from label to bbox */}
            <line
              x1={labelX + labelW / 2}
              y1={labelY + LABEL_H}
              x2={x + w / 2}
              y2={y}
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.6"
            />

            {/* Dismiss button (only rendered when onDismiss is provided) */}
            {onDismiss && (
              <g
                className="ai-dismiss"
                onClick={() => onDismiss(i)}
                aria-label="Dismiss annotation"
              >
                <circle
                  cx={dismissCX}
                  cy={dismissCY}
                  r={9}
                  fill="rgba(0,0,0,0.35)"
                />
                <text
                  x={dismissCX}
                  y={dismissCY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="system-ui, sans-serif"
                  fontSize="11"
                  fontWeight="700"
                  fill="white"
                  style={{ userSelect: "none" }}
                >
                  ✕
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
