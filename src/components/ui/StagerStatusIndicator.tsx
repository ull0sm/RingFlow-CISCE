"use client";

import React, { useState, useEffect, useRef } from "react";

interface StagerStatusIndicatorProps {
  stagerStatus: "calling" | "ready" | string;
  stagerActorName?: string | null;
}

export default function StagerStatusIndicator({
  stagerStatus,
  stagerActorName,
}: StagerStatusIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click/tap (especially important on mobile)
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideInteraction);
    document.addEventListener("touchstart", handleOutsideInteraction);
    return () => {
      document.removeEventListener("mousedown", handleOutsideInteraction);
      document.removeEventListener("touchstart", handleOutsideInteraction);
    };
  }, [isOpen]);

  const isCalling = stagerStatus === "calling";
  const label = isCalling
    ? (stagerActorName ? `Calling in progress by ${stagerActorName}` : "Calling in progress")
    : (stagerActorName ? `Ready — called by ${stagerActorName}` : "Ready — called");

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center group"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }}
        title={label}
        aria-label={label}
        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all cursor-pointer select-none shrink-0 ${
          isCalling
            ? "bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 active:scale-95 shadow-2xs"
            : "bg-green-100 text-green-800 border border-green-300 hover:bg-green-200 active:scale-95 shadow-2xs"
        }`}
      >
        <span
          className={`material-symbols-outlined text-[13px] leading-none ${
            isCalling ? "animate-pulse" : ""
          }`}
        >
          {isCalling ? "notifications_active" : "check_circle"}
        </span>
      </button>

      {/* Tooltip bubble: visible on hover (PC) or click/tap (Mobile & PC) */}
      <div
        className={`absolute right-0 top-full mt-1.5 z-40 px-2.5 py-1 bg-neutral-900/95 backdrop-blur-xs text-white text-[11px] font-medium rounded-md shadow-lg whitespace-nowrap transition-all pointer-events-none ${
          isOpen ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`material-symbols-outlined text-[12px] ${
              isCalling ? "text-amber-300" : "text-green-300"
            }`}
          >
            {isCalling ? "notifications_active" : "check_circle"}
          </span>
          <span>{label}</span>
        </div>
        {/* Subtle triangle pointer */}
        <div className="absolute bottom-full right-2 border-4 border-transparent border-b-neutral-900/95" />
      </div>
    </div>
  );
}
