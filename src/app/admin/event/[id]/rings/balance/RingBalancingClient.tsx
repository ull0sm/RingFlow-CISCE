"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { saveAssignments } from "@/actions/balancing";
import { createClient } from "@/utils/supabase/client";
import StagerStatusIndicator from "@/components/ui/StagerStatusIndicator";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";

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
  created_at?: string;
  completed_at?: string | null;
  stager_status?: string | null;
  stager_name?: string | null;
};

interface Props {
  tournamentId: string;
  tournamentName: string;
  initialCategories: Category[];
  initialRings: Ring[];
  initialAssignments: Assignment[];
  completedTimes: Record<string, string>;
  readOnly?: boolean;
}

export default function RingBalancingClient({
  tournamentId,
  tournamentName,
  initialCategories,
  initialRings,
  initialAssignments,
  completedTimes,
  readOnly = false,
}: Props) {
  // State structure:
  // We need a list for "unassigned" and a list for each ring.
  const [unassigned, setUnassigned] = useState<Category[]>([]);
  const [ringQueues, setRingQueues] = useState<Record<string, Category[]>>({});
  const [ringCompletedQueues, setRingCompletedQueues] = useState<Record<string, Category[]>>({});
  // Save & Auto-save state
  const [isSaving, setIsSaving] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [saveStatusText, setSaveStatusText] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Drag confirmation state
  const [pendingDragResult, setPendingDragResult] = useState<DropResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);

  // History popover state
  const [historyOpenForRing, setHistoryOpenForRing] = useState<string | null>(null);

  // Revert category confirmation state
  const [pendingRevertCategory, setPendingRevertCategory] = useState<{ ringId: string; ringName: string; category: Category } | null>(null);

  // Filter & Sort State
  const [search, setSearch] = useState("");
  const [beltFilter, setBeltFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState("");
  const [sexFilter, setSexFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "athletes" | "weight">("athletes");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"idle" | "queue" | "completed">("idle");
  const [mobileShowPool, setMobileShowPool] = useState(false);

  // Toggle pool with mobile back button / history integration
  const togglePool = useCallback(() => {
    setMobileShowPool((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        if (next) {
          window.history.pushState({ poolOpen: true }, "");
        } else if (window.history.state?.poolOpen) {
          window.history.back();
          return prev;
        }
      }
      return next;
    });
  }, []);

  // Shrink unassigned pool when mobile back button is pressed
  useEffect(() => {
    const handlePopState = () => {
      setMobileShowPool(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Realtime assignments map for live match count, status, queue_order and stager status tracking
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, { matches_completed: number; status: string; ring_id: string; queue_order: number; stager_status: string | null; stager_name: string | null }>>({});

  useEffect(() => {
    const map: Record<string, { matches_completed: number; status: string; ring_id: string; queue_order: number; stager_status: string | null; stager_name: string | null }> = {};
    initialAssignments.forEach(a => {
      map[a.category_id] = {
        matches_completed: (a as any).matches_completed || 0,
        status: a.status || "pending",
        ring_id: a.ring_id,
        queue_order: a.queue_order ?? 0,
        stager_status: (a as any).stager_status ?? null,
        stager_name: (a as any).stager_name ?? null,
      };
    });
    setAssignmentsMap(map);
  }, [initialAssignments]);

  useEffect(() => {
    const supabase = createClient();
    const ringIds = initialRings.map(r => r.id);
    if (ringIds.length === 0) return;

    const channel = supabase.channel(`admin_balancing_${tournamentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'category_assignments'
      }, (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const updated = payload.new as any;
          if (!updated || !updated.category_id || !ringIds.includes(updated.ring_id)) return;
          setAssignmentsMap(prev => ({
              ...prev,
              [updated.category_id]: {
                matches_completed: updated.matches_completed || 0,
                status: updated.status || "pending",
                ring_id: updated.ring_id,
                queue_order: updated.queue_order ?? prev[updated.category_id]?.queue_order ?? 0,
                stager_status: updated.stager_status ?? null,
                stager_name: updated.stager_name ?? null,
              }
            }));

            // Handle real-time category completion: move from active queue to completed history
            if (updated.status === 'completed' && updated.ring_id) {
              setRingQueues(prev => {
                const currentRingQueue = prev[updated.ring_id] || [];
                const categoryItem = currentRingQueue.find(c => c.id === updated.category_id);
                if (categoryItem) {
                  const newRingQueue = currentRingQueue.filter(c => c.id !== updated.category_id);

                  setRingCompletedQueues(compPrev => {
                    const compQueue = compPrev[updated.ring_id] || [];
                    if (!compQueue.some(c => c.id === categoryItem.id)) {
                      return {
                        ...compPrev,
                        [updated.ring_id]: [categoryItem, ...compQueue]
                      };
                    }
                    return compPrev;
                  });

                  return {
                    ...prev,
                    [updated.ring_id]: newRingQueue
                  };
                }
                return prev;
              });
            }

            // Handle real-time queue status & reorder from moderator/DB
            if (
              updated.ring_id &&
              updated.status !== 'completed'
            ) {
              setRingQueues(prev => {
                const currentQueue = prev[updated.ring_id];
                if (!currentQueue) return prev;

                let catItem = currentQueue.find(c => c.id === updated.category_id);
                if (!catItem) {
                  for (const rId of Object.keys(prev)) {
                    const found = prev[rId].find(c => c.id === updated.category_id);
                    if (found) { catItem = found; break; }
                  }
                  if (!catItem) {
                    catItem = unassigned.find(c => c.id === updated.category_id);
                  }
                  if (!catItem) {
                    catItem = initialCategories.find(c => c.id === updated.category_id);
                  }
                }
                if (!catItem) return prev;

                const cleanQueue = currentQueue.filter(c => c.id !== updated.category_id);

                if (updated.status === 'running' || updated.status === 'paused') {
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

              // Clean from completed queues if it was completed earlier
              setRingCompletedQueues(compPrev => {
                let changed = false;
                const newComp = { ...compPrev };
                for (const rId of Object.keys(newComp)) {
                  if (newComp[rId]?.some(c => c.id === updated.category_id)) {
                    newComp[rId] = newComp[rId].filter(c => c.id !== updated.category_id);
                    changed = true;
                  }
                }
                return changed ? newComp : compPrev;
              });
            }
          }
        })
        .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, initialRings]);

  // Initialize state from props (once on mount)
  useEffect(() => {
    if (isInitialized) return;
    setIsInitialized(true);
    setIsMounted(true);
    setLastSaved(new Date());

    const ringMap: Record<string, Category[]> = {};
    const ringMapHistory: Record<string, Category[]> = {};
    initialRings.forEach(r => {
      ringMap[r.id] = [];
      ringMapHistory[r.id] = [];
    });

    const unassignedList: Category[] = [];

    initialCategories.forEach(cat => {
      const assignment = initialAssignments.find(a => a.category_id === cat.id);
      if (assignment && ringMap[assignment.ring_id]) {
        if (assignment.status === "completed") {
          ringMapHistory[assignment.ring_id].push(cat);
        } else {
          ringMap[assignment.ring_id].push(cat);
        }
      } else {
        unassignedList.push(cat);
      }
    });

    // Sort ring queues by original queue_order
    Object.keys(ringMap).forEach(ringId => {
      ringMap[ringId].sort((a, b) => {
        const orderA = initialAssignments.find(as => as.category_id === a.id)?.queue_order || 0;
        const orderB = initialAssignments.find(as => as.category_id === b.id)?.queue_order || 0;
        return orderA - orderB;
      });
    });

    setUnassigned(unassignedList);
    setRingQueues(ringMap);
    setRingCompletedQueues(ringMapHistory);
  }, [initialCategories, initialRings, initialAssignments, isInitialized]);

  const executeDrag = (result: DropResult) => {
    if (readOnly) return;
    const { source, destination, draggableId } = result;
    if (!destination) return;

    const sourceDroppableId = source.droppableId.startsWith("header_")
      ? source.droppableId.replace("header_", "")
      : source.droppableId;

    const destDroppableId = destination.droppableId.startsWith("header_")
      ? destination.droppableId.replace("header_", "")
      : destination.droppableId;

    if (sourceDroppableId === destDroppableId && source.index === destination.index && !destination.droppableId.startsWith("header_")) return;

    // 1. Create shallow copies of active queues
    let nextUnassigned = [...unassigned];
    const nextRingQueues: Record<string, Category[]> = {};
    Object.keys(ringQueues).forEach(key => {
      nextRingQueues[key] = [...ringQueues[key]];
    });

    // 2. Find and extract the category from wherever it currently resides
    let movedItem: Category | undefined = nextUnassigned.find(c => c.id === draggableId);
    if (!movedItem) {
      for (const rId of Object.keys(nextRingQueues)) {
        const found = nextRingQueues[rId].find(c => c.id === draggableId);
        if (found) {
          movedItem = found;
          break;
        }
      }
    }
    if (!movedItem) {
      movedItem = initialCategories.find(c => c.id === draggableId);
    }

    if (!movedItem) return;

    // Purge moved category completely from all queues to guarantee zero duplicates
    nextUnassigned = nextUnassigned.filter(c => c.id !== draggableId);
    Object.keys(nextRingQueues).forEach(key => {
      nextRingQueues[key] = nextRingQueues[key].filter(c => c.id !== draggableId);
    });

    // Frontend Safety Guard: Check if destination or source displacement interrupts an active running/paused category
    const prevUnassigned = [...unassigned];
    const prevRingQueues = { ...ringQueues };

    if (destDroppableId !== "unassigned") {
      const targetQueue = ringQueues[destDroppableId] || [];
      const topCat = targetQueue[0];
      const topStatus = topCat ? assignmentsMap[topCat.id]?.status : null;

      if (topCat && (topStatus === "running" || topStatus === "paused")) {
        // If moving item to position 0 (above running category)
        const isHeaderDrop = destination.droppableId.startsWith("header_");
        if (!isHeaderDrop && destination.index === 0 && movedItem.id !== topCat.id) {
          alert(`Cannot place above "${topCat.name}": it is currently live/running on this Tatami!`);
          return;
        }
      }
    }

    // Also check if trying to drag away or displace a running category itself from index 0
    if (sourceDroppableId !== "unassigned") {
      const sourceQueue = ringQueues[sourceDroppableId] || [];
      const sourceTop = sourceQueue[0];
      const sourceTopStatus = sourceTop ? assignmentsMap[sourceTop.id]?.status : null;
      if (sourceTop && (sourceTopStatus === "running" || sourceTopStatus === "paused")) {
        if (movedItem.id === sourceTop.id && destDroppableId !== sourceDroppableId) {
          alert(`Cannot move "${sourceTop.name}": it is currently live/running on Tatami!`);
          return;
        }
      }
    }

    // 3. Insert category into destination position
    if (destDroppableId === "unassigned") {
      const visibleAtDest = nextUnassigned
        .filter(cat => {
          if (search && !cat.name.toLowerCase().includes(search.toLowerCase())) return false;
          if (beltFilter && cat.belt !== beltFilter) return false;
          if (ageFilter && cat.age_bracket !== ageFilter) return false;
          if (sexFilter && cat.sex !== sexFilter) return false;
          return true;
        });
      const anchorItem = visibleAtDest[destination.index];
      if (anchorItem) {
        const anchorIndex = nextUnassigned.findIndex(c => c.id === anchorItem.id);
        nextUnassigned.splice(anchorIndex >= 0 ? anchorIndex : nextUnassigned.length, 0, movedItem);
      } else {
        nextUnassigned.push(movedItem);
      }
    } else {
      const destQueue = nextRingQueues[destDroppableId] || [];
      // Dropping on header automatically appends category to bottom of queue!
      const insertIndex = destination.droppableId.startsWith("header_")
        ? destQueue.length
        : Math.min(destination.index, destQueue.length);

      destQueue.splice(insertIndex, 0, movedItem);
      nextRingQueues[destDroppableId] = destQueue;
    }

    // Deduplicate queues to safeguard against any stray duplicate keys
    const seenCatIds = new Set<string>();
    nextUnassigned = nextUnassigned.filter(c => {
      if (seenCatIds.has(c.id)) return false;
      seenCatIds.add(c.id);
      return true;
    });
    Object.keys(nextRingQueues).forEach(key => {
      nextRingQueues[key] = nextRingQueues[key].filter(c => {
        if (seenCatIds.has(c.id)) return false;
        seenCatIds.add(c.id);
        return true;
      });
    });

    // 4. Update state atomically
    setUnassigned(nextUnassigned);
    setRingQueues(nextRingQueues);

    setAssignmentsMap(prev => {
      const nextMap = { ...prev };
      Object.keys(nextRingQueues).forEach(rId => {
        nextRingQueues[rId].forEach((cat, idx) => {
          nextMap[cat.id] = {
            ...nextMap[cat.id],
            ring_id: rId,
            queue_order: idx,
            status: nextMap[cat.id]?.status || "pending",
            matches_completed: nextMap[cat.id]?.matches_completed || 0,
            stager_status: nextMap[cat.id]?.stager_status ?? null,
            stager_name: nextMap[cat.id]?.stager_name ?? null,
          };
        });
      });
      return nextMap;
    });

    // 5. Trigger auto-save if enabled, passing previous state for rollback
    triggerAutoSaveIfNeeded(nextUnassigned, nextRingQueues, prevUnassigned, prevRingQueues);
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;

    const sourceDroppableId = source.droppableId.startsWith("header_")
      ? source.droppableId.replace("header_", "")
      : source.droppableId;

    const destDroppableId = destination.droppableId.startsWith("header_")
      ? destination.droppableId.replace("header_", "")
      : destination.droppableId;

    // Check if moving from one ring to another ring, or from a ring to unassigned
    if (sourceDroppableId !== "unassigned" && sourceDroppableId !== destDroppableId) {
      setPendingDragResult(result);
      setConfirmText("");
      return;
    }

    executeDrag(result);
  };

  const calculateRingMatchStats = (ringId: string) => {
    const activeCats = ringQueues[ringId] || [];
    const completedCats = ringCompletedQueues[ringId] || [];
    const allCats = [...activeCats, ...completedCats];

    let totalExpected = 0;
    let totalCompleted = 0;

    allCats.forEach(cat => {
      totalExpected += (cat.expected_matches || 0);
      const assignment = assignmentsMap[cat.id];
      if (assignment?.status === 'completed') {
        totalCompleted += (cat.expected_matches || 0);
      } else if (assignment) {
        totalCompleted += Math.min(cat.expected_matches || 0, assignment.matches_completed || 0);
      }
    });

    const percentage = totalExpected > 0 ? (totalCompleted / totalExpected) * 100 : 0;

    return { totalCompleted, totalExpected, percentage };
  };

  const handleSave = async () => {
    setIsSaving(true);
    const payloadMap = new Map<string, { category_id: string; ring_id: string | null; queue_order: number; status?: string; completed_at?: string | null }>();

    // Process unassigned
    unassigned.forEach((cat, idx) => {
      payloadMap.set(cat.id, { category_id: cat.id, ring_id: null, queue_order: idx });
    });

    // Process rings - active ring assignments take precedence
    Object.keys(ringQueues).forEach(ringId => {
      ringQueues[ringId].forEach((cat, idx) => {
        const liveStatus = assignmentsMap[cat.id]?.status;
        const effectiveStatus = (liveStatus === "running" || liveStatus === "paused") ? liveStatus : "pending";
        payloadMap.set(cat.id, {
          category_id: cat.id,
          ring_id: ringId,
          queue_order: idx,
          status: effectiveStatus,
          completed_at: null,
        });
      });
    });

    // Process completed categories (keep them assigned and completed if not currently in active queue)
    Object.keys(ringCompletedQueues).forEach(ringId => {
      ringCompletedQueues[ringId].forEach((cat, idx) => {
        if (!ringQueues[ringId]?.some(c => c.id === cat.id)) {
          const originalAssignment = initialAssignments.find(a => a.category_id === cat.id);
          payloadMap.set(cat.id, {
            category_id: cat.id,
            ring_id: ringId,
            queue_order: (ringQueues[ringId]?.length || 0) + idx,
            status: "completed",
            completed_at: originalAssignment?.completed_at || new Date().toISOString()
          });
        }
      });
    });

    const payload = Array.from(payloadMap.values());

    try {
      await saveAssignments(tournamentId, payload);
      setLastSaved(new Date());
      setSaveStatusText("Saved!");
      setTimeout(() => setSaveStatusText(null), 2500);
    } catch (err: any) {
      const msg: string = err?.message || "";
      if (msg.startsWith("RUNNING_CATEGORY_DISPLACED:")) {
        const catId = msg.replace("RUNNING_CATEGORY_DISPLACED:", "");
        const catName = initialCategories.find(c => c.id === catId)?.name || "A category";
        alert(`Cannot save: "${catName}" is currently running on a Tatami.\n\nA running category must stay at the top of its queue. Move it to the first position or wait for the moderator to finish it before saving.`);
      } else {
        alert("Failed to save assignments. Please try again.");
        console.error(err);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const triggerAutoSaveIfNeeded = (
    updatedUnassigned?: Category[],
    updatedRingQueues?: Record<string, Category[]>,
    prevUnassigned?: Category[],
    prevRingQueues?: Record<string, Category[]>,
    updatedCompletedQueues?: Record<string, Category[]>,
    prevCompletedQueues?: Record<string, Category[]>,
    updatedAssignmentsMap?: Record<string, { matches_completed: number; status: string; ring_id: string; queue_order: number; stager_status: string | null; stager_name: string | null }>,
    prevAssignmentsMap?: Record<string, { matches_completed: number; status: string; ring_id: string; queue_order: number; stager_status: string | null; stager_name: string | null }>
  ) => {
    if (!autoSave) return;

    // Perform save with latest state snapshot
    const targetUnassigned = updatedUnassigned || unassigned;
    const targetRingQueues = updatedRingQueues || ringQueues;
    const targetCompletedQueues = updatedCompletedQueues || ringCompletedQueues;
    const targetAssignmentsMap = updatedAssignmentsMap || assignmentsMap;

    setIsSaving(true);
    setSaveStatusText("Auto-saving...");
    const payloadMap = new Map<string, { category_id: string; ring_id: string | null; queue_order: number; status?: string; completed_at?: string | null }>();

    // Process unassigned
    targetUnassigned.forEach((cat, idx) => {
      payloadMap.set(cat.id, { category_id: cat.id, ring_id: null, queue_order: idx });
    });

    // Process rings
    Object.keys(targetRingQueues).forEach(ringId => {
      targetRingQueues[ringId].forEach((cat, idx) => {
        const liveInfo = targetAssignmentsMap[cat.id];
        const rawStatus = liveInfo?.status;
        const effectiveStatus = (rawStatus === "running" || rawStatus === "paused") ? rawStatus : "pending";
        payloadMap.set(cat.id, {
          category_id: cat.id,
          ring_id: ringId,
          queue_order: idx,
          status: effectiveStatus,
          completed_at: null,
        });
      });
    });

    // Process completed categories
    Object.keys(targetCompletedQueues).forEach(ringId => {
      targetCompletedQueues[ringId].forEach((cat, idx) => {
        if (!targetRingQueues[ringId]?.some(c => c.id === cat.id)) {
          const originalAssignment = initialAssignments.find(a => a.category_id === cat.id);
          payloadMap.set(cat.id, {
            category_id: cat.id,
            ring_id: ringId,
            queue_order: (targetRingQueues[ringId]?.length || 0) + idx,
            status: "completed",
            completed_at: originalAssignment?.completed_at || new Date().toISOString()
          });
        }
      });
    });

    const payload = Array.from(payloadMap.values());

    saveAssignments(tournamentId, payload)
      .then(() => {
        setLastSaved(new Date());
        setSaveStatusText("Auto-saved");
        setTimeout(() => setSaveStatusText(null), 2500);
      })
      .catch((err: any) => {
        // Rollback UI state if save failed
        if (prevUnassigned && prevRingQueues) {
          setUnassigned(prevUnassigned);
          setRingQueues(prevRingQueues);
        }
        if (prevCompletedQueues) {
          setRingCompletedQueues(prevCompletedQueues);
        }
        if (prevAssignmentsMap) {
          setAssignmentsMap(prevAssignmentsMap);
        }
        setSaveStatusText(null);

        const msg: string = err?.message || "";
        if (msg.startsWith("RUNNING_CATEGORY_DISPLACED:")) {
          const catId = msg.replace("RUNNING_CATEGORY_DISPLACED:", "");
          const catName = initialCategories.find(c => c.id === catId)?.name || "A category";
          alert(`Auto-save blocked & reverted: "${catName}" is currently running on a Tatami.\n\nA running category must stay at the top of its queue.`);
        } else {
          alert(`Failed to save: ${msg || "Unknown error"}`);
          console.error("Auto-save error:", err);
        }
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const handleConfirmRevert = () => {
    if (!pendingRevertCategory || readOnly) return;
    const { ringId, category } = pendingRevertCategory;

    const prevUnassigned = unassigned;
    const prevRingQueues = ringQueues;
    const prevCompletedQueues = ringCompletedQueues;
    const prevAssignmentsMap = assignmentsMap;

    // 1. Remove from completed queue
    const updatedCompletedList = (ringCompletedQueues[ringId] || []).filter(c => c.id !== category.id);
    const nextCompletedQueues = {
      ...ringCompletedQueues,
      [ringId]: updatedCompletedList,
    };

    // 2. Append to active tatami queue (restored to bottom of queue)
    const currentActiveQueue = ringQueues[ringId] || [];
    const isAlreadyInActive = currentActiveQueue.some(c => c.id === category.id);
    const nextActiveQueue = isAlreadyInActive ? currentActiveQueue : [...currentActiveQueue, category];
    const nextRingQueues = {
      ...ringQueues,
      [ringId]: nextActiveQueue,
    };

    // 3. New assignments map with status explicitly 'pending'
    const nextAssignmentsMap = {
      ...assignmentsMap,
      [category.id]: {
        matches_completed: 0,
        status: "pending",
        ring_id: ringId,
        queue_order: nextActiveQueue.length - 1,
        stager_status: null,
        stager_name: null,
      },
    };

    // 4. Update component state
    setAssignmentsMap(nextAssignmentsMap);
    setRingCompletedQueues(nextCompletedQueues);
    setRingQueues(nextRingQueues);
    setPendingRevertCategory(null);
    // Close the history view so user is back on active Tatami queue view!
    setHistoryOpenForRing(null);

    // 5. Trigger auto-save with nextAssignmentsMap
    triggerAutoSaveIfNeeded(
      unassigned,
      nextRingQueues,
      prevUnassigned,
      prevRingQueues,
      nextCompletedQueues,
      prevCompletedQueues,
      nextAssignmentsMap,
      prevAssignmentsMap
    );
  };

  const calculateRingWorkload = (ringId: string) => {
    const categories = ringQueues[ringId] || [];
    const totalMatches = categories.reduce((sum, cat) => sum + cat.expected_matches, 0);
    // 109 seconds per match (1 min 49 secs)
    const totalSeconds = totalMatches * 109;
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const calculateRingAthletes = (ringId: string) => {
    const categories = ringQueues[ringId] || [];
    return categories.reduce((sum, cat) => sum + cat.athletes_count, 0);
  };

  const isOverloaded = (ringId: string) => {
    const categories = ringQueues[ringId] || [];
    const totalMatches = categories.reduce((sum, cat) => sum + cat.expected_matches, 0);
    const totalSeconds = totalMatches * 109;
    return totalSeconds > 360 * 60; // > 6 hours
  };

  // Derive all queued categories (assigned to any ring, not completed)
  const queuedCategories = initialCategories.filter(cat => {
    const a = assignmentsMap[cat.id];
    return a && a.status !== 'completed' && !unassigned.some(u => u.id === cat.id);
  });

  // Derive all completed categories
  const allCompletedCategories = initialCategories.filter(cat => {
    const a = assignmentsMap[cat.id];
    return a && a.status === 'completed';
  });

  // Derive visible unassigned (only "idle" - not in any ring)
  const visibleUnassigned = unassigned
    .filter(cat => {
      if (search && !cat.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (beltFilter && cat.belt !== beltFilter) return false;
      if (ageFilter && cat.age_bracket !== ageFilter) return false;
      if (sexFilter && cat.sex !== sexFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let result = 0;
      if (sortBy === "athletes") {
        result = a.athletes_count - b.athletes_count;
      } else if (sortBy === "weight") {
        const getMinWeight = (w: string | null) => {
          if (!w) return 0;
          const match = w.match(/(\d+)/);
          return match ? parseInt(match[1]) : 0;
        };
        const weightA = getMinWeight(a.weight_class);
        const weightB = getMinWeight(b.weight_class);
        if (weightA !== weightB) {
          result = weightA - weightB;
        } else {
          result = (a.weight_class || "").localeCompare(b.weight_class || "");
        }
      } else {
        result = a.name.localeCompare(b.name);
      }
      return sortOrder === "asc" ? result : -result;
    });

  // Derive the sidebar panel list based on statusFilter
  const sidebarCategoriesToShow = statusFilter === "idle"
    ? visibleUnassigned
    : statusFilter === "queue"
      ? queuedCategories.filter(cat => search ? cat.name.toLowerCase().includes(search.toLowerCase()) : true)
      : allCompletedCategories.filter(cat => search ? cat.name.toLowerCase().includes(search.toLowerCase()) : true);

  const uniqueBelts = Array.from(new Set(initialCategories.map(c => c.belt).filter(Boolean)));
  const uniqueAges = Array.from(new Set(initialCategories.map(c => c.age_bracket).filter(Boolean)));
  const uniqueSexes = Array.from(new Set(initialCategories.map(c => c.sex).filter(Boolean)));

  // ── Overall Tournament Stats for Black Overview Strip ───────────────────────
  const totalCategoriesCount = initialCategories.length;
  
  // Track all completed categories across completed queues and live assignments
  const completedCategoryIds = new Set<string>();
  Object.values(ringCompletedQueues).forEach(queue => {
    queue.forEach(c => completedCategoryIds.add(c.id));
  });
  Object.entries(assignmentsMap).forEach(([catId, info]) => {
    if (info.status === "completed") completedCategoryIds.add(catId);
  });
  const completedCategoriesCount = completedCategoryIds.size;

  // Total Athletes across all categories
  const totalAthletesCount = initialCategories.reduce(
    (sum, cat) => sum + (cat.athletes_count || 0),
    0
  );

  // Match / Overall Progress
  let overallTotalExpectedMatches = 0;
  let overallCompletedMatches = 0;

  initialCategories.forEach(cat => {
    overallTotalExpectedMatches += (cat.expected_matches || 0);
    const assignment = assignmentsMap[cat.id];
    if (completedCategoryIds.has(cat.id) || assignment?.status === "completed") {
      overallCompletedMatches += (cat.expected_matches || assignment?.matches_completed || 0);
    } else if (assignment) {
      overallCompletedMatches += Math.min(cat.expected_matches || 0, assignment.matches_completed || 0);
    }
  });

  const overallProgressPct = overallTotalExpectedMatches > 0
    ? Math.round((overallCompletedMatches / overallTotalExpectedMatches) * 100)
    : (totalCategoriesCount > 0 ? Math.round((completedCategoriesCount / totalCategoriesCount) * 100) : 0);

  return (
    <div className="flex flex-col overflow-hidden w-full h-[calc(100dvh-4rem)] md:h-screen">
      {/* TopNavBar */}
      <header className="flex justify-between items-center w-full px-3 sm:px-8 h-14 sm:h-16 bg-surface-container-lowest border-b border-outline-variant shrink-0 z-10 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 md:gap-6 min-w-0 pr-1">
          <span className="text-sm sm:text-headline-lg font-black text-primary tracking-tighter shrink-0 whitespace-nowrap">Ring Flow</span>
          <div className="h-4 sm:h-8 w-[1px] bg-outline-variant shrink-0"></div>
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <h2 className="font-headline-sm text-xs sm:text-headline-sm text-primary whitespace-nowrap">Tatami Balancing</h2>
            <span className="text-outline-variant shrink-0 hidden xs:inline">/</span>
            <span className="text-on-surface-variant font-label-caps text-label-caps opacity-70 truncate max-w-[80px] sm:max-w-[200px] md:max-w-none whitespace-nowrap hidden xs:inline">{tournamentName}</span>
          </div>
        </div>

        {/* Developed by CruxStudios Badge */}
        <div className="flex items-center shrink-0">
          <a
            href="https://cruxstudios.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-[#1B1815] hover:bg-black text-[#F5F3EC] border border-[#E1DDCF]/40 hover:border-cyan-400/60 shadow-[0_2px_8px_rgba(27,24,21,0.12)] hover:shadow-[0_0_15px_rgba(0,229,255,0.25)] hover:-translate-y-0.5 transition-all duration-300"
          >
            <span className="font-['Inter',sans-serif] font-medium text-[9px] sm:text-[11px] text-[#F5F3EC]/90 group-hover:text-white transition-colors hidden sm:inline whitespace-nowrap">
              Developed by
            </span>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <img
                src="https://cruxstudios.dev/favicon.svg"
                alt="CruxStudios"
                className="h-3.5 sm:h-4 w-3.5 sm:w-4 drop-shadow-[0_0_6px_rgba(0,229,255,0.7)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300"
              />
              <span className="font-['Plus_Jakarta_Sans',sans-serif] font-black text-[10px] sm:text-[12.5px] text-white tracking-tight group-hover:text-[#00E5FF] transition-colors whitespace-nowrap">
                CruxStudios
              </span>
            </div>
            <svg
              className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-[#F5F3EC]/80 group-hover:text-[#00E5FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 hidden md:block"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </a>
        </div>
      </header>

      {/* Tournament Overview Bar */}
      <div className="bg-primary text-on-primary px-4 sm:px-8 py-2.5 sm:py-3 shrink-0 shadow-lg z-10 w-full">
        <div className="flex items-center justify-between w-full gap-3 sm:gap-8">
          {/* Stat 1: Completed Categories */}
          <div className="flex-1 flex flex-col items-start min-w-0">
            <span className="text-[9px] sm:text-[11px] font-label-caps opacity-60 tracking-wider whitespace-nowrap">CATEGORIES</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-data-mono text-xs sm:text-lg font-bold whitespace-nowrap">{completedCategoriesCount} / {totalCategoriesCount}</span>
              <span className="text-[9px] opacity-60 font-label-caps hidden sm:inline">DONE</span>
            </div>
          </div>

          <div className="h-6 sm:h-8 w-[1px] bg-white/20 shrink-0"></div>

          {/* Stat 2: Completed Matches */}
          <div className="flex-1 flex flex-col items-center min-w-0">
            <span className="text-[9px] sm:text-[11px] font-label-caps opacity-60 tracking-wider whitespace-nowrap">MATCHES</span>
            <span className="font-data-mono text-xs sm:text-lg font-bold whitespace-nowrap">{overallCompletedMatches} / {overallTotalExpectedMatches}</span>
          </div>

          <div className="h-6 sm:h-8 w-[1px] bg-white/20 shrink-0"></div>

          {/* Stat 3: Overall Progress */}
          <div className={`flex-1 flex flex-col ${readOnly ? "items-end" : "sm:items-center items-end"} min-w-0`}>
            <div className="w-full max-w-[200px] flex flex-col">
              <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                <span className="text-[9px] sm:text-[11px] font-label-caps opacity-60 tracking-wider whitespace-nowrap">PROGRESS</span>
                <span className="font-data-mono text-xs sm:text-sm font-bold text-secondary whitespace-nowrap">{overallProgressPct}%</span>
              </div>
              <div className="w-full bg-white/20 h-1.5 sm:h-2 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-secondary h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, overallProgressPct))}%` }}
                />
              </div>
            </div>
          </div>

          {!readOnly && (
            <>
              <div className="h-6 sm:h-8 w-[1px] bg-white/20 shrink-0 hidden sm:block"></div>
              <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                <div className="flex flex-col">
                  <span className="text-[9px] sm:text-[10px] font-label-caps opacity-60">SYNC MODE</span>
                  <button
                    onClick={() => setAutoSave(!autoSave)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-md text-xs font-bold transition-all border ${autoSave
                        ? 'bg-secondary/20 border-secondary text-white'
                        : 'bg-white/5 border-outline-variant/40 text-on-primary/70 hover:bg-white/10'
                      }`}
                    title="Toggle Auto Sync after drag and drop"
                  >
                    <span className={`w-2 h-2 rounded-full ${autoSave ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`}></span>
                    <span className="font-label-caps text-[10px] sm:text-xs whitespace-nowrap">{autoSave ? "AUTO SYNC ON" : "MANUAL SYNC"}</span>
                  </button>
                </div>

                {/* Show Save button only when Auto-Save is OFF */}
                {!autoSave && (
                  <div className="flex flex-col">
                    <span className="text-[9px] sm:text-[10px] font-label-caps opacity-60">ACTIONS</span>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-secondary text-white px-3 sm:px-4 py-1 rounded-md text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                    >
                      {isSaving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                      {isSaving ? "SAVING..." : "SAVE BALANCING"}
                    </button>
                  </div>
                )}

                {/* Design-System Aligned Status Cue */}
                {saveStatusText && (
                  <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-secondary text-white text-xs font-bold rounded-md shadow-md shrink-0">
                    <span className="material-symbols-outlined text-sm">sync</span>
                    <span className="font-label-caps text-[10px] sm:text-xs tracking-wider whitespace-nowrap">{saveStatusText}</span>
                  </div>
                )}
                {!saveStatusText && lastSaved && (
                  <span className="text-[10px] sm:text-[11px] opacity-70 font-data-mono hidden xl:inline whitespace-nowrap">
                    Synced {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden w-full relative">

          {/* Left Sidebar: Category Pool (expands inline; shrinks to 10% peek on mobile with > arrow) */}
          <section
            className={`h-full flex flex-col bg-surface-container-lowest border-r border-outline-variant shrink-0 relative transition-[width] duration-300 ease-in-out z-20 ${mobileShowPool
                ? "w-[85vw] max-w-[340px] md:w-80 shadow-lg md:shadow-none"
                : "w-[10vw] min-w-[36px] md:w-80 overflow-visible bg-surface-container-low/70 hover:bg-surface-container-low cursor-pointer select-none"
              }`}
            onClick={!mobileShowPool ? togglePool : undefined}
            title={!mobileShowPool ? "Expand unassigned categories" : undefined}
          >
            {/* Pop-out black button with white arrow */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePool();
              }}
              type="button"
              title={mobileShowPool ? "Shrink sidebar" : "Expand unassigned categories"}
              className="md:hidden absolute top-1/2 left-full -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-black text-white rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer z-50 flex items-center justify-center border-2 border-white/80"
            >
              <span className="material-symbols-outlined text-[22px] select-none leading-none text-white">
                {mobileShowPool ? "chevron_left" : "chevron_right"}
              </span>
            </button>

            {/* Inner Content Container */}
            <div
              className={`w-80 max-w-[85vw] md:max-w-none flex flex-col h-full transition-opacity duration-200 ${mobileShowPool
                  ? "opacity-100 overflow-y-auto"
                  : "opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto overflow-hidden"
                }`}
            >
              <div className="p-4 border-b border-outline-variant bg-surface-container-low flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-center">
                  <h3 className="font-label-caps text-label-caps text-primary">
                    {statusFilter === "idle" ? `Unassigned (${visibleUnassigned.length})` : statusFilter === "queue" ? `In Queue (${queuedCategories.length})` : `Completed (${allCompletedCategories.length})`}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSearch(""); setBeltFilter(""); setAgeFilter(""); setSexFilter("");
                      }}
                      className="text-[10px] text-secondary hover:underline"
                    >Clear Filters</button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePool();
                      }}
                      className="md:hidden p-1 rounded-md text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      title="Shrink sidebar"
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">chevron_left</span>
                    </button>
                  </div>
                </div>

                {/* Status Filter Tabs */}
                <div className="flex rounded-lg overflow-hidden border border-outline-variant bg-surface-container-high">
                  {(["idle", "queue", "completed"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(tab)}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${statusFilter === tab
                          ? 'bg-primary text-on-primary'
                          : 'text-on-surface-variant hover:bg-surface-container'
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded p-2 text-xs outline-none focus:border-secondary"
                />

                {/* Filters (only for idle) */}
                {statusFilter === "idle" && (
                  <div className="flex gap-2 flex-wrap">
                    {uniqueBelts.length > 0 && (
                      <select
                        value={beltFilter}
                        onChange={e => setBeltFilter(e.target.value)}
                        className="flex-1 min-w-[70px] bg-white border border-outline-variant rounded p-1 text-[10px] outline-none"
                      >
                        <option value="">All Belts</option>
                        {uniqueBelts.map(b => <option key={b as string} value={b as string}>{b}</option>)}
                      </select>
                    )}

                    {uniqueAges.length > 0 && (
                      <select
                        value={ageFilter}
                        onChange={e => setAgeFilter(e.target.value)}
                        className="flex-1 min-w-[70px] bg-white border border-outline-variant rounded p-1 text-[10px] outline-none"
                      >
                        <option value="">Age</option>
                        {uniqueAges.map(a => <option key={a as string} value={a as string}>{a}</option>)}
                      </select>
                    )}

                    <select
                      value={sexFilter}
                      onChange={e => setSexFilter(e.target.value)}
                      className="min-w-[60px] bg-white border border-outline-variant rounded p-1 text-[10px] outline-none"
                    >
                      <option value="">Sex</option>
                      {uniqueSexes.map(s => <option key={s as string} value={s as string}>{s}</option>)}
                    </select>

                    <div className="w-full flex gap-2">
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="flex-1 bg-white border border-outline-variant rounded p-1 text-[10px] outline-none"
                      >
                        <option value="name">Sort: Name</option>
                        <option value="athletes">Sort: Athletes</option>
                        <option value="weight">Sort: Weight</option>
                      </select>
                      <button
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        className="bg-white border border-outline-variant rounded p-1 text-[10px] flex items-center justify-center min-w-[40px] hover:bg-surface-container"
                      >
                        {sortOrder === "asc" ? "ASC" : "DESC"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Idle view: draggable categories */}
              {statusFilter === "idle" ? (
                <Droppable droppableId="unassigned">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 overflow-y-auto p-4 space-y-4 bg-surface-container-lowest ${snapshot.isDraggingOver ? 'bg-secondary/5' : ''}`}
                    >
                      {visibleUnassigned.map((cat, index) => (
                        <Draggable key={cat.id} draggableId={cat.id} index={index} isDragDisabled={readOnly}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`p-4 bg-white border ${snapshot.isDragging ? 'border-secondary shadow-lg' : 'border-outline-variant shadow-sm'} rounded-xl ${!readOnly ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex gap-1 flex-wrap">
                                  {cat.belt && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.belt}</span>}
                                  {cat.sex && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.sex}</span>}
                                  {cat.age_bracket ? (
                                    <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.age_bracket}</span>
                                  ) : (cat.age_min !== null || cat.age_max !== null) && (
                                    <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">
                                      {cat.age_min}-{cat.age_max}
                                    </span>
                                  )}
                                  {cat.weight_class && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.weight_class}</span>}
                                  {cat.day && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.day}</span>}
                                </div>
                                {!readOnly && <span className="material-symbols-outlined text-outline-variant text-sm">drag_indicator</span>}
                              </div>
                              <h4 className="font-headline-sm text-sm text-primary mb-3">
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  {cat.name}
                                  {cat.doc_url && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewingPdf({ url: cat.doc_url!, title: cat.name });
                                      }}
                                      title="View student list PDF"
                                      className="material-symbols-outlined text-[14px] text-outline hover:text-primary transition-colors shrink-0 cursor-pointer"
                                      style={{ fontVariationSettings: "'FILL' 0" }}
                                    >
                                      article
                                    </button>
                                  )}
                                </span>
                              </h4>
                              <div className="flex items-center justify-between pt-3 border-t border-outline-variant/30">
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center gap-1 font-data-mono text-[11px]"><span className="material-symbols-outlined text-[14px] text-outline">group</span> {cat.athletes_count}</span>
                                </div>
                                <span className="font-data-mono text-xs font-bold px-2 py-0.5 bg-primary text-on-primary rounded">{Math.ceil((cat.expected_matches * 109) / 60)}m</span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              ) : (
                /* Queue / Completed view: read-only greyed cards */
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {sidebarCategoriesToShow.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-outline opacity-60">
                      <span className="material-symbols-outlined text-3xl mb-2">inbox</span>
                      <span className="text-xs">No categories</span>
                    </div>
                  )}
                  {sidebarCategoriesToShow.map(cat => {
                    const assignment = assignmentsMap[cat.id];
                    const ringName = initialRings.find(r => r.id === assignment?.ring_id)?.name?.replace(/Ring/i, 'Tatami') || "";
                    const status = assignment?.status;
                    const isCompleted = status === 'completed';
                    const isRunning = status === 'running';
                    const isPaused = status === 'paused';
                    const hasLeftAccent = isRunning || isPaused || isCompleted;
                    const matchesDone = assignment?.matches_completed || 0;
                    const matchesTotal = cat.expected_matches || 0;
                    const pct = matchesTotal > 0 ? (matchesDone / matchesTotal) * 100 : 0;

                    return (
                      <div
                        key={cat.id}
                        className={`p-3 border rounded-xl relative overflow-hidden ${isPaused
                            ? 'bg-amber-500/5 border-amber-300 shadow-2xs'
                            : isRunning
                              ? 'bg-secondary/5 border-secondary/30 shadow-2xs'
                              : isCompleted
                                ? 'bg-surface-container border-outline-variant/50 opacity-60'
                                : 'bg-surface-container border-outline-variant/50 opacity-70'
                          }`}
                      >
                        {isPaused && (
                          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                        )}
                        {isRunning && (
                          <div className="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
                        )}
                        {isCompleted && (
                          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
                        )}
                        <div className={`flex gap-1 flex-wrap mb-1.5 ${hasLeftAccent ? 'ml-1.5' : ''}`}>
                          {cat.belt && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.belt}</span>}
                          {cat.sex && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.sex}</span>}
                          {cat.age_bracket && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.age_bracket}</span>}
                          {cat.weight_class && <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface rounded text-[9px] font-bold uppercase">{cat.weight_class}</span>}
                        </div>
                        <h4 className={`text-xs font-bold text-on-surface mb-1.5 ${hasLeftAccent ? 'ml-1.5' : ''}`}>{cat.name}</h4>
                        <div className={`flex justify-between items-center text-[10px] text-on-surface-variant mb-1 ${hasLeftAccent ? 'ml-1.5' : ''}`}>
                          <span className="flex items-center gap-1 font-bold">
                            <span className="material-symbols-outlined text-[12px]">{isCompleted ? 'done_all' : isPaused ? 'pause_circle' : 'schedule'}</span>
                            {ringName}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {cat.doc_url && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingPdf({ url: cat.doc_url!, title: cat.name });
                                }}
                                title="View student list PDF"
                                className="material-symbols-outlined text-[12px] text-outline hover:text-primary transition-colors shrink-0 cursor-pointer"
                                style={{ fontVariationSettings: "'FILL' 0" }}
                              >
                                article
                              </button>
                            )}
                            {assignment?.stager_status && (
                              <StagerStatusIndicator stagerStatus={assignment.stager_status} stagerActorName={assignment.stager_name} />
                            )}
                            {isPaused && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                                PAUSED
                              </span>
                            )}
                            {isRunning && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                LIVE
                              </span>
                            )}
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                                <span className="material-symbols-outlined text-[10px] text-blue-600">done_all</span>
                                DONE
                              </span>
                            )}
                          </div>
                        </div>
                        {(isRunning || isPaused || isCompleted) && (
                          <div className={`mt-1.5 ${hasLeftAccent ? 'ml-1.5' : ''}`}>
                            <div className="flex justify-between text-[9px] font-bold text-on-surface-variant mb-0.5">
                              <span>{matchesDone} / {matchesTotal} matches</span>
                              <span>{pct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-500 ${isCompleted ? 'bg-blue-600' : isPaused ? 'bg-amber-500' : 'bg-secondary'}`} style={{ width: `${Math.min(100, pct)}%` }}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Horizontal Scrollable Ring Grid */}
          <section className="flex-1 overflow-x-auto bg-surface-container-low flex p-3 sm:p-6 gap-3 sm:gap-6 items-start">
            {initialRings.map(ring => {
              const overloaded = isOverloaded(ring.id);
              const isHistoryView = historyOpenForRing === ring.id;

              if (isHistoryView) {
                return (
                  <div key={ring.id} className="w-[85vw] max-w-[340px] md:w-72 shrink-0 flex flex-col bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm h-full">
                    <div className="sticky top-0 z-10 p-4 flex justify-between items-start shrink-0 bg-surface-container-highest text-on-surface">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[20px] text-primary mt-1">history</span>
                        <div>
                          <h4 className="font-headline-sm text-lg tracking-tight leading-none mb-1">{ring.name.replace(/Ring/i, "Tatami")} History</h4>
                          <div className="flex gap-3 text-[10px] font-bold text-on-surface-variant uppercase">
                            <span>{ringCompletedQueues[ring.id]?.length || 0} Categories</span>
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">group</span> {ringCompletedQueues[ring.id]?.reduce((sum, cat) => sum + cat.athletes_count, 0) || 0} Athletes</span>
                          </div>
                        </div>
                      </div>
                      <button
                        className="p-1 rounded hover:bg-black/10 transition-colors flex items-center justify-center text-primary"
                        onClick={() => setHistoryOpenForRing(null)}
                        title="Back to Current"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {(!ringCompletedQueues[ring.id] || ringCompletedQueues[ring.id].length === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-outline opacity-70">
                          <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                          <span className="text-sm">No completed categories</span>
                        </div>
                      ) : (
                        ringCompletedQueues[ring.id].map(cat => {
                          const assignment = initialAssignments.find(a => a.category_id === cat.id);
                          const fallbackTime = assignment?.completed_at || assignment?.created_at;
                          const rawTime = completedTimes[cat.id] || fallbackTime;
                          const timeStr = rawTime ? new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Completed";
                          return (
                            <div key={cat.id} className="p-3 bg-white border border-outline-variant rounded-lg flex flex-col gap-1 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                              <div className="flex justify-between items-center ml-2">
                                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">
                                  {(cat.age_bracket || (cat.age_min !== null && cat.age_max !== null ? `${cat.age_min}-${cat.age_max}` : ""))} | {cat.weight_class || cat.belt || "-"}
                                </span>
                                <span suppressHydrationWarning className="text-[10px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
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
                                <span className="flex items-center gap-1 text-[10px] font-data-mono font-bold text-outline">
                                  <span className="material-symbols-outlined text-[12px]">group</span> {cat.athletes_count}
                                </span>
                              </div>
                              {!readOnly && (
                                <div className="flex justify-between items-center ml-2 mt-2 pt-2 border-t border-outline-variant/40">
                                  <button
                                    type="button"
                                    onClick={() => setPendingRevertCategory({ ringId: ring.id, ringName: ring.name, category: cat })}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-100/80 hover:bg-amber-200 active:bg-amber-300 border border-amber-300 rounded transition-colors shadow-xs cursor-pointer"
                                    title="Revert category back to active tatami queue"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">undo</span>
                                    Revert to Queue
                                  </button>
                                  <span className="text-[10px] text-on-surface-variant/60 font-medium">Put back to stack</span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              }


              return (
                <div key={ring.id} className="w-[85vw] max-w-[340px] md:w-72 shrink-0 flex flex-col bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm h-full">
                  {/* Header Droppable Shortcut Target */}
                  <Droppable droppableId={`header_${ring.id}`}>
                    {(providedHeader, snapshotHeader) => (
                      <div
                        ref={providedHeader.innerRef}
                        {...providedHeader.droppableProps}
                        className={`sticky top-0 z-10 p-4 flex flex-col shrink-0 relative transition-all ${snapshotHeader.isDraggingOver
                            ? 'bg-emerald-600 text-white ring-4 ring-emerald-400/50 shadow-xl'
                            : overloaded ? 'bg-error text-on-error' : 'bg-primary text-on-primary'
                          }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <div>
                            <h4 className="font-headline-sm text-lg tracking-tight leading-none mb-1">{ring.name.replace(/Ring/i, "Tatami")}</h4>
                            <span className="text-[9px] font-label-caps opacity-80">{overloaded ? "OVERLOADED" : "OPTIMUM CAPACITY"}</span>
                          </div>
                          <div className="relative flex items-center gap-1">
                            <button
                              className="p-1 rounded hover:bg-white/20 transition-colors flex items-center justify-center"
                              onClick={() => setHistoryOpenForRing(ring.id)}
                              title="View Completed Categories"
                            >
                              <span className="material-symbols-outlined text-[20px]">history</span>
                            </button>
                          </div>
                        </div>

                        {snapshotHeader.isDraggingOver && (
                          <div className="mt-2 bg-emerald-700 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 shadow-md animate-pulse">
                            <span className="material-symbols-outlined text-sm">south</span>
                            Append to Bottom of Queue
                          </div>
                        )}

                        <div className="hidden">{providedHeader.placeholder}</div>
                      </div>
                    )}
                  </Droppable>

                  {/* Workload Info */}
                  <div className={`p-3 border-b border-outline-variant flex items-center justify-around ${overloaded ? 'bg-error/5' : 'bg-secondary/5'}`}>
                    <div className="flex flex-col items-center">
                      <span className={`text-[9px] font-label-caps font-bold ${overloaded ? 'text-error' : 'text-on-surface-variant'}`}>EST TIME</span>
                      <span className={`font-data-mono text-lg font-black ${overloaded ? 'text-error' : 'text-secondary'}`}>{calculateRingWorkload(ring.id)}</span>
                    </div>
                    <div className="h-6 w-[1px] bg-outline-variant/50"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-label-caps font-bold text-on-surface-variant">ATHLETES</span>
                      <span className={`flex items-center gap-1 font-data-mono text-lg font-black ${overloaded ? 'text-error' : 'text-secondary'}`}>
                        <span className="material-symbols-outlined text-[15px]">group</span> {calculateRingAthletes(ring.id)}
                      </span>
                    </div>
                  </div>

                  {/* Queue Droppable */}
                  <Droppable droppableId={ring.id}>
                    {(provided, snapshot) => (
                      <div
                        className={`flex-1 overflow-y-auto p-3 space-y-3 ${snapshot.isDraggingOver ? 'bg-secondary/5' : ''}`}
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {ringQueues[ring.id]?.map((cat, index) => (
                          <Draggable key={cat.id} draggableId={cat.id} index={index} isDragDisabled={readOnly}>
                            {(provided, snapshot) => {
                              const catAssignment = assignmentsMap[cat.id];
                              const status = catAssignment?.status;
                              const isRunning = status === 'running';
                              const isPaused = status === 'paused';
                              const isCompleted = status === 'completed';
                              const hasLeftAccent = isRunning || isPaused || isCompleted;
                              const matchesDone = catAssignment?.matches_completed || 0;
                              const matchesTotal = cat.expected_matches || 0;
                              const pct = matchesTotal > 0 ? (matchesDone / matchesTotal) * 100 : 0;
                              const stagerStatus = catAssignment?.stager_status ?? null;
                              const stagerActorName = catAssignment?.stager_name ?? null;

                              return (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`p-3 border rounded-lg relative overflow-hidden ${isPaused
                                      ? 'bg-amber-500/5 border-amber-400/50 shadow-md'
                                      : isRunning
                                        ? 'bg-secondary/5 border-secondary/40 shadow-md'
                                        : isCompleted
                                          ? 'bg-surface-container/60 border-outline-variant opacity-80'
                                          : `bg-surface-container-lowest border-outline-variant ${snapshot.isDragging ? 'border-secondary shadow-lg' : ''}`
                                    } ${!readOnly ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                >
                                  {isPaused && (
                                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                                  )}
                                  {isRunning && (
                                    <div className="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
                                  )}
                                  {isCompleted && (
                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
                                  )}
                                  <div className={`flex justify-between items-center mb-1 ${hasLeftAccent ? 'ml-2' : ''}`}>
                                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isPaused ? 'text-amber-700' : isCompleted ? 'text-blue-700' : 'text-secondary'
                                      }`}>
                                      {(cat.age_bracket || (cat.age_min !== null && cat.age_max !== null ? `${cat.age_min}-${cat.age_max}` : ""))} | {cat.weight_class || cat.belt || "-"}
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
                                        <span className="font-data-mono text-[10px] font-bold text-on-surface-variant">{Math.ceil((cat.expected_matches * 109) / 60)}m</span>
                                      )}
                                    </div>
                                  </div>
                                  <h5 className={`text-xs font-bold text-primary mb-2 ${hasLeftAccent ? 'ml-2' : ''}`}>{cat.name}</h5>
                                  <div className={`flex gap-4 text-[10px] font-data-mono text-outline ${hasLeftAccent ? 'ml-2' : ''}`}>
                                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">group</span> {cat.athletes_count}</span>
                                  </div>
                                  {(isRunning || isPaused || isCompleted) && (
                                    <div className="mt-2 ml-2">
                                      <div className={`flex justify-between text-[9px] font-bold mb-0.5 ${isPaused ? 'text-amber-700' : isCompleted ? 'text-blue-700' : 'text-secondary'
                                        }`}>
                                        <span>{matchesDone} / {matchesTotal} matches</span>
                                        <span>{pct.toFixed(0)}%</span>
                                      </div>
                                      <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full transition-all duration-500 ease-out ${isPaused ? 'bg-amber-500' : isCompleted ? 'bg-blue-600' : 'bg-secondary'
                                            }`}
                                          style={{ width: `${Math.min(100, pct)}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </section>
        </div>
      </DragDropContext>

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-surface-container-highest border-t border-outline-variant px-4 sm:px-8 flex items-center justify-between shrink-0 z-10 w-full gap-2">
        <div className="flex gap-4 sm:gap-6 items-center min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="font-label-caps text-[10px] text-on-surface-variant whitespace-nowrap">System Live</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="material-symbols-outlined text-[14px] text-outline shrink-0">sync</span>
            <span className="font-label-caps text-[10px] text-on-surface-variant truncate whitespace-nowrap">
              {isMounted && lastSaved ? `Last saved at ${lastSaved.toLocaleTimeString()}` : "Not saved yet"}
            </span>
          </div>
        </div>

        {/* CruxStudios Footer Badge - only when not readOnly (Organiser has full FooterDemo at the end) */}
        {!readOnly && (
          <a
            href="https://cruxstudios.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1B1815] hover:bg-black text-[#F5F3EC] border border-[#E1DDCF]/40 hover:border-cyan-400/60 shadow-[0_2px_8px_rgba(27,24,21,0.12)] hover:shadow-[0_0_15px_rgba(0,229,255,0.25)] transition-all duration-300 shrink-0"
          >
            <span className="font-['Inter',sans-serif] font-medium text-[9px] text-[#F5F3EC]/90 group-hover:text-white transition-colors hidden xs:inline whitespace-nowrap">
              Developed by
            </span>
            <div className="flex items-center gap-1">
              <img
                src="https://cruxstudios.dev/favicon.svg"
                alt="CruxStudios"
                className="h-3.5 w-3.5 drop-shadow-[0_0_6px_rgba(0,229,255,0.7)] group-hover:scale-110 transition-all duration-300"
              />
              <span className="font-['Plus_Jakarta_Sans',sans-serif] font-black text-[11px] text-white tracking-tight group-hover:text-[#00E5FF] transition-colors whitespace-nowrap">
                CruxStudios
              </span>
            </div>
          </a>
        )}
      </footer>

      {/* Confirmation Modal */}
      {pendingDragResult && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPendingDragResult(null);
            }
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmText.trim().toLowerCase() === "confirm" && pendingDragResult) {
                executeDrag(pendingDragResult);
                setPendingDragResult(null);
              }
            }}
            className="bg-surface-container-lowest rounded-xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col border border-outline-variant"
          >
            <div className="p-6 bg-surface-container-low border-b border-outline-variant">
              <h3 className="font-headline-sm text-xl font-bold text-error flex items-center gap-2">
                <span className="material-symbols-outlined">warning</span>
                Confirm Move
              </h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-on-surface-variant">
                You are about to move a category that was already assigned to a tatami. Are you sure you want to proceed?
              </p>
              <div className="bg-error/10 p-4 rounded-lg border border-error/20">
                <label className="text-xs font-bold text-error block mb-2">Type "confirm" to proceed</label>
                <input
                  type="text"
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="confirm"
                  className="w-full bg-white border border-error/30 rounded p-2 text-sm outline-none focus:border-error focus:ring-1 focus:ring-error text-slate-900"
                />
              </div>
            </div>
            <div className="p-4 bg-surface-container flex justify-end gap-3 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setPendingDragResult(null)}
                className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={confirmText.trim().toLowerCase() !== "confirm"}
                className="px-4 py-2 bg-error text-white text-sm font-bold rounded hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Proceed with Move
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Revert Category Confirmation Modal */}
      {pendingRevertCategory && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPendingRevertCategory(null);
            }
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmRevert();
            }}
            className="bg-surface-container-lowest rounded-xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col border border-outline-variant"
          >
            <div className="p-6 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
              <h3 className="font-headline-sm text-xl font-bold text-amber-700 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600">undo</span>
                Confirm Revert to Queue
              </h3>
              <button
                type="button"
                onClick={() => setPendingRevertCategory(null)}
                className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
                title="Cancel (Esc)"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-on-surface leading-relaxed">
                Are you sure you want to pull <strong className="text-primary font-bold">{pendingRevertCategory.category.name}</strong> back to <strong className="text-primary font-bold">{pendingRevertCategory.ringName.replace(/Ring/i, "Tatami")}</strong>'s active queue?
              </p>
              <div className="bg-amber-500/10 p-3.5 rounded-lg border border-amber-500/20 text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1 text-amber-800">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  What will happen:
                </div>
                <ul className="list-disc list-inside text-[11px] text-amber-900/80 space-y-0.5 ml-1">
                  <li>Completion status will be cleared and reset back to <strong>pending</strong>.</li>
                  <li>Category will be restored to the bottom of the active tatami stack.</li>
                  <li>Tatami moderator will see it back in their active queue.</li>
                </ul>
              </div>
            </div>
            <div className="p-4 bg-surface-container flex justify-end items-center gap-3 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setPendingRevertCategory(null)}
                className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high rounded transition-colors"
              >
                Cancel <span className="text-xs opacity-60">(Esc)</span>
              </button>
              <button
                type="submit"
                autoFocus
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-sm font-bold rounded shadow transition-colors flex items-center gap-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">undo</span>
                Revert to Queue <span className="text-xs opacity-80">(Enter)</span>
              </button>
            </div>
          </form>
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
