# PDF Upload + Annotation Design

**Date:** 2026-03-07
**Status:** Approved

## Summary

Add a PDF upload button to the Study Buddy toolbar. The uploaded PDF renders as a background behind the existing drawing canvas. Users can annotate on top with the existing pen tools, navigate multi-page PDFs with prev/next buttons, and the VLM snapshot composites the PDF page + drawing strokes together so the AI can see the full context.

## Decisions

- **Rendering:** `pdfjs-dist` (client-side), PDF.js worker loaded from CDN
- **PDF placement:** Background canvas behind the drawing canvas
- **Page navigation:** Prev/next buttons in toolbar, per-page annotation storage
- **VLM snapshot:** Composite PDF canvas + stroke canvas into one PNG

## Architecture

### New Files

**`components/PDFBackground.tsx`**
- Renders a single PDF page onto a `<canvas>` element
- Props: `file: File`, `pageNumber: number`, `onPageCount: (n: number) => void`
- Exposes ref with `getPageCanvas(): HTMLCanvasElement | null`
- Positioned `absolute inset-0`, pointer-events none
- Scales PDF page to fill the container (object-fit: contain style logic)

**`hooks/usePDF.ts`**
- State: `pdfFile`, `pdfDoc` (loaded PDFDocumentProxy), `pageNumber`, `totalPages`
- Per-page stroke storage: `Map<number, StrokePath[]>` — saved/restored on page change
- Exports: `loadPDF(file)`, `goNext()`, `goPrev()`, `clearPDF()`, `pageNumber`, `totalPages`, `pdfFile`

### Modified Files

**`components/Canvas.tsx`**
- Add two methods to `CanvasHandle`:
  - `getStrokes(): StrokePath[]` — returns current `pathHistory.current`
  - `restoreStrokes(strokes: StrokePath[]): void` — replaces path history and redraws
- Add optional prop `backgroundCanvas?: HTMLCanvasElement | null`
- In `getSnapshot()`: if `backgroundCanvas` is provided, draw it first at logical resolution before drawing strokes

**`app/page.tsx`**
- Add `usePDF` hook
- Add `PDFBackground` ref (`pdfBgRef`)
- Pass `pdfBgRef.current?.getPageCanvas()` as `backgroundCanvas` to `Canvas`
- Toolbar additions:
  - Hidden `<input type="file" accept=".pdf">` + styled upload button (document icon)
  - When PDF loaded: page indicator (`Page N / M`), `←` `→` nav buttons, `×` close button
  - Hide lined paper background when PDF is active
- On page change: save current strokes via `canvasRef.current.getStrokes()`, clear canvas, restore next page strokes via `canvasRef.current.restoreStrokes()`

## Data Flow

```
User picks PDF file
  → usePDF.loadPDF(file) → pdfjs loads PDFDocument
  → PDFBackground renders page N to its <canvas>
  → Drawing canvas sits on top (transparent bg)
  → User draws → strokes stored in Canvas pathHistory
  → Stroke end → getSnapshot() composites [PDF canvas] + [strokes] → VLM
  → User clicks → / ← → usePDF saves strokes for page N, restores strokes for page N±1
  → PDFBackground re-renders new page
```

## UI Spec

- Upload button: paperclip icon, same style as eraser/clear buttons in toolbar
- Page nav: appears inline in toolbar only when PDF is loaded
- Lined paper CSS background: hidden (`display: none`) when `pdfFile != null`
- Close PDF (×): clears PDF, clears canvas, removes all per-page strokes

## Dependencies

- `pdfjs-dist` — add to `package.json` dependencies
- PDF.js worker: load from CDN (`//cdn.jsdelivr.net/npm/pdfjs-dist@x.x.x/build/pdf.worker.min.js`) to avoid bundling it
