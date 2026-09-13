"use client";

import React from "react";
import { useParams, usePathname } from "next/navigation";
import HeaderSearchBar from "@/components/layout/HeaderSearchBar";

export default function OrganiserHeader({
  title,
  eventName,
  showSearch,
  tournamentId,
}: {
  title: string;
  eventName?: string;
  showSearch?: boolean;
  tournamentId?: string;
}) {
  const params = useParams();
  const pathname = usePathname();
  const id = tournamentId || ((params?.id as string) || "");

  const isDashboard = showSearch !== undefined
    ? showSearch
    : Boolean(id && (pathname?.includes("/dashboard") || title?.toLowerCase() === "overview"));

  return (
    <header className="flex-shrink-0 bg-[#FAF9F5] border-b border-[#E1DDCF] sticky top-0 z-30">
      <div className="h-[60px] flex items-center justify-between px-4 sm:px-6 gap-3 sm:gap-6">
        {/* ─── Left: Breadcrumb ─── */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[13.5px] min-w-0">
          <span
            title={eventName || "RingFlow"}
            className="text-[#94A3B8] font-medium truncate max-w-[80px] min-[380px]:max-w-[105px] sm:max-w-[200px] md:max-w-[260px]"
          >
            {eventName || "RingFlow"}
          </span>
          <svg
            className="w-3.5 h-3.5 text-[#94A3B8] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="text-[#0F172A] font-semibold truncate shrink-0">{title}</span>
        </div>

        {/* ─── Center: Live Interactive Search Bar (Dashboard only on Desktop) ─── */}
        {isDashboard && (
          <HeaderSearchBar tournamentId={id} role="organiser" className="hidden md:flex" />
        )}

        {/* ─── Right: Built by Crux Studios Badge ─── */}
        <div className="flex items-center shrink-0 ml-auto">
          <a
            href="https://cruxstudios.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center text-[#0F172A] transition-all duration-200 shrink-0 py-1 cursor-pointer"
          >
            <div className="flex flex-col text-left leading-none gap-0.5">
              <div className="flex items-center gap-1">
                <span className="font-['Inter',sans-serif] text-[9.5px] font-semibold tracking-[0.06em] uppercase text-[#64748B] group-hover:text-[#00E5FF] group-hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.7)] transition-all duration-200">
                  Built by
                </span>
                <svg
                  className="w-3 h-3 text-[#94A3B8] group-hover:text-[#00E5FF] group-hover:drop-shadow-[0_0_8px_rgba(0,229,255,0.8)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M7 17L17 7M17 7H7M17 7V17" />
                </svg>
              </div>
              <img
                src="/crux-studios.png"
                alt="Crux Studios"
                className="h-[17px] w-auto object-contain shrink-0 mix-blend-multiply group-hover:drop-shadow-[0_0_12px_rgba(0,229,255,0.85)] transition-all duration-200"
              />
            </div>
          </a>
        </div>
      </div>

      {/* ─── Mobile Search Bar: Below the Navbar (Only for org/dashboard) ─── */}
      {isDashboard && (
        <div className="md:hidden px-4 pb-3 pt-0.5 border-t border-[#E1DDCF] bg-[#FAF9F5]">
          <HeaderSearchBar tournamentId={id} role="organiser" className="w-full max-w-none" />
        </div>
      )}
    </header>
  );
}
