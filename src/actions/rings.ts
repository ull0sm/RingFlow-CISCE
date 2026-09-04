"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { ensureAdmin } from "./admin";

function generateAccessCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function addRing(tournamentId: string) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  // Verify tournament exists
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .single();

  if (!tournament) throw new Error("Unauthorized or tournament not found");

  // Get current ring count to determine order
  const { count } = await supabase
    .from("rings")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  const newOrder = (count || 0) + 1;
  const newName = `Tatami ${String(newOrder).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("rings")
    .insert({
      tournament_id: tournamentId,
      name: newName,
      ring_order: newOrder,
      access_code: generateAccessCode(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return data;
}

export async function regenerateRingCode(ringId: string, tournamentId: string) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  // Basic ownership check
  const { data: ring } = await supabase
    .from("rings")
    .select("tournament_id")
    .eq("id", ringId)
    .single();

  if (!ring || ring.tournament_id !== tournamentId) throw new Error("Ring not found");

  const newCode = generateAccessCode();
  const { error } = await supabase
    .from("rings")
    .update({ access_code: newCode })
    .eq("id", ringId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return { success: true, access_code: newCode };
}

export async function deleteRing(ringId: string, tournamentId: string) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  // Delete ring
  const { error } = await supabase
    .from("rings")
    .delete()
    .eq("id", ringId)
    .eq("tournament_id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
}

export async function startRingTimer(ringId: string, tournamentId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: ring } = await supabase
    .from("rings")
    .select("timer_status, timer_accumulated_seconds")
    .eq("id", ringId)
    .single();

  const accumulated = ring?.timer_accumulated_seconds || 0;

  const { error } = await supabase
    .from("rings")
    .update({
      timer_status: "running",
      timer_started_at: now,
      timer_paused_at: null,
      timer_accumulated_seconds: accumulated,
    })
    .eq("id", ringId);

  if (error) {
    console.error("Error starting ring timer:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  revalidatePath(`/organiser/event/${tournamentId}/dashboard`);
  return { success: true };
}

export async function pauseRingTimer(ringId: string, tournamentId: string) {
  const supabase = await createClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: ring } = await supabase
    .from("rings")
    .select("timer_status, timer_started_at, timer_accumulated_seconds")
    .eq("id", ringId)
    .single();

  if (!ring) return { success: false };

  let additionalSeconds = 0;
  if (ring.timer_status === "running" && ring.timer_started_at) {
    additionalSeconds = Math.max(0, Math.floor((now - new Date(ring.timer_started_at).getTime()) / 1000));
  }

  const newAccumulated = (ring.timer_accumulated_seconds || 0) + additionalSeconds;

  const { error } = await supabase
    .from("rings")
    .update({
      timer_status: "paused",
      timer_started_at: null,
      timer_paused_at: nowIso,
      timer_accumulated_seconds: newAccumulated,
    })
    .eq("id", ringId);

  if (error) {
    console.error("Error pausing ring timer:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  revalidatePath(`/organiser/event/${tournamentId}/dashboard`);
  return { success: true };
}

export async function resumeRingTimer(ringId: string, tournamentId: string) {
  return startRingTimer(ringId, tournamentId);
}

export async function resetRingTimer(ringId: string, tournamentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rings")
    .update({
      timer_status: "idle",
      timer_started_at: null,
      timer_paused_at: null,
      timer_accumulated_seconds: 0,
    })
    .eq("id", ringId);

  if (error) {
    console.error("Error resetting ring timer:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  revalidatePath(`/organiser/event/${tournamentId}/dashboard`);
  return { success: true };
}

export async function toggleRingTimer(ringId: string, tournamentId: string, currentStatus: string) {
  if (currentStatus === "running") {
    return pauseRingTimer(ringId, tournamentId);
  } else {
    return startRingTimer(ringId, tournamentId);
  }
}

export async function setAllRingTimers(tournamentId: string, pause: boolean) {
  const supabase = await createClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: rings } = await supabase
    .from("rings")
    .select("id, timer_status, timer_started_at, timer_accumulated_seconds")
    .eq("tournament_id", tournamentId);

  if (!rings || rings.length === 0) return { success: true };

  for (const ring of rings) {
    if (pause) {
      if (ring.timer_status === "running") {
        let additional = 0;
        if (ring.timer_started_at) {
          additional = Math.max(0, Math.floor((now - new Date(ring.timer_started_at).getTime()) / 1000));
        }
        await supabase
          .from("rings")
          .update({
            timer_status: "paused",
            timer_started_at: null,
            timer_paused_at: nowIso,
            timer_accumulated_seconds: (ring.timer_accumulated_seconds || 0) + additional,
          })
          .eq("id", ring.id);
      }
    } else {
      if (ring.timer_status !== "running") {
        await supabase
          .from("rings")
          .update({
            timer_status: "running",
            timer_started_at: nowIso,
            timer_paused_at: null,
          })
          .eq("id", ring.id);
      }
    }
  }

  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  revalidatePath(`/organiser/event/${tournamentId}/dashboard`);
  return { success: true };
}
