"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { ensureAdmin } from "./admin";

export async function approveModeratorRequest(requestId: string, ringId: string, tournamentId: string) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  const sessionToken = crypto.randomUUID();

  // 1. Mark request as approved (scoped to ringId)
  const { error: updateError } = await supabase
    .from("moderator_requests")
    .update({ status: "approved", session_token: sessionToken })
    .eq("id", requestId)
    .eq("ring_id", ringId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  return { success: true };
}

export async function rejectModeratorRequest(requestId: string, tournamentId: string) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  // Verify request belongs to the tournament
  const { data: req } = await supabase
    .from("moderator_requests")
    .select("ring_id, rings!inner(tournament_id)")
    .eq("id", requestId)
    .single();

  if (!req || (req.rings as any)?.tournament_id !== tournamentId) {
    throw new Error("Request not found in this tournament");
  }

  const { error: updateError } = await supabase
    .from("moderator_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  return { success: true };
}

export async function revokeActiveModeratorSession(ringId: string, tournamentId: string) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  // Verify ring belongs to the tournament
  const { data: ring } = await supabase
    .from("rings")
    .select("id")
    .eq("id", ringId)
    .eq("tournament_id", tournamentId)
    .single();

  if (!ring) throw new Error("Ring not found in this tournament");

  // Invalidate all approved sessions for this ring by changing status to revoked and wiping session_token
  const { error } = await supabase
    .from("moderator_requests")
    .update({ status: "revoked", session_token: null })
    .eq("ring_id", ringId)
    .eq("status", "approved");

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  return { success: true };
}

export async function requestModeratorAccess(accessCode: string, moderatorName?: string, deviceInfo?: any, turnstileToken?: string) {
  if (!turnstileToken) {
    return { success: false, error: "Security check is required." };
  }

  const { verifyTurnstileToken } = await import("./turnstile");
  const verification = await verifyTurnstileToken(turnstileToken);
  
  if (!verification.success) {
    return { success: false, error: verification.error || "Security check failed." };
  }

  const supabase = await createClient();

  // Try to get IP
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  let ip = "Unknown";
  if (forwardedFor) {
    ip = forwardedFor.split(',')[0];
  } else {
    ip = headersList.get('x-real-ip') || "Unknown";
  }

  // Merge IP if not set by client
  const finalDeviceInfo = {
    ...deviceInfo,
    ip: deviceInfo?.ip && deviceInfo.ip !== "Unknown" ? deviceInfo.ip : ip
  };

  // 1. Find the ring by access code
  const { data: ring, error: ringError } = await supabase
    .from("rings")
    .select("id, name, tournament_id")
    .eq("access_code", accessCode)
    .single();

  if (ringError || !ring) {
    return { success: false, error: "Invalid access code." };
  }

  // 2. Create moderator_requests entry
  const { data: request, error: reqError } = await supabase
    .from("moderator_requests")
    .insert({
      ring_id: ring.id,
      access_code_used: accessCode,
      status: "pending",
      moderator_name: moderatorName || "Unknown",
      device_info: finalDeviceInfo,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    })
    .select("id")
    .single();

  if (reqError || !request) {
    console.error("Failed to create request", reqError);
    return { success: false, error: "Failed to request access." };
  }

  return { success: true, requestId: request.id };
}

export async function checkModeratorStatus(requestId: string) {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("moderator_requests")
    .select("status, session_token, ring_id, expires_at")
    .eq("id", requestId)
    .single();

  if (!request) return { status: "not_found" };

  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
    return { status: "expired" };
  }
  
  return { 
    status: request.status, 
    sessionToken: request.session_token,
    ringId: request.ring_id 
  };
}

export async function validateModeratorSession(ringId: string, token: string) {
  const supabase = await createClient();
  
  const { data: latestRequest } = await supabase
    .from("moderator_requests")
    .select("id, session_token, status, moderator_name, expires_at")
    .eq("ring_id", ringId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latestRequest) return false;
  
  // Check token expiration (24h default)
  if (latestRequest.expires_at && new Date(latestRequest.expires_at).getTime() < Date.now()) {
    return false;
  }

  // Exclusivity: 1 ring = 1 active moderator. 
  // Must match the *latest* approved session token.
  if (latestRequest.session_token === token) {
    return latestRequest;
  }
  return false;
}

export async function startCategory(assignmentId: string, ringId: string) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();
  
  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
    
  if (!assignment || assignment.ring_id !== ringId) throw new Error("Assignment not found on this ring");

  const nowIso = new Date().toISOString();
  const updatePayload: any = { status: "running" };
  if (!assignment.started_at) {
    updatePayload.started_at = nowIso;
  }
  if (assignment.paused_at) {
    const pausedSeconds = Math.max(0, Math.floor((Date.now() - new Date(assignment.paused_at).getTime()) / 1000));
    updatePayload.total_paused_seconds = (assignment.total_paused_seconds || 0) + pausedSeconds;
    updatePayload.paused_at = null;
  }

  const { error: updateError } = await supabase
    .from("category_assignments")
    .update(updatePayload)
    .eq("id", assignmentId);

  if (updateError) throw new Error("Update failed: " + updateError.message);

  await supabase
    .from("event_log")
    .insert({
      tournament_id: assignment.tournament_id,
      ring_id: ringId,
      category_id: assignment.category_id,
      action: "START_CATEGORY",
      moderator_session_id: modToken?.includes("-") ? modToken : null // Basic check if it's a UUID
    });
}

// In-memory sliding window rate limiter for adjustMatchCount
const recentAdjustmentsMap = new Map<string, number[]>();

export async function adjustMatchCount(assignmentId: string, ringId: string, delta: number) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  // Server-side spam protection: reject if 3 or more rapid adjustments within 2.5s for this ring
  const now = Date.now();
  const windowMs = 2500;
  const history = (recentAdjustmentsMap.get(ringId) || []).filter(t => now - t < windowMs);

  if (history.length >= 2) { // 2 previous + 1 current = 3 requests in short window
    // Clear window and reject to protect DB
    recentAdjustmentsMap.set(ringId, []);
    throw new Error("Too many rapid attempts detected. Action rejected.");
  }

  history.push(now);
  recentAdjustmentsMap.set(ringId, history);

  const supabase = await createClient();
  
  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
    
  if (!assignment || assignment.ring_id !== ringId) throw new Error("Assignment not found on this ring");

  const newCount = Math.max(0, assignment.matches_completed + delta);

  // Perform update with 1 automatic retry on transient error
  let updateResult = await supabase
    .from("category_assignments")
    .update({ matches_completed: newCount })
    .eq("id", assignmentId);

  if (updateResult.error) {
    // Retry after 200ms
    await new Promise(res => setTimeout(res, 200));
    updateResult = await supabase
      .from("category_assignments")
      .update({ matches_completed: newCount })
      .eq("id", assignmentId);
  }

  if (updateResult.error) throw new Error("Database error: " + updateResult.error.message);

  await supabase
    .from("event_log")
    .insert({
      tournament_id: assignment.tournament_id,
      ring_id: ringId,
      category_id: assignment.category_id,
      action: delta > 0 ? "MATCH_COMPLETED_INCREMENT" : "MATCH_COMPLETED_DECREMENT",
      metadata: { delta },
      moderator_session_id: modToken?.includes("-") ? modToken : null
    });

  return { success: true, matches_completed: newCount };
}

export async function finishCategory(assignmentId: string, ringId: string) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();
  
  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
    
  if (!assignment || assignment.ring_id !== ringId) throw new Error("Assignment not found on this ring");

  const { error: updateError } = await supabase
    .from("category_assignments")
    .update({ 
      status: "completed",
      completed_at: new Date().toISOString()
    })
    .eq("id", assignmentId);

  if (updateError) throw new Error("Update failed: " + updateError.message);

  await supabase
    .from("event_log")
    .insert({
      tournament_id: assignment.tournament_id,
      ring_id: ringId,
      category_id: assignment.category_id,
      action: "FINISH_CATEGORY",
      moderator_session_id: modToken?.includes("-") ? modToken : null
    });
}

export async function setRingStatus(assignmentId: string, ringId: string, isPaused: boolean) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();
  
  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
    
  if (!assignment || assignment.ring_id !== ringId) throw new Error("Assignment not found on this ring");

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

  const { error: updateError } = await supabase
    .from("category_assignments")
    .update(updatePayload)
    .eq("id", assignmentId);

  if (updateError) throw new Error("Update failed: " + updateError.message);

  await supabase
    .from("event_log")
    .insert({
      tournament_id: assignment.tournament_id,
      ring_id: ringId,
      category_id: assignment.category_id,
      action: isPaused ? "PAUSE_RING" : "RESUME_RING",
      moderator_session_id: modToken?.includes("-") ? modToken : null
    });
}

export async function pauseCurrentRingAssignment(ringId: string) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();
  
  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("ring_id", ringId)
    .in("status", ["running"])
    .maybeSingle();

  if (assignment) {
    // Re-use setRingStatus to pause it
    await setRingStatus(assignment.id, ringId, true);
  }
}

export async function logRingEvent(ringId: string, actionName: "EMERGENCY_ALERT" | "PAUSE_RING" | "REQUEST_ASSISTANCE", metadata?: any) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();

  const { data: ring } = await supabase.from("rings").select("tournament_id").eq("id", ringId).single();
  if (!ring) return;

  await supabase
    .from("event_log")
    .insert({
      tournament_id: ring.tournament_id,
      ring_id: ringId,
      action: actionName,
      metadata: metadata || null,
      moderator_session_id: modToken?.includes("-") ? modToken : null
    });
}

export async function returnCategoryToQueue(assignmentId: string, ringId: string) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();
  
  const { data: assignment } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
    
  if (!assignment || assignment.ring_id !== ringId) throw new Error("Assignment not found on this ring");

  const { error: updateError } = await supabase
    .from("category_assignments")
    .update({ 
      status: "pending", 
      completed_at: null 
    })
    .eq("id", assignmentId);

  if (updateError) throw new Error("Update failed: " + updateError.message);

  await supabase
    .from("event_log")
    .insert({
      tournament_id: assignment.tournament_id,
      ring_id: ringId,
      category_id: assignment.category_id,
      action: "RETURNED_TO_QUEUE",
      moderator_session_id: modToken?.includes("-") ? modToken : null
    });
}

export async function reorderCategory(assignmentId: string, ringId: string, direction: "up" | "down") {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken || !(await validateModeratorSession(ringId, modToken))) {
    throw new Error("Unauthorized: Session is not the active moderator.");
  }

  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("category_assignments")
    .select("*")
    .eq("ring_id", ringId)
    .eq("status", "pending")
    .order("queue_order", { ascending: true });

  if (!assignments || assignments.length === 0) return;

  const currentIndex = assignments.findIndex(a => a.id === assignmentId);
  if (currentIndex === -1) return;

  if (direction === "up" && currentIndex > 0) {
    const prev = assignments[currentIndex - 1];
    const curr = assignments[currentIndex];
    
    await supabase.from("category_assignments").update({ queue_order: -1 }).eq("id", curr.id);
    await supabase.from("category_assignments").update({ queue_order: curr.queue_order }).eq("id", prev.id);
    await supabase.from("category_assignments").update({ queue_order: prev.queue_order }).eq("id", curr.id);
  } else if (direction === "down" && currentIndex < assignments.length - 1) {
    const next = assignments[currentIndex + 1];
    const curr = assignments[currentIndex];
    
    await supabase.from("category_assignments").update({ queue_order: -1 }).eq("id", curr.id);
    await supabase.from("category_assignments").update({ queue_order: curr.queue_order }).eq("id", next.id);
    await supabase.from("category_assignments").update({ queue_order: next.queue_order }).eq("id", curr.id);
  }
}

export async function logoutModerator() {
  const cookieStore = await cookies();
  cookieStore.delete("mod_token");
}

export async function updateModeratorName(requestId: string, newName: string) {
  const cookieStore = await cookies();
  const modToken = cookieStore.get("mod_token")?.value;
  if (!modToken) {
    throw new Error("Unauthorized: Active moderator session required.");
  }

  const supabase = await createClient();
  
  const { error } = await supabase
    .from("moderator_requests")
    .update({ moderator_name: newName.trim() })
    .eq("id", requestId)
    .eq("session_token", modToken);
    
  if (error) {
    throw new Error(error.message);
  }
}
