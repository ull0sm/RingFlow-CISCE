"use client";

import React, { useEffect, useState, useMemo } from "react";

interface PdfViewerModalProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

export function PdfViewerModal({ url, title, onClose }: PdfViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Compute effective iframe src (Google Docs Viewer ensures inline rendering on all devices without external app prompts)
  const effectiveSrc = useMemo(() => {
    if (!url) return "";
    return `https://docs.google.com/gviewer?url=${encodeURIComponent(url)}&embedded=true`;
  }, [url]);

  // Handle hardware / gesture back button on mobile via popstate
  useEffect(() => {
    if (!url) return;

    // Push a state into browser history so pressing "Back" closes the modal instead of leaving the page
    window.history.pushState({ pdfModalOpen: true }, "");

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    // Freeze background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.body.style.overflow = prevOverflow;
    };
  }, [url, onClose]);

  // Timeout warning helper if Google Docs takes time on slow connections
  useEffect(() => {
    setIsLoading(true);
    setLoadTimedOut(false);

    const timer = setTimeout(() => {
      setLoadTimedOut(true);
    }, 8000);

    return () => clearTimeout(timer);
  }, [effectiveSrc, iframeKey]);

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

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-md transition-all animate-in fade-in duration-200"
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Modal Container: 88vw width & 80vh height on mobile, floating clearly over blurred page */}
      <div
        className="relative w-[88vw] sm:w-[85vw] max-w-4xl h-[80vh] max-h-[80vh] flex flex-col bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-surface-container-low dark:bg-zinc-800/90 border-b border-outline-variant/40 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0 pr-1">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0 select-none">
              article
            </span>
            <h3 className="font-headline-sm text-xs sm:text-base font-bold text-on-surface truncate">
              {title || "Student List PDF"}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Reload button in case mobile network was slow */}
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                setIframeKey((k) => k + 1);
              }}
              className="p-1.5 sm:p-2 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              title="Reload preview"
              aria-label="Reload preview"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px] leading-none select-none">
                refresh
              </span>
            </button>

            {/* Prominent Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 sm:p-2 text-on-surface-variant hover:text-error rounded-lg hover:bg-error/10 transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close PDF viewer"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px] leading-none select-none">
                close
              </span>
            </button>
          </div>
        </div>

        {/* PDF Frame Area */}
        <div className="relative flex-1 w-full h-full bg-surface-container-lowest dark:bg-zinc-950 min-h-0">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-on-surface-variant bg-surface-container-lowest/90 dark:bg-zinc-900/90 z-10 p-4 text-center">
              <span className="material-symbols-outlined text-3xl animate-spin text-primary">
                progress_activity
              </span>
              <span className="text-xs font-medium">Rendering document preview...</span>

              {loadTimedOut && (
                <div className="mt-2 flex flex-col items-center gap-2 text-[11px] text-on-surface-variant/80 max-w-xs animate-in fade-in duration-300">
                  <p>Taking longer than usual to preview?</p>
                  <button
                    type="button"
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="px-3 py-1 bg-surface-container-high rounded text-primary font-medium hover:bg-surface-container-highest cursor-pointer"
                  >
                    Tap to Retry
                  </button>
                </div>
              )}
            </div>
          )}

          <iframe
            key={`${effectiveSrc}-${iframeKey}`}
            src={effectiveSrc}
            title={title || "PDF Document"}
            className="w-full h-full border-0"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </div>
    </div>
  );
}
