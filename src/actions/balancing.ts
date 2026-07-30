"use server";

import { createClient } from "@/utils/supabase/server";

export type AssignmentInput = {
  category_id: string;
  ring_id: string | null; // null means unassigned
  queue_order: number;
  status?: string;
  completed_at?: string | null;
};

export async function saveAssignments(tournamentId: string, assignments: AssignmentInput[]) {
  const supabase = await createClient();

  // 1. Validate payload for duplicate category IDs
  const seen = new Set<string>();
  const validAssignments = assignments.filter((a) => a.ring_id !== null);
  for (const a of validAssignments) {
    if (seen.has(a.category_id)) {
      console.error("Duplicate category_id in assignments payload:", a.category_id);
      throw new Error("Duplicate category assignment detected in payload");
    }
    seen.add(a.category_id);
  }

  // 2. Fetch all ring IDs for this tournament
  const { data: rings, error: ringsError } = await supabase
    .from("rings")
    .select("id")
    .eq("tournament_id", tournamentId);

  if (ringsError) {
    console.error("Error fetching rings:", ringsError);
    throw new Error("Failed to save assignments");
  }

  const ringIds = rings.map((r) => r.id);

  // 3. Fetch current live assignments to preserve matches_completed and guard running categories
  const { data: currentAssignments } = await supabase
    .from("category_assignments")
    .select("category_id, ring_id, status, matches_completed, completed_at")
    .in("ring_id", ringIds);

  const currentMap = new Map<string, { status: string; matches_completed: number; completed_at: string | null }>();
  (currentAssignments || []).forEach((a: any) => {
    currentMap.set(a.category_id, {
      status: a.status,
      matches_completed: a.matches_completed || 0,
      completed_at: a.completed_at || null,
    });
  });

  // 4. Guard: reject if a running/paused category is not at queue_order 0
  //    (means something was inserted above it, which would interrupt the moderator)
  for (const a of validAssignments) {
    const live = currentMap.get(a.category_id);
    if (live && (live.status === "running" || live.status === "paused")) {
      if (a.queue_order !== 0) {
        throw new Error(`RUNNING_CATEGORY_DISPLACED:${a.category_id}`);
      }
    }
  }

  // 5. Build assignments list for assigned categories
  if (validAssignments.length > 0) {
    const rows = validAssignments.map((a) => {
      const live = currentMap.get(a.category_id);
      return {
        ring_id: a.ring_id,
        category_id: a.category_id,
        queue_order: a.queue_order,
        // Preserve live status for running/paused; use incoming status otherwise
        status:
          live?.status === "running" || live?.status === "paused"
            ? live.status
            : (a.status === "completed" ? "completed" : (live?.status || a.status || "pending")),
        // CRITICAL: never reset match progress — carry forward from DB
        matches_completed: live?.matches_completed ?? 0,
        completed_at:
          a.status === "completed"
            ? (live?.completed_at || a.completed_at || new Date().toISOString())
            : (live?.completed_at || null),
      };
    });

    // To prevent composite primary key / unique constraint failures across rings during swaps,
    // delete all existing assignments for these rings first, then insert rows with preserved progress!
    const { error: clearError } = await supabase
      .from("category_assignments")
      .delete()
      .in("ring_id", ringIds);

    if (clearError) {
      console.error("Error clearing assignments before save:", clearError);
      throw new Error("Failed to save assignments");
    }

    const { error: insertError } = await supabase
      .from("category_assignments")
      .insert(rows);

    if (insertError) {
      console.error("Error inserting updated assignments:", insertError);
      throw new Error("Failed to save assignments");
    }
  } else {
    // All categories unassigned -> clear ring assignments
    const { error: clearError } = await supabase
      .from("category_assignments")
      .delete()
      .in("ring_id", ringIds);

    if (clearError) {
      console.error("Error clearing assignments:", clearError);
      throw new Error("Failed to save assignments");
    }
  }

  return { success: true };
}
