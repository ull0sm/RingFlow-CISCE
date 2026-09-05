"use server";

import { createClient } from "@/utils/supabase/server";
import { startRingTimer, pauseRingTimer, setAllRingTimers } from "./rings";

/**
 * Ensures the currently authenticated user exists in the public.admins table.
 * If not, it inserts them. Returns the admin's UUID.
 */
export async function ensureAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    const { data: fallbackAdmin } = await supabase.from("admins").select("id").limit(1).maybeSingle();
    return fallbackAdmin?.id || "00000000-0000-0000-0000-000000000000";
  }

  // Check if admin record exists
  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (admin) {
    return admin.id;
  }

  // First time: auto-register this authenticated user as admin
  try {
    await supabase
      .from("admins")
      .insert({ id: user.id, email: user.email });
  } catch (e) {
    console.warn("Could not insert admin record:", e);
  }

  return user.id;
}

export async function adminSetRingStatus(ringId: string, isPaused: boolean) {
  await ensureAdmin();
  const supabase = await createClient();

  const { data: ring } = await supabase
    .from("rings")
    .select("id, tournament_id")
    .eq("id", ringId)
    .single();

  if (!ring) return;

  // Update ring timer state directly
  if (isPaused) {
    await pauseRingTimer(ringId, ring.tournament_id);
  } else {
    await startRingTimer(ringId, ring.tournament_id);
  }

  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("ring_id", ringId)
    .in("status", isPaused ? ["running"] : ["paused"])
    .maybeSingle();

  if (!assignment) return;

  const nowIso = new Date().toISOString();
  const updatePayload: any = { status: isPaused ? "paused" : "running" };

  if (isPaused) {
    updatePayload.paused_at = nowIso;
  } else {
    let addSeconds = 0;
    if (assignment.paused_at) {
      addSeconds = Math.max(0, Math.floor((Date.now() - new Date(assignment.paused_at).getTime()) / 1000));
    }
    updatePayload.paused_at = null;
    updatePayload.total_paused_seconds = (assignment.total_paused_seconds || 0) + addSeconds;
  }

  await supabase
    .from("category_assignments")
    .update(updatePayload)
    .eq("id", assignment.id);

  await supabase
    .from("event_log")
    .insert({
      tournament_id: assignment.tournament_id,
      ring_id: ringId,
      category_id: assignment.category_id,
      action: isPaused ? "PAUSE_RING" : "RESUME_RING"
    });
}

export async function adminSetAllRingsStatus(tournamentId: string, isPaused: boolean) {
  await ensureAdmin();
  const supabase = await createClient();

  const { data: rings } = await supabase
    .from("rings")
    .select("id")
    .eq("tournament_id", tournamentId);

  const ringIds = rings?.map(r => r.id) || [];
  if (ringIds.length === 0) return;

  const { data: assignments } = await supabase
    .from("category_assignments")
    .select("*")
    .in("ring_id", ringIds)
    .in("status", isPaused ? ["running"] : ["paused"]);

  if (!assignments || assignments.length === 0) return;

  const nowIso = new Date().toISOString();
  const now = Date.now();

  for (const assignment of assignments) {
    let updatePayload: any = { status: isPaused ? "paused" : "running" };
    if (isPaused) {
      updatePayload.paused_at = nowIso;
    } else {
      let addSeconds = 0;
      if (assignment.paused_at) {
        addSeconds = Math.max(0, Math.floor((now - new Date(assignment.paused_at).getTime()) / 1000));
      }
      updatePayload.paused_at = null;
      updatePayload.total_paused_seconds = (assignment.total_paused_seconds || 0) + addSeconds;
    }

    await supabase
      .from("category_assignments")
      .update(updatePayload)
      .eq("id", assignment.id);

    await supabase
      .from("event_log")
      .insert({
        tournament_id: tournamentId,
        ring_id: assignment.ring_id,
        category_id: assignment.category_id,
        action: isPaused ? "PAUSE_RING" : "RESUME_RING"
      });
  }
}
