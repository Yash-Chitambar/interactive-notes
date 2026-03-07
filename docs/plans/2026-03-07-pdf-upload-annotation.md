# PDF Upload + Annotation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a PDF upload button that renders the PDF as a background behind the drawing canvas, supports multi-page navigation with per-page annotation storage, and composites the PDF + strokes into the VLM snapshot.

**Architecture:** `pdfjs-dist` renders PDF pages client-side onto a background `<canvas>`. A `PDFBackground` component owns that canvas and exposes a ref so the parent can grab the raw canvas for compositing. `Canvas.tsx` gains `getStrokes`/`restoreStrokes` on its handle and an optional `backgroundCanvas` prop used in `getSnapshot`. `usePDF` hook manages document state, page number, and per-page stroke maps. `app/page.tsx` wires everything together.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, `pdfjs-dist` (client-side PDF rendering)

---

### Task 1: Install pdfjs-dist

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

```bash
cd /Users/marknour/Desktop/repos/interactive-tutor
npm install pdfjs-dist
```

**Step 2: Verify installation**

```bash
node -e "require('pdfjs-dist'); console.log('ok')"
```

Expected: prints `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdfjs-dist dependency"
```

---

### Task 2: Create `hooks/usePDF.ts`

**Files:**
- Create: `hooks/usePDF.ts`

**Step 1: Write the hook**

```typescript
// hooks/usePDF.ts
"use client";

import { useState, useCallback, useRef } from "react";

// StrokePath must match the shape used in Canvas.tsx
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
  loadPDF: (file: File) => void;
  clearPDF: () => void;
  goNext: () => void;
  goPrev: () => void;
  // Called by page.tsx before/after navigation to save+restore strokes
  savePageStrokes: (pageNum: number, strokes: StrokePath[]) => void;
  getPageStrokes: (pageNum: number) => StrokePath[];
}

export function usePDF(): UsePDFReturn {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  // Map from pageNumber → strokes drawn on that page
  const strokeMap = useRef<Map<number, StrokePath[]>>(new Map());

  const loadPDF = useCallback((file: File) => {
    strokeMap.current = new Map();
    setPdfFile(file);
    setPageNumber(1);
    // totalPages is set by PDFBackground via onPageCount callback
    setTotalPages(0);
  }, []);

  const clearPDF = useCallback(() => {
    strokeMap.current = new Map();
    setPdfFile(null);
    setPageNumber(1);
    setTotalPages(0);
  }, []);

  const goNext = useCallback(() => {
    setPageNumber((n) => Math.min(n + 1, totalPages));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setPageNumber((n) => Math.max(n - 1, 1));
  }, []);

  const savePageStrokes = useCallback((pageNum: number, strokes: StrokePath[]) => {
    strokeMap.current.set(pageNum, strokes);
  }, []);

  const getPageStrokes = useCallback((pageNum: number): StrokePath[] => {
    return strokeMap.current.get(pageNum) ?? [];
  }, []);

  return {
    pdfFile,
    pageNumber,
    totalPages,
    loadPDF,
    clearPDF,
    goNext,
    goPrev,
    savePageStrokes,
    getPageStrokes,
  };
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/marknour/Desktop/repos/interactive-tutor
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to this file)

**Step 3: Commit**

```bash
git add hooks/usePDF.ts
git commit -m "feat: add usePDF hook for PDF state and per-page stroke storage"
```

---

### Task 3: Create `components/PDFBackground.tsx`

**Files:**
- Create: `components/PDFBackground.tsx`

**Step 1: Write the component**

```typescript
// components/PDFBackground.tsx
"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Point the worker at the CDN so it's not bundled into the main chunk
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface PDFBackgroundHandle {
  getPageCanvas: () => HTMLCanvasElement | null;
}

interface PDFBackgroundProps {
  file: File;
  pageNumber: number;
  onPageCount: (total: number) => void;
}

const PDFBackground = forwardRef<PDFBackgroundHandle, PDFBackgroundProps>(
  ({ file, pageNumber, onPageCount }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Hold the loaded PDF document across renders
    const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
    // Track the current render task so we can cancel on re-render
    const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

    useImperativeHandle(ref, () => ({
      getPageCanvas: () => canvasRef.current,
    }));

    // Load the PDF document whenever the file changes
    useEffect(() => {
      let cancelled = false;
      const arrayBuffer = file.arrayBuffer().then(async (buf) => {
        if (cancelled) return;
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        onPageCount(doc.numPages);
      });
      return () => {
        cancelled = true;
        pdfDocRef.current?.destroy();
        pdfDocRef.current = null;
      };
    }, [file, onPageCount]);

    const renderPage = useCallback(async () => {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!doc || !canvas || !container) return;

      // Cancel any in-progress render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await doc.getPage(pageNumber);
      const { width: containerW, height: containerH } = container.getBoundingClientRect();
      if (containerW === 0 || containerH === 0) return;

      const dpr = window.devicePixelRatio || 1;
      // Scale the PDF viewport to fit inside the container (letterbox)
      const unscaledVP = page.getViewport({ scale: 1 });
      const scale = Math.min(containerW / unscaledVP.width, containerH / unscaledVP.height);
      const viewport = page.getViewport({ scale });

      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e: unknown) {
        // Cancelled renders throw — ignore
        if ((e as { name?: string })?.name !== "RenderingCancelledException") throw e;
      }
    }, [pageNumber]);

    // Re-render whenever doc is loaded or page changes
    useEffect(() => {
      const interval = setInterval(() => {
        if (pdfDocRef.current) {
          clearInterval(interval);
          renderPage();
        }
      }, 50);
      return () => clearInterval(interval);
    }, [renderPage, file]);

    return (
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gray-100"
      >
        <canvas ref={canvasRef} className="shadow-md" />
      </div>
    );
  }
);

PDFBackground.displayName = "PDFBackground";
export default PDFBackground;
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to this file

**Step 3: Commit**

```bash
git add components/PDFBackground.tsx
git commit -m "feat: add PDFBackground component using pdfjs-dist"
```

---

### Task 4: Extend `Canvas.tsx` — add `getStrokes`, `restoreStrokes`, and `backgroundCanvas` prop

**Files:**
- Modify: `components/Canvas.tsx`

**Step 1: Read the current file first, then apply these changes**

1a. Add `getStrokes` and `restoreStrokes` to the `CanvasHandle` interface (after line 20):

```typescript
export interface CanvasHandle {
  getSnapshot: () => string;
  clear: () => void;
  getStrokes: () => StrokePath[];
  restoreStrokes: (strokes: StrokePath[]) => void;
}
```

1b. Add `backgroundCanvas` to `CanvasProps` (after `isEraser?: boolean;`):

```typescript
  backgroundCanvas?: HTMLCanvasElement | null;
```

1c. Add `backgroundCanvas = null` to the destructured props in the `forwardRef` callback.

1d. Update `getSnapshot` in `useImperativeHandle` to composite the background first when provided. Replace the existing `getSnapshot` implementation with:

```typescript
getSnapshot: () => {
  const canvas = canvasRef.current;
  if (!canvas) return "";
  const dpr = window.devicePixelRatio || 1;
  const logicalW = Math.round(canvas.width / dpr);
  const logicalH = Math.round(canvas.height / dpr);

  const out = document.createElement("canvas");
  out.width = logicalW;
  out.height = logicalH;
  const ctx = out.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Draw PDF page if present (centered, same as PDFBackground renders it)
  if (backgroundCanvas) {
    const bgW = backgroundCanvas.width / dpr;
    const bgH = backgroundCanvas.height / dpr;
    const x = (logicalW - bgW) / 2;
    const y = (logicalH - bgH) / 2;
    ctx.drawImage(backgroundCanvas, x, y, bgW, bgH);
  }

  // Draw strokes on top (scale from physical to logical)
  ctx.drawImage(canvas, 0, 0, logicalW, logicalH);

  return out.toDataURL("image/png");
},
```

1e. Add `getStrokes` and `restoreStrokes` to the `useImperativeHandle` return object:

```typescript
getStrokes: () => [...pathHistory.current],
restoreStrokes: (strokes: StrokePath[]) => {
  pathHistory.current = strokes;
  redrawAll();
},
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add components/Canvas.tsx
git commit -m "feat: extend Canvas handle with getStrokes/restoreStrokes and backgroundCanvas prop"
```

---

### Task 5: Wire everything in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add imports at the top of the file**

Add after the existing imports:

```typescript
import { useRef as usePDFBgRef } from "react"; // already imported, just alias
import PDFBackground, { PDFBackgroundHandle } from "@/components/PDFBackground";
import { usePDF } from "@/hooks/usePDF";
```

Note: `useRef` is already imported. Add a new ref variable in the component body and a new import for `PDFBackground` and `usePDF`.

**Step 2: Add state/refs in the component body** (after `canvasRef`):

```typescript
const pdfBgRef = useRef<PDFBackgroundHandle>(null);
const pdfFileInputRef = useRef<HTMLInputElement>(null);

const {
  pdfFile,
  pageNumber,
  totalPages,
  loadPDF,
  clearPDF,
  goNext,
  goPrev,
  savePageStrokes,
  getPageStrokes,
} = usePDF();
```

**Step 3: Add page-change handler** (after `handleClearCanvas`):

```typescript
// Called by setTotalPages from PDFBackground
const [totalPagesState, setTotalPagesState] = useState(0);

const handlePageChange = useCallback(
  (direction: "next" | "prev") => {
    if (!canvasRef.current) return;
    // Save current page strokes
    savePageStrokes(pageNumber, canvasRef.current.getStrokes());
    // Navigate
    if (direction === "next") goNext();
    else goPrev();
  },
  [pageNumber, savePageStrokes, goNext, goPrev]
);
```

Wait — `totalPages` is already returned from `usePDF`. But `usePDF` doesn't know the count until `PDFBackground` loads the doc. Wire `onPageCount` from `PDFBackground` to update `usePDF`.

**Revised approach:** `usePDF` returns a setter `setTotalPages` for the page count. Update `hooks/usePDF.ts` to expose `setTotalPages` directly:

In `usePDF.ts`, change `setTotalPages(0)` init and expose it:

```typescript
// In the return object of usePDF, add:
setTotalPages,
```

Then in `PDFBackground`, pass `onPageCount={setTotalPages}`.

**Step 4: Add PDF upload handler**:

```typescript
const handlePDFUpload = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Clear canvas when loading new PDF
    canvasRef.current?.clear();
    loadPDF(file);
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
  },
  [loadPDF]
);

const handleClearPDF = useCallback(() => {
  clearPDF();
  canvasRef.current?.clear();
}, [clearPDF]);
```

**Step 5: After page navigation, restore strokes**

Add an effect that restores strokes whenever `pageNumber` changes:

```typescript
useEffect(() => {
  if (!pdfFile || !canvasRef.current) return;
  const strokes = getPageStrokes(pageNumber);
  canvasRef.current.restoreStrokes(strokes);
}, [pageNumber, pdfFile]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 6: Pass `backgroundCanvas` prop to `<Canvas>`**

Update the `<Canvas>` JSX:

```tsx
<Canvas
  ref={canvasRef}
  onStrokeEnd={handleStrokeEnd}
  strokeColor={penColor}
  strokeWidth={strokeWidth}
  isEraser={isEraser}
  backgroundCanvas={pdfBgRef.current?.getPageCanvas() ?? null}
/>
```

**Step 7: Render `PDFBackground` in the canvas area**

Inside the canvas container div (before the `<Canvas>` element), add:

```tsx
{pdfFile && (
  <PDFBackground
    ref={pdfBgRef}
    file={pdfFile}
    pageNumber={pageNumber}
    onPageCount={setTotalPages}
  />
)}
```

Also hide the lined paper when PDF is active by wrapping its `div` with a conditional:

```tsx
{!pdfFile && (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      backgroundImage:
        "repeating-linear-gradient(transparent, transparent 31px, #e5e7eb 31px, #e5e7eb 32px)",
      backgroundPositionY: "8px",
    }}
  />
)}
```

**Step 8: Add toolbar UI for PDF**

In the toolbar div (after the "Clear hints" button), add:

```tsx
{/* Divider */}
<div className="h-5 w-px bg-gray-200" />

{/* PDF upload */}
<input
  ref={pdfFileInputRef}
  type="file"
  accept=".pdf"
  className="hidden"
  onChange={handlePDFUpload}
/>
<button
  onClick={() => pdfFileInputRef.current?.click()}
  title="Upload PDF"
  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
  </svg>
  PDF
</button>

{/* PDF page nav — shown only when PDF is loaded */}
{pdfFile && (
  <>
    <button
      onClick={() => handlePageChange("prev")}
      disabled={pageNumber <= 1}
      title="Previous page"
      className="flex items-center px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-gray-300 disabled:opacity-40 text-xs transition-colors"
    >
      ←
    </button>
    <span className="text-xs text-gray-500 whitespace-nowrap">
      Page {pageNumber} / {totalPages || "…"}
    </span>
    <button
      onClick={() => handlePageChange("next")}
      disabled={pageNumber >= totalPages}
      title="Next page"
      className="flex items-center px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-gray-300 disabled:opacity-40 text-xs transition-colors"
    >
      →
    </button>
    <button
      onClick={handleClearPDF}
      title="Close PDF"
      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
    >
      × Close PDF
    </button>
  </>
)}
```

**Step 9: Verify TypeScript compiles and dev server starts**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000`, upload a PDF, verify it renders behind the canvas, draw on it, navigate pages.

**Step 10: Commit**

```bash
git add app/page.tsx hooks/usePDF.ts
git commit -m "feat: wire PDF upload, background rendering, page nav, and composite snapshot"
```

---

### Task 6: Fix `usePDF.ts` to expose `setTotalPages`

(This is a prerequisite for Task 5 Step 3 — do this before wiring page.tsx)

**Files:**
- Modify: `hooks/usePDF.ts`

Add `setTotalPages` to the `UsePDFReturn` interface and the return object:

```typescript
// In interface UsePDFReturn, add:
setTotalPages: React.Dispatch<React.SetStateAction<number>>;

// In the return object, add:
setTotalPages,
```

**Commit:**

```bash
git add hooks/usePDF.ts
git commit -m "fix: expose setTotalPages from usePDF for PDFBackground callback"
```

---

## Execution Order

Run tasks in this order: **1 → 2 → 6 → 3 → 4 → 5**

(Task 6 is a fix to Task 2 needed before Task 5)

---

Plan complete and saved to `docs/plans/2026-03-07-pdf-upload-annotation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?
