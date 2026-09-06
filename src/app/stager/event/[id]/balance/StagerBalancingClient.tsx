"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { updateCategoryStagerStatus } from "@/actions/stager";

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
        { event: "*", schema: "public", table: "category_assignments" },
        (payload) => {
          if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
            const updated = payload.new as any;
            if (updated?.category_id) {
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
    const isRunning =
      catAssignment?.status === "running" || catAssignment?.status === "paused";
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
        className={`p-3 border rounded-lg relative overflow-hidden ${
          isRunning
            ? "bg-secondary/5 border-secondary/40 shadow-md"
            : "bg-surface-container-lowest border-outline-variant"
        }`}
      >
        {isRunning && (
          <div className="absolute top-0 left-0 w-1 h-full bg-secondary" />
        )}
        <div className={`flex justify-between items-center mb-1 ${isRunning ? "ml-2" : ""}`}>
          <span className="text-[9px] font-bold text-secondary uppercase tracking-wider">
            {cat.age_bracket ||
              (cat.age_min !== null && cat.age_max !== null
                ? `${cat.age_min}-${cat.age_max}`
                : "")}{" "}
            | {cat.weight_class || cat.belt || "–"}
          </span>
          {isRunning ? (
            <span className="text-[9px] font-bold text-secondary bg-secondary/10 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
              Live
            </span>
          ) : (
            <span className="font-data-mono text-[10px] font-bold">
              {Math.ceil((cat.expected_matches * 109) / 60)}m
            </span>
          )}
        </div>

        <h5 className={`text-xs font-bold text-primary mb-1.5 ${isRunning ? "ml-2" : ""}`}>
          {cat.name}
        </h5>

        <div className={`flex gap-4 text-[10px] font-data-mono text-outline ${isRunning ? "ml-2" : ""}`}>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">group</span>
            {cat.athletes_count}
          </span>
        </div>

        {isRunning && (
          <div className="mt-2 ml-2">
            <div className="flex justify-between text-[9px] font-bold text-secondary mb-0.5">
              <span>{matchesDone} / {matchesTotal} matches</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-secondary h-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Stager Status Badge */}
        {stagerStatus && (
          <div
            className={`mt-2 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold ${
              stagerStatus === "calling"
                ? "bg-amber-100 text-amber-800 border border-amber-300"
                : "bg-green-100 text-green-800 border border-green-300"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">
              {stagerStatus === "calling" ? "notifications_active" : "check_circle"}
            </span>
            {stagerStatus === "calling"
              ? `Calling in progress by ${stagerActorName}`
              : `Ready — called by ${stagerActorName}`}
          </div>
        )}

        {/* Stager Action Buttons */}
        <div className="mt-2.5 pt-2.5 border-t border-outline-variant/30 flex gap-2">
          <button
            onClick={() => handleStagerAction(cat.id, "calling")}
            disabled={!!loadingAction}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[10px] font-bold transition-all border whitespace-nowrap select-none cursor-pointer ${
              stagerStatus === "calling"
                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                : "bg-amber-100/60 text-amber-800 border-amber-300 hover:bg-amber-200"
            } disabled:opacity-50`}
            title="Mark as In Progress — notify others you're calling this category"
          >
            {isCallingLoading ? (
              <span className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <span className="material-symbols-outlined text-[13px] shrink-0">notifications_active</span>
            )}
            <span className="whitespace-nowrap">{stagerStatus === "calling" ? "In Progress ✓" : "In Progress"}</span>
          </button>

          <button
            onClick={() => handleStagerAction(cat.id, "ready")}
            disabled={!!loadingAction}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[10px] font-bold transition-all border whitespace-nowrap select-none cursor-pointer ${
              stagerStatus === "ready"
                ? "bg-green-600 text-white border-green-600 shadow-sm"
                : "bg-green-100/60 text-green-800 border-green-300 hover:bg-green-200"
            } disabled:opacity-50`}
            title="Mark as Called — notify others this category is ready"
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
      {/* Top Nav */}
      <header className="flex justify-between items-center w-full px-3 sm:px-6 h-14 bg-surface-container-lowest border-b border-outline-variant shrink-0 z-10 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <span className="font-headline-lg font-black text-primary tracking-tighter text-sm sm:text-base shrink-0 whitespace-nowrap">Ring Flow</span>
          <div className="h-4 sm:h-6 w-[1px] bg-outline-variant shrink-0" />
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h2 className="font-headline-sm text-xs sm:text-sm md:text-headline-sm text-primary font-bold whitespace-nowrap">Tatami Board</h2>
            <span className="text-outline-variant hidden sm:inline">/</span>
            <span className="text-on-surface-variant font-label-caps text-xs opacity-70 truncate max-w-[120px] sm:max-w-[200px] md:max-w-none whitespace-nowrap">
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

      {/* Info Bar */}
      <div className="bg-primary text-on-primary px-3 sm:px-6 py-2 sm:py-2.5 flex items-center gap-3 sm:gap-6 shrink-0 overflow-x-auto text-xs">
        <div className="flex flex-col shrink-0">
          <span className="text-[9px] sm:text-[10px] font-label-caps opacity-60">TOTAL TATAMIS</span>
          <span className="font-data-mono text-xs sm:text-base font-bold">{initialRings.length} ACTIVE</span>
        </div>
        <div className="h-4 sm:h-5 w-[1px] bg-white/20 shrink-0" />
        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs opacity-80 truncate">
          <span className="material-symbols-outlined text-[15px] sm:text-[16px] shrink-0">info</span>
          <span className="truncate">Use In Progress & Called buttons to alert admin & ring team</span>
        </div>
      </div>

      {/* Ring Grid */}
      <div className="flex-1 overflow-x-auto bg-surface-container-low flex p-3 sm:p-5 gap-3 sm:gap-5 items-start">
        {initialRings.map((ring) => {
          const activeQueue = ringQueues[ring.id] || [];
          const completedQueue = ringCompletedQueues[ring.id] || [];

          return (
            <div
              key={ring.id}
              className="w-[85vw] max-w-[340px] sm:w-72 shrink-0 flex flex-col bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm h-full"
            >
              {/* Ring Header */}
              <div className="p-4 flex flex-col shrink-0 bg-primary text-on-primary">
                <h4 className="font-headline-sm text-lg tracking-tight leading-none mb-0.5">
                  {ring.name.replace(/Ring/i, "Tatami")}
                </h4>
                <span className="text-[9px] font-label-caps opacity-70">
                  {activeQueue.length} ACTIVE · {completedQueue.length} DONE
                </span>
              </div>

              {/* Active Queue */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {activeQueue.length === 0 && completedQueue.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-outline opacity-50">
                    <span className="material-symbols-outlined text-3xl mb-1">inbox</span>
                    <span className="text-xs">No categories assigned</span>
                  </div>
                )}

                {activeQueue.map((cat) => renderCategoryCard(cat, ring.id))}

                {/* Completed Categories (read-only, no buttons) */}
                {completedQueue.length > 0 && (
                  <div className="pt-2 border-t border-outline-variant/30">
                    <p className="text-[9px] font-label-caps text-on-surface-variant mb-2 uppercase">
                      Completed ({completedQueue.length})
                    </p>
                    {completedQueue.map((cat) => {
                      const rawTime = completedTimes[cat.id];
                      const timeStr = rawTime
                        ? new Date(rawTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Done";
                      return (
                        <div
                          key={cat.id}
                          className="p-2.5 bg-surface-container border border-outline-variant/40 rounded-lg flex items-center justify-between opacity-60 mb-1.5"
                        >
                          <span className="text-xs font-medium text-on-surface truncate">{cat.name}</span>
                          <span className="text-[9px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ml-2">
                            <span className="material-symbols-outlined text-[11px]">done_all</span>
                            {timeStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
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

      {/* Footer */}
      <footer className="h-9 bg-surface-container-highest border-t border-outline-variant px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-label-caps text-[10px] text-on-surface-variant">System Live</span>
        </div>
        <span className="text-[10px] text-on-surface-variant opacity-60">
          Stager: {stagerName} · Read-only · Click buttons on assigned categories
        </span>
      </footer>
    </div>
  );
}
