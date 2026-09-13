import React from "react";
import { RingCardSkeleton } from "@/components/ui/Skeleton";
import "@/components/public/public-spectator.css";

export default function PublicEventLoading() {
  return (
    <div className="spectator-root min-h-screen">
      <div className="spectator-page">
        {/* ---------- Header Skeleton ---------- */}
        <header className="spectator-header">
          <div className="spectator-header__top">
            <div className="spectator-back-link opacity-70">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              All events
            </div>

            <div className="spectator-live-chip opacity-80">
              <span className="spectator-beacon animate-pulse" />
              LIVE FLOOR
            </div>
          </div>

          {/* Eyebrow & Title */}
          <div className="w-44 h-3.5 bg-[#E1DDCF]/80 rounded-sm animate-pulse mb-3" />
          <div className="w-full max-w-2xl h-10 sm:h-12 bg-[#E1DDCF]/90 rounded-lg animate-pulse mb-4" />

          {/* Tournament Metric Pills */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-24 h-6 rounded-full bg-[#E1DDCF]/70 animate-pulse" />
            <div className="w-32 h-6 rounded-full bg-[#E1DDCF]/70 animate-pulse" />
            <div className="w-28 h-6 rounded-full bg-[#E1DDCF]/70 animate-pulse" />
          </div>
        </header>

        {/* ---------- Search Box Skeleton ---------- */}
        <div className="spectator-search-wrap mb-7">
          <div className="spectator-search-box flex items-center px-4 gap-3 bg-white border border-[#E1DDCF] rounded-xl shadow-2xs h-[54px]">
            <svg
              className="w-5 h-5 text-[#A19C90] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <div className="w-72 max-w-[70%] h-4 bg-[#E1DDCF]/70 rounded animate-pulse" />
          </div>
        </div>

        {/* ---------- Section Head ---------- */}
        <div className="spectator-section-head">
          <span className="spectator-section-title">Tournament floor</span>
          <div className="spectator-legend">
            <span className="spectator-legend-item">
              <span className="spectator-legend-dot run" />
              Running
            </span>
            <span className="spectator-legend-item">
              <span className="spectator-legend-dot pause" />
              Paused
            </span>
            <span className="spectator-legend-item">
              <span className="spectator-legend-dot idle" />
              Idle
            </span>
          </div>
        </div>

        {/* ---------- Mat Grid Skeleton (Expansive responsive auto-fill grid) ---------- */}
        <div className="spectator-mat-grid" id="mat-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <RingCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
