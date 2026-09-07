"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

interface PdfViewerModalProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

// Dynamically load Mozilla PDF.js from cdnjs without bloating project bundle
function loadPdfJs(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("Window is undefined");
  if (window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib);
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById("pdfjs-script") as HTMLScriptElement | null;
    if (existingScript) {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        return resolve(window.pdfjsLib);
      }
      existingScript.addEventListener("load", () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        } else {
          reject(new Error("PDF.js failed to initialize"));
        }
      });
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.id = "pdfjs-script";
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } else {
        reject(new Error("PDF.js failed to load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load PDF viewer engine"));
    document.head.appendChild(script);
  });
}

export function PdfViewerModal({ url, title, onClose }: PdfViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomMultiplier, setZoomMultiplier] = useState(1.0);
  const [pageCount, setPageCount] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Handle hardware / gesture back button on mobile via popstate
  useEffect(() => {
    if (!url) return;

    window.history.pushState({ pdfModalOpen: true }, "");

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.body.style.overflow = prevOverflow;
    };
  }, [url, onClose]);

  // Clean close: if modal pushed history, pop it so user's back stack stays pristine
  const handleClose = () => {
    if (typeof window !== "undefined" && window.history.state?.pdfModalOpen) {
      window.history.back();
    } else {
      onClose();
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Render all pages onto HTML5 canvas elements
  const renderPdf = useCallback(async (pdf: any, multiplier: number) => {
    if (!containerRef.current || !pdf) return;

    const container = containerRef.current;
    container.innerHTML = ""; // Clear existing canvases

    try {
      const containerWidth = container.clientWidth > 0 ? container.clientWidth - 24 : 500;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Responsive scale based on container width + user zoom multiplier
        const baseScale = Math.min(2.0, (containerWidth / unscaledViewport.width));
        const finalScale = Math.max(0.6, baseScale * multiplier);
        const viewport = page.getViewport({ scale: finalScale });

        const pageWrapper = document.createElement("div");
        pageWrapper.className = "flex flex-col items-center mb-4 w-full select-none";

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;

        // Support Retina / high-DPI screens for crystal clear text
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "shadow-lg rounded-lg bg-white border border-zinc-200 dark:border-zinc-800 max-w-full transition-all";

        context.scale(dpr, dpr);

        pageWrapper.appendChild(canvas);

        if (pdf.numPages > 1) {
          const pageBadge = document.createElement("span");
          pageBadge.className = "text-[11px] text-on-surface-variant font-medium mt-1.5 opacity-75";
          pageBadge.innerText = `Page ${pageNum} of ${pdf.numPages}`;
          pageWrapper.appendChild(pageBadge);
        }

        container.appendChild(pageWrapper);

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
      }
    } catch (err: any) {
      console.error("Error rendering PDF pages:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch and load PDF document
  const loadDocument = useCallback(async () => {
    if (!url) return;

    setIsLoading(true);
    setError(null);

    try {
      const pdfjs = await loadPdfJs();
      const loadingTask = pdfjs.getDocument({
        url: url,
        withCredentials: false,
      });

      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setPageCount(pdf.numPages);
      await renderPdf(pdf, zoomMultiplier);
    } catch (err: any) {
      console.error("Failed to load PDF:", err);
      setError(err?.message || "Unable to display document in browser.");
      setIsLoading(false);
    }
  }, [url, zoomMultiplier, renderPdf]);

  // Initial load
  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomMultiplier((prev) => {
      const next = Math.min(2.5, +(prev + 0.25).toFixed(2));
      if (pdfDocRef.current) renderPdf(pdfDocRef.current, next);
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoomMultiplier((prev) => {
      const next = Math.max(0.7, +(prev - 0.25).toFixed(2));
      if (pdfDocRef.current) renderPdf(pdfDocRef.current, next);
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomMultiplier(1.0);
    if (pdfDocRef.current) renderPdf(pdfDocRef.current, 1.0);
  };

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md transition-all animate-in fade-in duration-200"
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Modal Container: 88vw width & 80vh height on mobile, floating clearly over blurred page */}
      <div
        className="relative w-[90vw] sm:w-[85vw] max-w-4xl h-[82vh] max-h-[82vh] flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar - High Contrast & Clean Spacing */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 bg-zinc-900/95 border-b border-zinc-800 shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0 pr-1">
            <span className="material-symbols-outlined text-red-400 text-[22px] shrink-0 select-none">
              picture_as_pdf
            </span>
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate tracking-tight">
                {title || "Student List PDF"}
              </h3>
              {pageCount > 0 && (
                <span className="text-[11px] text-zinc-400 leading-tight">
                  {pageCount} page{pageCount > 1 ? "s" : ""} · {Math.round(zoomMultiplier * 100)}% zoom
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Zoom Controls */}
            <div className="flex items-center bg-zinc-800/90 rounded-lg p-0.5 border border-zinc-700/60">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomMultiplier <= 0.7 || isLoading}
                className="p-1 sm:p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-30 cursor-pointer"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px] leading-none select-none">
                  remove
                </span>
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                disabled={zoomMultiplier === 1.0 || isLoading}
                className="px-1.5 py-0.5 text-[11px] font-mono font-medium text-zinc-300 hover:text-white transition-colors select-none cursor-pointer"
                title="Reset zoom to 100%"
              >
                {Math.round(zoomMultiplier * 100)}%
              </button>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomMultiplier >= 2.5 || isLoading}
                className="p-1 sm:p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-30 cursor-pointer"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px] leading-none select-none">
                  add
                </span>
              </button>
            </div>

            {/* Reload button */}
            <button
              type="button"
              onClick={loadDocument}
              disabled={isLoading}
              className="p-1.5 text-zinc-300 hover:text-white bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700/60 rounded-lg transition-colors cursor-pointer"
              title="Reload document"
              aria-label="Reload document"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px] leading-none select-none">
                refresh
              </span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-zinc-300 hover:text-red-400 bg-zinc-800/90 hover:bg-red-500/15 border border-zinc-700/60 rounded-lg transition-colors cursor-pointer ml-1"
              title="Close (Esc)"
              aria-label="Close PDF viewer"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px] leading-none select-none">
                close
              </span>
            </button>
          </div>
        </div>

        {/* PDF Canvas Rendering Area */}
        <div className="relative flex-1 w-full h-full bg-zinc-950 overflow-y-auto overflow-x-auto min-h-0 p-3 sm:p-5">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/90 z-10 p-4 text-center">
              <span className="material-symbols-outlined text-4xl animate-spin text-red-500">
                progress_activity
              </span>
              <span className="text-sm font-medium text-zinc-300">Loading document...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/95 z-10 p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-red-400">
                error
              </span>
              <p className="text-base font-bold text-white">Unable to display document</p>
              <p className="text-xs text-zinc-400 max-w-sm">{error}</p>
              <button
                type="button"
                onClick={loadDocument}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-lg"
              >
                Retry
              </button>
            </div>
          )}

          {/* Dedicated Canvas Container */}
          <div
            ref={containerRef}
            className="flex flex-col items-center justify-start min-h-full w-full"
          />
        </div>
      </div>
    </div>
  );
}
