"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { matchesCategorySearch } from "@/lib/searchUtils";

interface SearchAthlete {
  id: string;
  name: string;
  chest_number: string | null;
  category_id: string | null;
  school?: string | null;
  categories?: {
    id?: string;
    name?: string;
    doc_url?: string;
  } | null;
  tatami?: {
    matName: string;
    status: "running" | "paused" | "pending" | "completed" | "unscheduled";
  };
}

interface HeaderSearchBarProps {
  tournamentId: string;
  role: "admin" | "organiser";
  className?: string;
}

export default function HeaderSearchBar({
  tournamentId,
  role,
  className = "",
}: HeaderSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchAthlete[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cachedCategories, setCachedCategories] = useState<any[]>([]);
  const [cachedAssignments, setCachedAssignments] = useState<any[]>([]);
  const [cachedRings, setCachedRings] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load tournament categories, rings and assignments once for fast matching & ring status
  useEffect(() => {
    if (!tournamentId) return;
    const supabase = createClient();

    const loadMeta = async () => {
      try {
        const [catsRes, ringsRes, assignRes] = await Promise.all([
          supabase.from("categories").select("*").eq("tournament_id", tournamentId),
          supabase.from("rings").select("*").eq("tournament_id", tournamentId),
          supabase
            .from("category_assignments")
            .select("category_id, ring_id, status")
            .order("queue_order", { ascending: true }),
        ]);

        if (catsRes.data) setCachedCategories(catsRes.data);
        if (ringsRes.data) setCachedRings(ringsRes.data);
        if (assignRes.data) setCachedAssignments(assignRes.data);
      } catch (err) {
        console.error("HeaderSearchBar meta load error:", err);
      }
    };

    loadMeta();
  }, [tournamentId]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  // Live search query
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !tournamentId) {
      setResults([]);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);
    const cleanQ = trimmed.replace(/^#/, "");

    const runSearch = async () => {
      try {
        const supabase = createClient();

        // 1. Direct name/chest search
        const directPromise = supabase
          .from("athletes")
          .select("id, name, chest_number, category_id, school, categories(id, name, doc_url)")
          .eq("tournament_id", tournamentId)
          .or(`name.ilike.%${cleanQ}%,chest_number.ilike.%${cleanQ}%`)
          .limit(20);

        // 2. Category matches (e.g. u14_30-35kg, 30, 14, boys, weight, etc.)
        const matchingCatIds = cachedCategories
          .filter((cat) => matchesCategorySearch(cat, trimmed))
          .map((cat) => cat.id);

        let catPromise = null;
        if (matchingCatIds.length > 0) {
          catPromise = supabase
            .from("athletes")
            .select("id, name, chest_number, category_id, school, categories(id, name, doc_url)")
            .eq("tournament_id", tournamentId)
            .in("category_id", matchingCatIds.slice(0, 40))
            .limit(30);
        }

        const [directRes, catRes] = await Promise.all([
          directPromise,
          catPromise ? catPromise : Promise.resolve({ data: null, error: null }),
        ]);

        const combined: SearchAthlete[] = [];
        const seen = new Set<string>();

        const appendAthlete = (raw: any) => {
          if (seen.has(raw.id)) return;
          seen.add(raw.id);

          // Resolve ring assignment status
          let tatami: SearchAthlete["tatami"] = {
            matName: "Unscheduled",
            status: "unscheduled",
          };

          if (raw.category_id) {
            const assignment = cachedAssignments.find((a) => a.category_id === raw.category_id);
            if (assignment) {
              const ring = cachedRings.find((r) => r.id === assignment.ring_id);
              const orderNum = String(ring?.ring_order || 1).padStart(2, "0");
              const matLabel = ring?.mat_name
                ? `Tatami ${orderNum} · ${ring.mat_name}`
                : `Tatami ${orderNum}`;

              tatami = {
                matName: matLabel,
                status: assignment.status || "pending",
              };
            }
          }

          combined.push({
            ...raw,
            tatami,
          });
        };

        if (directRes.data) {
          for (const item of directRes.data) appendAthlete(item);
        }
        if (catRes?.data) {
          for (const item of catRes.data) appendAthlete(item);
        }

        setResults(combined);
      } catch (err) {
        console.error("Search fetch error:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(runSearch, 180);
    return () => clearTimeout(debounce);
  }, [query, tournamentId, cachedCategories, cachedAssignments, cachedRings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsOpen(false);
    router.push(`/${role}/event/${tournamentId}/athletes?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSelectAthlete = (athlete: SearchAthlete) => {
    setIsOpen(false);
    router.push(
      `/${role}/event/${tournamentId}/athletes?q=${encodeURIComponent(athlete.name)}`
    );
  };

  return (
    <div ref={containerRef} className={`relative flex-1 max-w-[440px] mx-auto ${className}`}>
      {/* ─── Search Input Field ─── */}
      <form
        onSubmit={handleSubmit}
        className="w-full flex items-center gap-2 px-3 py-1.5 sm:py-2 border border-[#DCE0E7] rounded-lg text-[13px] bg-[#FBFBFC] hover:border-[#94A3B8] focus-within:border-[#0E9C7C] focus-within:ring-2 focus-within:ring-[#0E9C7C]/20 transition-all shadow-2xs"
      >
        <svg
          className="w-4 h-4 text-[#94A3B8] shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          placeholder="Search athletes or categories…"
          className="w-full bg-transparent border-none outline-none text-[13px] text-[#0F172A] placeholder-[#94A3B8] truncate"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="w-4 h-4 rounded-full text-[#94A3B8] hover:text-[#0F172A] flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </form>

      {/* ─── Live Search Results Dropdown ─── */}
      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+6px)] w-[calc(100vw-32px)] sm:w-[480px] max-w-[480px] bg-white border border-[#E2E8F0] rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.14)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
          {isLoading ? (
            <div className="p-4 text-center text-[12.5px] text-[#64748B] flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#0E9C7C] border-t-transparent animate-spin" />
              <span>Searching athletes &amp; categories…</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-[12.5px] text-[#64748B]">
              No athletes or categories match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Header Count */}
              <div className="px-3.5 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-[11px] font-semibold text-[#64748B]">
                <span>MATCHING ATHLETES ({results.length})</span>
                <span className="text-[10.5px] text-[#94A3B8]">Category &amp; Name Search</span>
              </div>

              {/* List items */}
              <div className="max-h-[340px] overflow-y-auto divide-y divide-[#F1F5F9]">
                {results.map((athlete) => {
                  const catName = athlete.categories?.name || "Uncategorized";
                  const tatami = athlete.tatami;

                  return (
                    <div
                      key={athlete.id}
                      onClick={() => handleSelectAthlete(athlete)}
                      className="p-2.5 sm:px-3.5 sm:py-2.5 hover:bg-[#F0FDF4] cursor-pointer transition-colors group flex items-center justify-between gap-3"
                    >
                      {/* Left: Chest No, Name, Category & School */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded shrink-0">
                            #{athlete.chest_number || "-"}
                          </span>
                          <span className="font-bold text-[13.5px] text-[#0F172A] group-hover:text-[#0B7C63] truncate transition-colors">
                            {athlete.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11.5px] text-[#64748B] truncate">
                          <span className="px-1.5 py-0.5 rounded bg-[#E3F6F0] text-[#0B7C63] font-semibold text-[10.5px] truncate">
                            {catName}
                          </span>
                          {athlete.school && (
                            <span className="text-[#94A3B8] truncate">· {athlete.school}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: Tatami & Status */}
                      <div className="text-right shrink-0">
                        {tatami?.status === "running" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            {tatami.matName} · LIVE
                          </span>
                        ) : tatami?.status === "paused" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            {tatami.matName} · PAUSED
                          </span>
                        ) : tatami?.status === "pending" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {tatami.matName} · QUEUED
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#94A3B8] font-medium">
                            {tatami?.matName || "Unscheduled"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* View all button */}
              <div
                onClick={handleSubmit}
                className="p-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border-t border-[#E2E8F0] text-center text-[12px] font-semibold text-[#0B7C63] cursor-pointer transition-colors flex items-center justify-center gap-1"
              >
                <span>View all in Athletes Roster</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
