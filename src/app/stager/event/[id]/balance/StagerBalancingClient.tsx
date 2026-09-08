"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { updateCategoryStagerStatus } from "@/actions/stager";
import StagerStatusIndicator from "@/components/ui/StagerStatusIndicator";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  age_bracket: string | null;
  weight_class: string | null;
  athletes_count: number;
  expected_matches: number;
  belt?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  sex?: string | null;
  day?: string | null;
  doc_url?: string | null;
};

type Ring = {
  id: string;
  name: string;
  ring_order: number;
};

type Assignment = {
  category_id: string;
  ring_id: string;
  queue_order: number;
  status?: string;
  matches_completed?: number;
  stager_status?: string | null;
  stager_name?: string | null;
};

interface Props {
  tournamentId: string;
  tournamentName: string;
  stagerName: string;
  initialCategories: Category[];
  initialRings: Ring[];
  initialAssignments: Assignment[];
  completedTimes: Record<string, string>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StagerBalancingClient({
  tournamentId,
  tournamentName,
  stagerName,
  initialCategories,
  initialRings,
  initialAssignments,
  completedTimes,
}: Props) {
  const [currentStagerName, setCurrentStagerName] = useState(stagerName);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const [historyOpenForRing, setHistoryOpenForRing] = useState<string | null>(null);

  useEffect(() => {
    if ((!currentStagerName || currentStagerName === "Stager") && typeof window !== "undefined") {
      const stored = localStorage.getItem("ringflow_stager_name");
      if (stored) {
        setCurrentStagerName(stored);
      }
    }
  }, [currentStagerName]);

  // Assignments map: categoryId → assignment data incl. stager status
  const [assignmentsMap, setAssignmentsMap] = useState<
    Record<
      string,
      {
        matches_completed: number;
        status: string;
        ring_id: string;
        queue_order: number;
        stager_status: string | null;
        stager_name: string | null;
      }
    >
  >({});

  // Ordered queues per ring (active only)
  const [ringQueues, setRingQueues] = useState<Record<string, Category[]>>({});
  const [ringCompletedQueues, setRingCompletedQueues] = useState<Record<string, Category[]>>({});

  const [isInitialized, setIsInitialized] = useState(false);

  // Action loading state: key is categoryId + action
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Minimal Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    categoryId: string;
    categoryName: string;
    requestedStatus: "calling" | "ready";
    isClearing: boolean;
  } | null>(null);

  // Close confirmation modal on Escape key
  useEffect(() => {
    if (!confirmModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmModal(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmModal]);

  // ── Initialize from props ──────────────────────────────────────────────────
  useEffect(() => {
    if (isInitialized) return;
    setIsInitialized(true);

    const map: Record<string, any> = {};
    initialAssignments.forEach((a) => {
      map[a.category_id] = {
        matches_completed: (a as any).matches_completed || 0,
        status: a.status || "pending",
        ring_id: a.ring_id,
        queue_order: a.queue_order ?? 0,
        stager_status: a.stager_status ?? null,
        stager_name: a.stager_name ?? null,
      };
    });
    setAssignmentsMap(map);

    const ringMap: Record<string, Category[]> = {};
    const ringMapHistory: Record<string, Category[]> = {};
    initialRings.forEach((r) => {
      ringMap[r.id] = [];
      ringMapHistory[r.id] = [];
    });

    initialCategories.forEach((cat) => {
      const assignment = initialAssignments.find((a) => a.category_id === cat.id);
      if (assignment && ringMap[assignment.ring_id]) {
        if (assignment.status === "completed") {
          ringMapHistory[assignment.ring_id].push(cat);
        } else {
          ringMap[assignment.ring_id].push(cat);
        }
      }
    });

    Object.keys(ringMap).forEach((ringId) => {
      ringMap[ringId].sort((a, b) => {
        const orderA = initialAssignments.find((as) => as.category_id === a.id)?.queue_order || 0;
        const orderB = initialAssignments.find((as) => as.category_id === b.id)?.queue_order || 0;
        return orderA - orderB;
      });
    });

    setRingQueues(ringMap);
    setRingCompletedQueues(ringMapHistory);
  }, [initialCategories, initialRings, initialAssignments, isInitialized]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const ringIds = initialRings.map((r) => r.id);
    if (ringIds.length === 0) return;

    const channel = supabase
      .channel(`stager_balancing_${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "category_assignments",
        },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const updated = payload.new as any;
            if (updated?.category_id && ringIds.includes(updated.ring_id)) {
              setAssignmentsMap((prev) => ({
                ...prev,
                [updated.category_id]: {
                  matches_completed: updated.matches_completed || 0,
                  status: updated.status || "pending",
                  ring_id: updated.ring_id,
                  queue_order: updated.queue_order ?? prev[updated.category_id]?.queue_order ?? 0,
                  stager_status: updated.stager_status ?? null,
                  stager_name: updated.stager_name ?? null,
                },
              }));

              // Handle completion → move to completed queue
              if (updated.status === "completed" && updated.ring_id) {
                setRingQueues((prev) => {
                  const currentRingQueue = prev[updated.ring_id] || [];
                  const categoryItem = currentRingQueue.find((c) => c.id === updated.category_id);
                  if (categoryItem) {
                    const newRingQueue = currentRingQueue.filter((c) => c.id !== updated.category_id);
                    setRingCompletedQueues((compPrev) => {
                      const compQueue = compPrev[updated.ring_id] || [];
                      if (!compQueue.some((c) => c.id === categoryItem.id)) {
                        return { ...compPrev, [updated.ring_id]: [categoryItem, ...compQueue] };
                      }
                      return compPrev;
                    });
                    return { ...prev, [updated.ring_id]: newRingQueue };
                  }
                  return prev;
                });
              }

              // Handle real-time queue status & reorder from moderator/DB
              if (
                updated.ring_id &&
                updated.status !== "completed"
              ) {
                setRingQueues((prev) => {
                  const currentQueue = prev[updated.ring_id];
                  if (!currentQueue) return prev;

                  let catItem = currentQueue.find((c) => c.id === updated.category_id);
                  if (!catItem) {
                    for (const rId of Object.keys(prev)) {
                      const found = prev[rId].find((c) => c.id === updated.category_id);
                      if (found) { catItem = found; break; }
                    }
                    if (!catItem) {
                      catItem = initialCategories.find((c) => c.id === updated.category_id);
                    }
                  }
                  if (!catItem) return prev;

                  const cleanQueue = currentQueue.filter((c) => c.id !== updated.category_id);

                  if (updated.status === "running" || updated.status === "paused") {
                    // Running or paused category MUST always stay at top of queue (index 0)
                    return { ...prev, [updated.ring_id]: [catItem, ...cleanQueue] };
                  } else if (updated.queue_order !== undefined) {
                    const reQueue = [...cleanQueue];
                    const insertIdx = Math.min(Math.max(0, updated.queue_order), reQueue.length);
                    reQueue.splice(insertIdx, 0, catItem);
                    return { ...prev, [updated.ring_id]: reQueue };
                  }
                  return prev;
                });

                // Clean from completed queues if it was reverted
                setRingCompletedQueues((compPrev) => {
                  let changed = false;
                  const newComp = { ...compPrev };
                  for (const rId of Object.keys(newComp)) {
                    if (newComp[rId]?.some((c) => c.id === updated.category_id)) {
                      newComp[rId] = newComp[rId].filter((c) => c.id !== updated.category_id);
                      changed = true;
                    }
                  }
                  return changed ? newComp : compPrev;
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, initialRings]);

  // ── Stager action handler ──────────────────────────────────────────────────
  const handleStagerAction = useCallback(
    async (categoryId: string, requestedStatus: "calling" | "ready") => {
      const current = assignmentsMap[categoryId];
      const isSameStatus = current?.stager_status === requestedStatus;
      const newStatus: "calling" | "ready" | null = isSameStatus ? null : requestedStatus;

      const actionKey = `${categoryId}-${requestedStatus}`;
      setLoadingAction(actionKey);

      // Optimistic update
      setAssignmentsMap((prev) => ({
        ...prev,
        [categoryId]: {
          ...prev[categoryId],
          stager_status: newStatus,
          stager_name: newStatus ? currentStagerName : null,
        },
      }));

      try {
        await updateCategoryStagerStatus(categoryId, tournamentId, newStatus, currentStagerName);
      } catch (err: any) {
        // Rollback on failure
        setAssignmentsMap((prev) => ({
          ...prev,
          [categoryId]: {
            ...prev[categoryId],
            stager_status: current?.stager_status ?? null,
            stager_name: current?.stager_name ?? null,
          },
        }));
        alert(err?.message || "Failed to update status.");
      } finally {
        setLoadingAction(null);
      }
    },
    [assignmentsMap, currentStagerName, tournamentId]
  );

  // ── Render category card (within a ring queue) ─────────────────────────────
  const renderCategoryCard = (cat: Category, ringId: string) => {
    const catAssignment = assignmentsMap[cat.id];
    const status = catAssignment?.status;
    const isRunning = status === "running";
    const isPaused = status === "paused";
    const isCompleted = status === "completed";
    const hasLeftAccent = isRunning || isPaused || isCompleted;
    const matchesDone = catAssignment?.matches_completed || 0;
    const matchesTotal = cat.expected_matches || 0;
    const pct = matchesTotal > 0 ? (matchesDone / matchesTotal) * 100 : 0;
    const stagerStatus = catAssignment?.stager_status ?? null;
    const stagerActorName = catAssignment?.stager_name ?? null;

    const isCallingLoading = loadingAction === `${cat.id}-calling`;
    const isReadyLoading = loadingAction === `${cat.id}-ready`;

    return (
      <div
        key={cat.id}
        className={`p-3 border rounded-lg relative overflow-hidden ${isPaused
            ? "bg-amber-500/5 border-amber-400/50 shadow-md"
            : isRunning
              ? "bg-secondary/5 border-secondary/40 shadow-md"
              : isCompleted
                ? "bg-surface-container/60 border-outline-variant opacity-80"
                : "bg-surface-container-lowest border-outline-variant"
          }`}
      >
        {isPaused && (
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
        )}
        {isRunning && (
          <div className="absolute top-0 left-0 w-1 h-full bg-secondary" />
        )}
        {isCompleted && (
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
        )}
        <div className={`flex justify-between items-center mb-1 ${hasLeftAccent ? "ml-2" : ""}`}>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${isPaused ? "text-amber-700" : isCompleted ? "text-blue-700" : "text-secondary"
            }`}>
            {cat.age_bracket ||
              (cat.age_min !== null && cat.age_max !== null
                ? `${cat.age_min}-${cat.age_max}`
                : "")}{" "}
            | {cat.weight_class || cat.belt || "–"}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {cat.doc_url && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingPdf({ url: cat.doc_url!, title: cat.name });
                }}
                title="View student list PDF"
                className="material-symbols-outlined text-[13px] text-outline hover:text-primary transition-colors shrink-0 cursor-pointer"
                style={{ fontVariationSettings: "'FILL' 0" }}
              >
                article
              </button>
            )}
            {stagerStatus && (
              <StagerStatusIndicator stagerStatus={stagerStatus} stagerActorName={stagerActorName} />
            )}
            {isPaused ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                PAUSED
              </span>
            ) : isRunning ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                LIVE
              </span>
            ) : isCompleted ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                <span className="material-symbols-outlined text-[11px] text-blue-600">done_all</span>
                COMPLETED
              </span>
            ) : (
              <span className="font-data-mono text-[10px] font-bold text-on-surface-variant">
                {Math.ceil((cat.expected_matches * 109) / 60)}m
              </span>
            )}
          </div>
        </div>

        <h5 className={`text-xs font-bold text-primary mb-1.5 flex items-center gap-1 ${hasLeftAccent ? "ml-2" : ""}`}>
          {cat.name}
        </h5>

        <div className={`flex gap-4 text-[10px] font-data-mono text-outline ${hasLeftAccent ? "ml-2" : ""}`}>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">group</span>
            {cat.athletes_count}
          </span>
        </div>

        {(isRunning || isPaused || isCompleted) && (
          <div className="mt-2 ml-2">
            <div className={`flex justify-between text-[9px] font-bold mb-0.5 ${isPaused ? "text-amber-700" : isCompleted ? "text-blue-700" : "text-secondary"
              }`}>
              <span>{matchesDone} / {matchesTotal} matches</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ease-out ${isPaused ? "bg-amber-500" : isCompleted ? "bg-blue-600" : "bg-secondary"
                  }`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Stager Action Buttons */}
        <div className={`mt-2.5 pt-2.5 border-t border-outline-variant/30 flex gap-2 ${hasLeftAccent ? "ml-2" : ""}`}>
          <button
            onClick={() => {
              setConfirmModal({
                categoryId: cat.id,
                categoryName: cat.name,
                requestedStatus: "calling",
                isClearing: stagerStatus === "calling",
              });
            }}
            disabled={!!loadingAction}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[10px] font-bold transition-all border whitespace-nowrap select-none cursor-pointer ${stagerStatus === "calling"
                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                : "bg-amber-100/60 text-amber-800 border-amber-300 hover:bg-amber-200"
              } disabled:opacity-50`}
            title="Mark as In Progress - notify others you're calling this category"
          >
            {isCallingLoading ? (
              <span className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <span className="material-symbols-outlined text-[13px] shrink-0">notifications_active</span>
            )}
            <span className="whitespace-nowrap">{stagerStatus === "calling" ? "In Progress ✓" : "In Progress"}</span>
          </button>

          <button
            onClick={() => {
              setConfirmModal({
                categoryId: cat.id,
                categoryName: cat.name,
                requestedStatus: "ready",
                isClearing: stagerStatus === "ready",
              });
            }}
            disabled={!!loadingAction}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[10px] font-bold transition-all border whitespace-nowrap select-none cursor-pointer ${stagerStatus === "ready"
                ? "bg-green-600 text-white border-green-600 shadow-sm"
                : "bg-green-100/60 text-green-800 border-green-300 hover:bg-green-200"
              } disabled:opacity-50`}
            title="Mark as Called - notify others this category is ready"
          >
            {isReadyLoading ? (
              <span className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <span className="material-symbols-outlined text-[13px] shrink-0">check_circle</span>
            )}
            <span className="whitespace-nowrap">{stagerStatus === "ready" ? "Called ✓" : "Called"}</span>
          </button>
        </div>
      </div>
    );
  };

  // ── Main Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden w-full bg-surface">
      {/* Top Nav - Slim Low-Profile Header */}
      <header className="flex justify-between items-center w-full px-3 sm:px-6 h-11 sm:h-12 bg-surface-container-lowest border-b border-outline-variant shrink-0 z-10 gap-2">
        <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
          <span className="text-sm sm:text-base font-black text-primary tracking-tight shrink-0 whitespace-nowrap">Ring Flow</span>
          <div className="h-3.5 sm:h-4 w-[1px] bg-outline-variant shrink-0" />
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-primary whitespace-nowrap">Tatami Board</h2>
            <span className="text-outline-variant hidden sm:inline text-xs">/</span>
            <span className="text-on-surface-variant text-[11px] sm:text-xs opacity-70 truncate max-w-[120px] sm:max-w-[200px] md:max-w-none whitespace-nowrap">
              {tournamentName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-secondary/10 rounded-full shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-[10px] sm:text-xs font-bold text-secondary whitespace-nowrap">STAGER</span>
          </div>
          <span className="text-xs sm:text-sm font-medium text-on-surface-variant truncate max-w-[90px] sm:max-w-none whitespace-nowrap">{currentStagerName}</span>
        </div>
      </header>

      {/* Overview & Info Bar - Slim Responsive */}
      <div className="bg-primary text-on-primary px-3 sm:px-6 py-1.5 sm:py-2 shrink-0 flex items-center justify-between gap-2 shadow-sm z-10 text-xs text-white/95">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="material-symbols-outlined text-[15px] sm:text-[17px] text-amber-300 shrink-0">info</span>
          <p className="leading-tight text-[10.5px] sm:text-xs truncate sm:whitespace-normal">
            Use <span className="font-bold text-amber-300">&apos;In Progress&apos;</span> and <span className="font-bold text-emerald-300">&apos;Called&apos;</span> to alert team
          </p>
        </div>

        {/* Developed by CruxStudios Badge */}
        <a
          href="https://cruxstudios.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-white/10 hover:bg-white/20 text-[#F5F3EC] border border-white/20 hover:border-cyan-400/60 shadow-xs hover:-translate-y-0.5 transition-all duration-300 shrink-0"
        >
          <span className="font-['Inter',sans-serif] font-medium text-[9px] sm:text-[10px] text-white/80 group-hover:text-white transition-colors hidden xs:inline whitespace-nowrap">
            Developed by
          </span>
          <div className="flex items-center gap-1">
            <img
              src="https://cruxstudios.dev/favicon.svg"
              alt="CruxStudios"
              className="h-3 sm:h-3.5 w-3 sm:w-3.5 drop-shadow-[0_0_6px_rgba(0,229,255,0.7)] group-hover:scale-110 transition-all duration-300"
            />
            <span className="font-['Plus_Jakarta_Sans',sans-serif] font-black text-[10px] sm:text-[11px] text-white tracking-tight group-hover:text-[#00E5FF] transition-colors whitespace-nowrap">
              CruxStudios
            </span>
          </div>
        </a>
      </div>

      {/* Ring Grid */}
      <div className="flex-1 overflow-x-auto bg-surface-container-low flex p-3 sm:p-5 gap-3 sm:gap-5 items-start">
        {initialRings.map((ring) => {
          const activeQueue = ringQueues[ring.id] || [];
          const completedQueue = ringCompletedQueues[ring.id] || [];
          const isHistoryView = historyOpenForRing === ring.id;

          if (isHistoryView) {
            return (
              <div
                key={ring.id}
                className="w-[85vw] max-w-[360px] sm:w-80 lg:w-[330px] xl:w-[350px] 2xl:w-[380px] shrink-0 flex flex-col bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm h-full"
              >
                <div className="sticky top-0 z-10 p-4 flex justify-between items-start shrink-0 bg-surface-container-highest text-on-surface">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[20px] text-primary mt-1">history</span>
                    <div>
                      <h4 className="font-headline-sm text-lg tracking-tight leading-none mb-1">
                        {ring.name.replace(/Ring/i, "Tatami")} History
                      </h4>
                      <div className="flex gap-3 text-[10px] font-bold text-on-surface-variant uppercase">
                        <span>{completedQueue.length} Categories</span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">group</span>
                          {completedQueue.reduce((sum, cat) => sum + cat.athletes_count, 0)} Athletes
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-black/10 transition-colors flex items-center justify-center text-primary cursor-pointer"
                    onClick={() => setHistoryOpenForRing(null)}
                    title="Back to Current Queue"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {completedQueue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-outline opacity-70">
                      <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                      <span className="text-sm">No completed categories</span>
                    </div>
                  ) : (
                    completedQueue.map((cat) => {
                      const assignment = initialAssignments.find((a) => a.category_id === cat.id);
                      const rawTime =
                        completedTimes[cat.id] ||
                        (assignment as any)?.completed_at ||
                        (assignment as any)?.created_at;
                      const timeStr = rawTime
                        ? new Date(rawTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Completed";
                      return (
                        <div
                          key={cat.id}
                          className="p-3 bg-white border border-outline-variant rounded-lg flex flex-col gap-1 shadow-sm relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                          <div className="flex justify-between items-center ml-2">
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">
                              {cat.age_bracket ||
                                (cat.age_min !== null && cat.age_max !== null
                                  ? `${cat.age_min}-${cat.age_max}`
                                  : "")}{" "}
                              | {cat.weight_class || cat.belt || "-"}
                            </span>
                            <span
                              suppressHydrationWarning
                              className="text-[10px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[12px]">done_all</span>
                              {timeStr}
                            </span>
                          </div>
                          <div className="flex justify-between items-center ml-2">
                            <h5 className="text-xs font-bold text-primary flex items-center gap-1">
                              {cat.name}
                              {cat.doc_url && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingPdf({ url: cat.doc_url!, title: cat.name });
                                  }}
                                  title="View student list PDF"
                                  className="material-symbols-outlined text-[13px] text-outline hover:text-primary transition-colors shrink-0 cursor-pointer"
                                  style={{ fontVariationSettings: "'FILL' 0" }}
                                >
                                  article
                                </button>
                              )}
                            </h5>
                          </div>
                          <div className="flex gap-4 text-[10px] font-data-mono text-outline ml-2">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">group</span>
                              {cat.athletes_count}
                            </span>
                            <span>{cat.expected_matches} Matches</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          }

          return (
            <div
              key={ring.id}
              className="w-[85vw] max-w-[360px] sm:w-80 lg:w-[330px] xl:w-[350px] 2xl:w-[380px] shrink-0 flex flex-col bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm h-full"
            >
              {/* Ring Header */}
              <div className="p-4 flex justify-between items-center shrink-0 bg-primary text-on-primary">
                <div>
                  <h4 className="font-headline-sm text-lg tracking-tight leading-none mb-0.5">
                    {ring.name.replace(/Ring/i, "Tatami")}
                  </h4>
                  <span className="text-[9px] font-label-caps opacity-70">
                    {activeQueue.length} ACTIVE · {completedQueue.length} DONE
                  </span>
                </div>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer text-white"
                  onClick={() => setHistoryOpenForRing(ring.id)}
                  title="View Completed Categories"
                >
                  <span className="material-symbols-outlined text-[20px]">history</span>
                </button>
              </div>

              {/* Active Queue */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {activeQueue.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-outline opacity-50">
                    <span className="material-symbols-outlined text-3xl mb-1">inbox</span>
                    <span className="text-xs">No active categories</span>
                  </div>
                )}

                {activeQueue.map((cat) => renderCategoryCard(cat, ring.id))}
              </div>
            </div>
          );
        })}

        {initialRings.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant opacity-50">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl mb-3 block">view_column</span>
              <p className="text-sm">No tatamis configured for this tournament.</p>
            </div>
          </div>
        )}
      </div>

      {/* Minimal Confirmation Modal */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="bg-white border border-outline-variant/80 rounded-2xl p-5 w-full max-w-[320px] shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-150 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Minimal Icon */}
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto ${confirmModal.isClearing
                  ? "bg-surface-container-high text-on-surface-variant"
                  : confirmModal.requestedStatus === "calling"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}
            >
              <span className="material-symbols-outlined text-2xl">
                {confirmModal.isClearing
                  ? "restart_alt"
                  : confirmModal.requestedStatus === "calling"
                    ? "notifications_active"
                    : "check_circle"}
              </span>
            </div>

            {/* Title & Body */}
            <div>
              <h3 className="font-headline-sm text-base text-primary font-bold">
                {confirmModal.isClearing
                  ? `Clear ${confirmModal.requestedStatus === "calling" ? "In Progress" : "Called"}?`
                  : `Mark as ${confirmModal.requestedStatus === "calling" ? "In Progress" : "Called"}?`}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                {confirmModal.isClearing ? (
                  <>
                    Are you sure you want to clear this status for{" "}
                    <span className="font-semibold text-primary">{confirmModal.categoryName}</span>?
                  </>
                ) : confirmModal.requestedStatus === "calling" ? (
                  <>
                    Are you sure you want to alert the team that{" "}
                    <span className="font-semibold text-primary">{confirmModal.categoryName}</span> is{" "}
                    <span className="text-amber-700 font-bold">In Progress</span>?
                  </>
                ) : (
                  <>
                    Are you sure you want to alert the team that{" "}
                    <span className="font-semibold text-primary">{confirmModal.categoryName}</span> is{" "}
                    <span className="text-green-700 font-bold">Called &amp; Ready</span>?
                  </>
                )}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2 px-3 rounded-xl border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { categoryId, requestedStatus } = confirmModal;
                  setConfirmModal(null);
                  handleStagerAction(categoryId, requestedStatus);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white shadow-sm transition-colors cursor-pointer ${confirmModal.isClearing
                    ? "bg-neutral-800 hover:bg-neutral-900"
                    : confirmModal.requestedStatus === "calling"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 80% Floating PDF Viewer Modal with blurred background */}
      <PdfViewerModal
        url={viewingPdf?.url || null}
        title={viewingPdf?.title}
        onClose={() => setViewingPdf(null)}
      />
    </div>
  );
}
