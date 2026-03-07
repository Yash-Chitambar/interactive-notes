"use client";

import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  Dispatch,
  SetStateAction,
} from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

// Point at CDN worker — keeps it out of the main bundle
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs";

export interface PDFBackgroundHandle {
  getPageCanvas: () => HTMLCanvasElement | null;
}

interface PDFBackgroundProps {
  file: File;
  pageNumber: number;
  onPageCount: Dispatch<SetStateAction<number>>;
}

const PDFBackground = forwardRef<PDFBackgroundHandle, PDFBackgroundProps>(
  ({ file, pageNumber, onPageCount }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
    const renderTaskRef = useRef<RenderTask | null>(null);
    // Signal that the document is ready
    const docReadyRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getPageCanvas: () => canvasRef.current,
    }));

    // Load the PDF document when the file changes
    useEffect(() => {
      let cancelled = false;
      docReadyRef.current = false;

      file.arrayBuffer().then(async (buf) => {
        if (cancelled) return;
        try {
          const doc = await pdfjsLib.getDocument({ data: buf }).promise;
          if (cancelled) {
            doc.destroy();
            return;
          }
          pdfDocRef.current = doc;
          onPageCount(doc.numPages);
          docReadyRef.current = true;
        } catch (e) {
          if (!cancelled) console.error("PDF load error", e);
        }
      });

      return () => {
        cancelled = true;
        // Cancel any in-progress render
        renderTaskRef.current?.cancel();
        renderTaskRef.current = null;
        pdfDocRef.current?.destroy();
        pdfDocRef.current = null;
        docReadyRef.current = false;
      };
    }, [file, onPageCount]);

    const renderPage = useCallback(async () => {
      const doc = pdfDocRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!doc || !canvas || !container) return;

      // Cancel any in-progress render before starting a new one
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      let page;
      try {
        page = await doc.getPage(pageNumber);
      } catch {
        return; // doc was destroyed
      }

      const { width: containerW, height: containerH } =
        container.getBoundingClientRect();
      if (containerW === 0 || containerH === 0) return;

      const dpr = window.devicePixelRatio || 1;
      // Scale to fit inside the container while preserving aspect ratio
      const unscaledVP = page.getViewport({ scale: 1 });
      const scale =
        Math.min(containerW / unscaledVP.width, containerH / unscaledVP.height) *
        dpr;
      const viewport = page.getViewport({ scale });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

      const task = page.render({ canvas, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e: unknown) {
        // Cancelled renders throw RenderingCancelledException — ignore
        if (
          (e as { name?: string })?.name !== "RenderingCancelledException"
        ) {
          console.error("PDF render error", e);
        }
      }
    }, [pageNumber]);

    // Re-render when doc becomes ready or page changes
    // Poll briefly after file load in case doc isn't ready yet
    useEffect(() => {
      if (docReadyRef.current) {
        renderPage();
        return;
      }
      const interval = setInterval(() => {
        if (docReadyRef.current) {
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
