import React from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import PublicStats from "@/components/public/PublicStats";
import PublicTournamentGrid from "@/components/public/PublicTournamentGrid";
import { RingFlowLogo } from "@/components/ui/ringflow-logo";
import { getEventDateKey } from "@/lib/utils";

export default async function PublicHome() {
  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select(`
      *,
      rings (id),
      categories (id)
    `)
    .order("event_date", { ascending: true });

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  const getEventStatus = (t: any): "live" | "upcoming" | "past" => {
    if (t.status === "completed" || t.status === "archived") return "past";
    if (t.status === "live") return "live";
    if (!t.event_date) return "upcoming";
    const dateKey = getEventDateKey(t.event_date);
    const rawKey = String(t.event_date).split("T")[0];
    if (dateKey === todayStr || rawKey === todayStr) {
      return "live";
    } else if (dateKey > todayStr || rawKey > todayStr) {
      return "upcoming";
    } else {
      return "past";
    }
  };

  // Strictly Stacked: 1. Live Events on top -> 2. Upcoming Events in middle -> 3. Over Events at bottom
  const liveTournaments = (tournaments || [])
    .filter((t) => getEventStatus(t) === "live")
    .sort((a, b) => new Date(a.event_date || 0).getTime() - new Date(b.event_date || 0).getTime());

  const upcomingTournaments = (tournaments || [])
    .filter((t) => getEventStatus(t) === "upcoming")
    .sort((a, b) => new Date(a.event_date || 0).getTime() - new Date(b.event_date || 0).getTime());

  const pastTournaments = (tournaments || [])
    .filter((t) => getEventStatus(t) === "past")
    .sort((a, b) => new Date(b.event_date || 0).getTime() - new Date(a.event_date || 0).getTime());

  const allTournaments = [...liveTournaments, ...upcomingTournaments, ...pastTournaments];

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="w-full top-0 sticky z-50 bg-[#F5F3EC]/90 backdrop-blur-md border-b border-[#E1DDCF] transition-all font-['Inter',sans-serif]">
        <div className="max-w-7xl 2xl:max-w-[1560px] mx-auto flex justify-between items-center h-16 md:h-18 px-4 md:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-2.5 group">
            <RingFlowLogo className="h-8 md:h-9 w-8 md:w-9 text-[#1B1815] group-hover:scale-105 transition-transform shrink-0" />
            <span className="text-2xl md:text-[26px] font-black text-[#1B1815] tracking-[-0.02em] leading-none font-['Plus_Jakarta_Sans',sans-serif]">
              RingFlow
            </span>
          </Link>

          <nav className="flex items-center">
            <Link
              href="#events"
              className="inline-flex items-center px-4 md:px-5 py-2 md:py-2.5 bg-[#1B1815] hover:bg-black text-[#F5F3EC] rounded-lg text-sm md:text-base font-bold font-['Plus_Jakarta_Sans',sans-serif] transition-all shadow-sm hover:shadow"
            >
              <span>Tournaments</span>
            </Link>
          </nav>
        </div>
      </header>
      
      <main className="flex-grow font-['Inter',sans-serif]">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-[#F5F3EC] border-b border-[#E1DDCF] flex flex-col justify-start pt-4 sm:pt-6 md:pt-10 lg:pt-12 pb-8 sm:pb-10 md:pb-16 lg:pb-20">
          <div className="absolute inset-0 bg-[url('/hero-section.jpg')] bg-cover bg-[position:82%_center] md:bg-center opacity-95" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#F5F3EC] via-[#F5F3EC]/90 to-transparent md:via-[#F5F3EC]/60" />

          {/* 📱 MOBILE VIEW ONLY (md:hidden) */}
          <div className="relative max-w-7xl mx-auto px-6 sm:px-8 w-full flex-1 flex flex-col justify-between z-10 md:hidden">
            {/* Top: Header Text */}
            <div className="max-w-2xl pt-1">
              <h1 className="font-['Plus_Jakarta_Sans',sans-serif] text-[30px] sm:text-[40px] font-black tracking-[-0.03em] leading-[1.08] mb-2 text-[#1B1815]">
                Find Your Next Championship
              </h1>
              <p className="text-[#68645A] font-['Inter',sans-serif] font-normal text-[14px] sm:text-base max-w-md leading-relaxed">
                Track live tatami rings, category assignments, and athlete queue status in real time.
              </p>
            </div>

            {/* Bullet points: single column with the exact spacing */}
            <div className="mt-6 sm:mt-8 mb-6 sm:mb-8 max-w-2xl">
              <div className="space-y-4 sm:space-y-5 max-w-[280px] sm:max-w-sm">
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Live tatami ring status</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Real-time match queues</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Category allocations</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Athlete bullpen tracking</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Instant bracket progression</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Match schedule routing</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Referee floor assignments</span>
                </div>
                <div className="flex items-center gap-2.5 text-[13.5px] sm:text-[14.5px] text-[#3D3A33] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Live spectator scoreboards</span>
                </div>
              </div>
            </div>

            {/* Bottom: Button positioned right above Explore */}
            <div className="max-w-2xl w-full flex flex-col items-center pb-2">
              <Link
                href="#events"
                className="w-full sm:w-auto text-center px-8 py-3.5 bg-[#1B1815]/85 hover:bg-[#1B1815] backdrop-blur-md border border-[#F5F3EC]/25 text-[#F5F3EC] font-['Plus_Jakarta_Sans',sans-serif] font-bold text-[15px] rounded-xl transition-all shadow-[0_8px_24px_rgba(27,24,21,0.12)] hover:shadow-[0_12px_28px_rgba(27,24,21,0.2)] inline-block active:scale-[0.98]"
              >
                View Events
              </Link>
            </div>
          </div>

          {/* 💻 DESKTOP & LAPTOP VIEW ONLY (hidden md:flex) */}
          <div className="relative max-w-7xl 2xl:max-w-[1560px] mx-auto px-6 md:px-8 lg:px-12 w-full z-10 hidden md:flex md:flex-col">
            <div className="max-w-3xl">
              <h1 className="font-['Plus_Jakarta_Sans',sans-serif] text-4xl md:text-5xl lg:text-[54px] xl:text-[60px] font-black tracking-[-0.03em] leading-[1.08] mb-4 text-[#1B1815]">
                Find Your Next Championship
              </h1>
              <p className="text-[#68645A] font-['Inter',sans-serif] font-normal text-base md:text-lg lg:text-xl max-w-2xl leading-relaxed mb-8">
                Track live tatami rings, category assignments, and athlete queue status in real time.
              </p>

              {/* 2-Column Desktop Grid for Bullet Points */}
              <div className="grid grid-cols-2 gap-x-10 gap-y-4 max-w-2xl mb-10">
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Live tatami ring status</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Instant bracket progression</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Real-time match queues</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Match schedule routing</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Category allocations</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Referee floor assignments</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Athlete bullpen tracking</span>
                </div>
                <div className="flex items-center gap-3 text-sm md:text-base lg:text-[16px] text-[#3D3A33] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1B1815] shrink-0" />
                  <span>Live spectator scoreboards</span>
                </div>
              </div>

              {/* Desktop View Events Button */}
              <div className="flex items-center gap-4">
                <Link
                  href="#events"
                  className="px-9 py-4 bg-[#1B1815] hover:bg-black text-[#F5F3EC] font-['Plus_Jakarta_Sans',sans-serif] font-bold text-base md:text-lg rounded-xl transition-all shadow-md hover:shadow-xl inline-block active:scale-[0.98]"
                >
                  View Events
                </Link>
              </div>
            </div>
          </div>

          {/* Explore indicator pinned to the bottom of the screen on mobile only */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center text-[#8C877C] animate-bounce pointer-events-none md:hidden opacity-85">
            <span className="text-[10px] font-bold tracking-widest uppercase font-['Plus_Jakarta_Sans',sans-serif] mb-0.5">Explore</span>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </section>

        {/* Stats Bar */}
        <PublicStats />

        {/* Unified Events Grid */}
        <section id="events" className="max-w-7xl 2xl:max-w-[1560px] mx-auto px-6 sm:px-8 md:px-8 lg:px-12 py-16 scroll-mt-20">
          <div className="mb-10">
            <h2 className="font-['Plus_Jakarta_Sans',sans-serif] text-3xl md:text-4xl font-black tracking-[-0.02em] text-[#1B1815] mb-3">
              Tournaments
            </h2>
            <p className="text-[#68645A] text-base md:text-lg">
              Live floor operations, tatami status, and category allocations.
            </p>
          </div>

          <PublicTournamentGrid tournaments={allTournaments} todayStr={todayStr} />
        </section>
      </main>
    </>
  );
}
