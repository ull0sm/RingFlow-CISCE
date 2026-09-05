"use server";

import { createClient } from "@/utils/supabase/server";
import { ensureAdminOwnsTournament } from "./admin";
import { ensureOrganiserHasAccessToTournament } from "./organiser";

export type AssignmentInput = {
  category_id: string;
  ring_id: string | null; // null means unassigned
  queue_order: number;
  status?: string;
  completed_at?: string | null;
};

export async function saveAssignments(tournamentId: string, assignments: AssignmentInput[]) {
  // Authorize admin or tournament-assigned organiser
  let isAuthorized = false;
  try {
    await ensureAdminOwnsTournament(tournamentId);
    isAuthorized = true;
  } catch {
    try {
      await ensureOrganiserHasAccessToTournament(tournamentId);
      isAuthorized = true;
    } catch {}
  }
  if (!isAuthorized) {
    throw new Error("Unauthorized to save assignments for this tournament");
  }

  const supabase = await createClient();

  // 1. Deduplicate payload by category_id (latest entry wins)
  const dedupedMap = new Map<string, AssignmentInput>();
  for (const a of assignments) {
    dedupedMap.set(a.category_id, a);
  }
  const cleanAssignments = Array.from(dedupedMap.values());
  const validAssignments = cleanAssignments.filter((a) => a.ring_id !== null);

  // 2. Fetch all ring IDs and valid categories for this tournament
  const [{ data: rings, error: ringsError }, { data: tournamentCategories, error: catError }] = await Promise.all([
    supabase.from("rings").select("id").eq("tournament_id", tournamentId),
    supabase.from("categories").select("id").eq("tournament_id", tournamentId)
  ]);

  if (ringsError || catError) {
    console.error("Error fetching rings or categories:", ringsError || catError);
    throw new Error("Failed to save assignments");
  }

  const validCatIds = new Set((tournamentCategories || []).map((c) => c.id));
  for (const a of validAssignments) {
    if (!validCatIds.has(a.category_id)) {
      throw new Error(`Category ${a.category_id} does not belong to this tournament`);
    }
  }

  const ringIds = (rings || []).map((r) => r.id);

  // 3. Fetch current live assignments to preserve matches_completed and guard running categories
  const { data: currentAssignments, error: fetchErr } = await supabase
    .from("category_assignments")
    .select("category_id, ring_id, status, matches_completed, completed_at")
    .in("ring_id", ringIds);

  if (fetchErr) {
    console.error("Error fetching current assignments:", fetchErr);
    throw new Error(`Failed to load current assignments: ${fetchErr.message}`);
  }

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

  // 5. Remove categories that were moved out of all rings (now unassigned)
  const incomingCategoryIds = new Set(validAssignments.map((a) => a.category_id));
  const toDelete = Array.from(currentMap.keys()).filter((catId) => !incomingCategoryIds.has(catId));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("category_assignments")
      .delete()
      .in("category_id", toDelete);

    if (deleteError) {
      console.error("Error deleting removed assignments:", deleteError);
      throw new Error("Failed to save assignments");
    }
  }

  // 6. Non-destructive update/insert: update existing rows by category_id to PRESERVE assignment ID UUIDs!
  if (validAssignments.length > 0) {
    const rows = validAssignments.map((a) => {
      const live = currentMap.get(a.category_id);
      const isExplicitRevert = a.status === "pending" && live?.status === "completed";
      return {
        ring_id: a.ring_id,
        category_id: a.category_id,
        queue_order: a.queue_order,
        status:
          isExplicitRevert || a.status === "pending"
            ? "pending"
            : (live?.status === "running" || live?.status === "paused"
                ? live.status
                : (a.status === "completed" ? "completed" : "pending")),
        matches_completed: isExplicitRevert ? 0 : (live?.matches_completed ?? 0),
        completed_at:
          isExplicitRevert || a.status === "pending"
            ? null
            : (a.status === "completed"
                ? (live?.completed_at || a.completed_at || new Date().toISOString())
                : null),
      };
    });

    const existingRows = rows.filter((r) => currentMap.has(r.category_id));
    const newRows = rows.filter((r) => !currentMap.has(r.category_id));

    // Stage A: Set negative temporary queue_order for existing rows to avoid transient (ring_id, queue_order) unique constraint conflicts
    if (existingRows.length > 0) {
      const stageAResults = await Promise.all(
        existingRows.map((r, idx) =>
          supabase
            .from("category_assignments")
            .update({ queue_order: -(idx + 5000) })
            .eq("category_id", r.category_id)
        )
      );

      for (const res of stageAResults) {
        if (res.error) {
          console.error("Error staging assignment queue order:", res.error);
          throw new Error(`Failed to stage assignment: ${res.error.message}`);
        }
      }

      // Stage B: Update existing rows with final values by category_id in-place
      const stageBResults = await Promise.all(
        existingRows.map((r) =>
          supabase
            .from("category_assignments")
            .update({
              ring_id: r.ring_id,
              queue_order: r.queue_order,
              status: r.status,
              matches_completed: r.matches_completed,
              completed_at: r.completed_at,
            })
            .eq("category_id", r.category_id)
        )
      );

      for (const res of stageBResults) {
        if (res.error) {
          console.error("Error updating category_assignment:", res.error);
          throw new Error(`Failed to update assignment: ${res.error.message}`);
        }
      }
    }

    // Stage C: Insert new rows for newly assigned categories
    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from("category_assignments")
        .insert(newRows);

      if (insertError) {
        console.error("Error inserting new assignments:", insertError);
        throw new Error("Failed to save assignments");
      }
    }
  }

  return { success: true };
}
