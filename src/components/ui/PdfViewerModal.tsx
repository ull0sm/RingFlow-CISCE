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
  const [rotation, setRotation] = useState<number>(0);

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

  // Render all pages onto HTML5 canvas elements with native rotation & readable scale
  const renderPdf = useCallback(async (pdf: any, rot: number = 0) => {
    if (!containerRef.current || !pdf) return;

    const container = containerRef.current;
    container.innerHTML = ""; // Clear existing canvases

    try {
      const containerWidth = container.clientWidth > 0 ? container.clientWidth - 24 : 500;
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // Native PDF.js rotation (0, 90, 180, 270)
        const totalRotation = ((page.rotate || 0) + rot) % 360;
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });
        const isLandscape = unscaledViewport.width > unscaledViewport.height;

        // Solution 2: On mobile, maintain readable width (~760px) for landscape pages so text is never crushed
        let targetWidth = containerWidth;
        if (isMobile && isLandscape) {
          targetWidth = Math.max(containerWidth, 760);
        }

        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: Math.max(0.75, scale), rotation: totalRotation });

        const pageWrapper = document.createElement("div");
        pageWrapper.className = "flex flex-col items-center mb-4 min-w-full select-none";

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) continue;

        // Support Retina / high-DPI screens for crystal clear text
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "shadow-lg rounded-lg bg-white border border-zinc-200 dark:border-zinc-800";

        context.scale(dpr, dpr);

        pageWrapper.appendChild(canvas);

        if (pdf.numPages > 1) {
          const pageBadge = document.createElement("span");
          pageBadge.className = "text-[11px] text-zinc-500 font-medium mt-1.5 opacity-75";
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
      const freshUrl = url.includes("?") ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
      const loadingTask = pdfjs.getDocument({
        url: freshUrl,
        withCredentials: false,
      });

      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      await renderPdf(pdf, rotation);
    } catch (err: any) {
      console.error("Failed to load PDF:", err);
      setError(err?.message || "Unable to display document in browser.");
      setIsLoading(false);
    }
  }, [url, rotation, renderPdf]);

  // Initial load
  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Solution 1: Rotate 90° clockwise on tap
  const handleRotate = () => {
    setRotation((prev) => {
      const next = (prev + 90) % 360;
      if (pdfDocRef.current) {
        setIsLoading(true);
        renderPdf(pdfDocRef.current, next);
      }
      return next;
    });
  };

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-sm transition-all animate-in fade-in duration-200"
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
    >
      {/* 80% Floating Modal Container */}
      <div
        className="relative w-[88vw] sm:w-[82vw] max-w-3xl h-[80vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimalist Header: Title on Left, Rotate + Close on Right */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="material-symbols-outlined text-red-400 text-[20px] shrink-0 select-none">
              description
            </span>
            <h3 className="text-sm sm:text-base font-semibold text-zinc-100 truncate">
              {title || "Student List PDF"}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Rotate 90° button (aligns landscape PDF with portrait mobile screens) */}
            <button
              type="button"
              onClick={handleRotate}
              disabled={isLoading}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer disabled:opacity-40"
              title="Rotate 90°"
              aria-label="Rotate document 90 degrees"
            >
              <span className="material-symbols-outlined text-[20px] leading-none select-none">
                rotate_right
              </span>
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
              title="Close"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-[20px] leading-none select-none">
                close
              </span>
            </button>
          </div>
        </div>

        {/* PDF Document Canvas View with Smooth 2D Touch Panning */}
        <div className="relative flex-1 w-full h-full bg-zinc-950 overflow-y-auto overflow-x-auto min-h-0 p-3 sm:p-4 touch-pan-x touch-pan-y">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-zinc-950/90 z-10 p-4 text-center">
              <span className="material-symbols-outlined text-3xl animate-spin text-red-500">
                progress_activity
              </span>
              <span className="text-xs font-medium text-zinc-400">Loading document...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-zinc-950/95 z-10 p-6 text-center">
              <span className="material-symbols-outlined text-3xl text-red-400">
                error
              </span>
              <p className="text-sm font-semibold text-white">Unable to display document</p>
              <p className="text-xs text-zinc-400 max-w-sm">{error}</p>
              <button
                type="button"
                onClick={loadDocument}
                className="mt-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Dedicated Canvas Container: w-max mx-auto allows full readable width on mobile without crushing */}
          <div
            ref={containerRef}
            className="flex flex-col items-center justify-start min-h-full min-w-full w-max mx-auto"
          />
        </div>
      </div>
    </div>
  );
}
