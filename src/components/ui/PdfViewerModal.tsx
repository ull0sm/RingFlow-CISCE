"use client";

import React, { useEffect, useState } from "react";

interface PdfViewerModalProps {
  url: string | null;
  title?: string;
  onClose: () => void;
}

export function PdfViewerModal({ url, title, onClose }: PdfViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[2.5px] transition-opacity animate-in fade-in duration-200"
      onClick={handleClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Modal Container: 80% height & width on mobile, floating over page */}
      <div
        className="relative w-[92vw] sm:w-[85vw] max-w-4xl h-[80vh] max-h-[80vh] flex flex-col bg-surface-container-lowest dark:bg-zinc-900 border border-outline-variant/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low dark:bg-zinc-800/80 border-b border-outline-variant/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="material-symbols-outlined text-primary text-[20px] shrink-0 select-none">
              article
            </span>
            <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
              {title || "Student List PDF"}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Open in new tab fallback */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container transition-colors"
              title="Open in new window / download"
            >
              <span className="material-symbols-outlined text-[20px] leading-none select-none">
                open_in_new
              </span>
            </a>

            {/* Prominent Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-on-surface-variant hover:text-error rounded-lg hover:bg-error/10 transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close PDF viewer"
            >
              <span className="material-symbols-outlined text-[22px] leading-none select-none">
                close
              </span>
            </button>
          </div>
        </div>

        {/* PDF Frame Area */}
        <div className="relative flex-1 w-full h-full bg-surface-container-lowest dark:bg-zinc-950 min-h-0">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-on-surface-variant bg-surface-container-lowest/80 dark:bg-zinc-900/80 z-10">
              <span className="material-symbols-outlined text-3xl animate-spin text-primary">
                progress_activity
              </span>
              <span className="text-xs font-medium">Loading document...</span>
            </div>
          )}

          <iframe
            src={url}
            title={title || "PDF Document"}
            className="w-full h-full border-0"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </div>
    </div>
  );
}
