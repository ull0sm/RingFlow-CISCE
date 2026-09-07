"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { ensureAdminOwnsTournament } from "./admin";
import { normalizeAccessCode, generateUnambiguousCode } from "@/lib/utils";

/**
 * Organiser requests access to a tournament using a 6-character access code.
 */
export async function requestOrganiserAccess(
  accessCode: string,
  organiserName: string,
  deviceInfo?: any,
  turnstileToken?: string
) {
  if (!turnstileToken) {
    return { success: false, error: "Security check is required." };
  }

  const { verifyTurnstileToken } = await import("./turnstile");
  const verification = await verifyTurnstileToken(turnstileToken);

  if (!verification.success) {
    return { success: false, error: verification.error || "Security check failed." };
  }

  const cleanCode = (accessCode || "").trim().toUpperCase();
  if (cleanCode.length < 6) {
    return { success: false, error: "Please enter a valid 6-character access code." };
  }

  const cleanName = (organiserName || "").trim().slice(0, 100);
  if (!cleanName) {
    return { success: false, error: "Please enter your name." };
  }

  const supabase = await createClient();

  // Try to resolve IP
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  let ip = "Unknown";
  if (forwardedFor) {
    ip = forwardedFor.split(",")[0].trim();
  } else {
    ip = headersList.get("x-real-ip") || "Unknown";
  }

  const finalDeviceInfo = {
    ...deviceInfo,
    ip: deviceInfo?.ip && deviceInfo.ip !== "Unknown" ? deviceInfo.ip : ip,
  };

  // 1. Locate tournament by organiser_code
  let { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, organiser_code")
    .ilike("organiser_code", cleanCode)
    .maybeSingle();

  // Fallback: match normalized code to prevent 0 vs O and 1 vs I/L confusion.
  // Only scan active/draft tournaments — completed ones won't have valid organiser sessions.
  if (!tournament) {
    const normInput = normalizeAccessCode(cleanCode);
    const { data: candidates } = await supabase
      .from("tournaments")
      .select("id, name, organiser_code")
      .not("organiser_code", "is", null)
      .in("status", ["draft", "active"]);

    if (candidates) {
      tournament =
        candidates.find(
          (t) => t.organiser_code && normalizeAccessCode(t.organiser_code) === normInput
        ) || null;
    }
  }


  if (!tournament) {
    return { success: false, error: "Invalid organiser access code. Please check with the administrator." };
  }

  const canonicalCode = tournament.organiser_code || cleanCode;

  // 2. Insert into organiser_requests with status 'pending'
  const { data: request, error: reqError } = await supabase
    .from("organiser_requests")
    .insert({
      tournament_id: tournament.id,
      access_code_used: canonicalCode,
      status: "pending",
      organiser_name: cleanName,
      device_info: finalDeviceInfo,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
    })
    .select("id")
    .single();

  if (reqError || !request) {
    console.error("Failed to create organiser request:", reqError);
    return { success: false, error: "Failed to submit access request. Please try again." };
  }

  return { success: true, requestId: request.id, tournamentName: tournament.name };
}

/**
 * Check request status from client waiting room polling or initial load.
 */
export async function checkOrganiserStatus(requestId: string) {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("organiser_requests")
    .select("status, session_token, tournament_id, expires_at")
    .eq("id", requestId)
    .single();

  if (!request) return { status: "not_found" };

  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
    return { status: "expired" };
  }

  return {
    status: request.status,
    sessionToken: request.session_token,
    tournamentId: request.tournament_id,
  };
}

/**
 * Admin approves an incoming organiser request. Multiple organisers can be approved concurrently.
 */
export async function approveOrganiserRequest(requestId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const sessionToken = crypto.randomUUID();

  const { error: updateError } = await supabase
    .from("organiser_requests")
    .update({ status: "approved", session_token: sessionToken })
    .eq("id", requestId)
    .eq("tournament_id", tournamentId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/admin/event/${tournamentId}/settings`);
  return { success: true };
}

/**
 * Admin rejects a pending organiser request.
 */
export async function rejectOrganiserRequest(requestId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("organiser_requests")
    .update({ status: "rejected" })
    .eq("id", requestId)
    .eq("tournament_id", tournamentId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/admin/event/${tournamentId}/settings`);
  return { success: true };
}

/**
 * Admin revokes an approved organiser's active session.
 */
export async function revokeOrganiserSession(requestId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("organiser_requests")
    .update({ status: "revoked", session_token: null })
    .eq("id", requestId)
    .eq("tournament_id", tournamentId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/admin/event/${tournamentId}/settings`);
  return { success: true };
}

/**
 * Admin regenerates the tournament's 6-character organiser access code.
 */
export async function regenerateOrganiserCode(tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const newCode = generateUnambiguousCode(6);

  const { error } = await supabase
    .from("tournaments")
    .update({ organiser_code: newCode })
    .eq("id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/settings`);
  return { success: true, organiser_code: newCode };
}

/**
 * Ensures the caller is an authorized organiser for the SPECIFIC tournament.
 * Accepts either:
 * 1) A logged-in Admin who owns the tournament
 * 2) An Organiser with an approved session_token in their org_token cookie.
 */
export async function ensureOrganiserHasAccessToTournament(tournamentId: string) {
  const supabase = await createClient();

  // 1. Check if authenticated admin
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase
      .from("admins")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (admin) {
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("id, name")
        .eq("id", tournamentId)
        .eq("admin_id", admin.id)
        .maybeSingle();

      if (tournament) {
        return { role: "admin", id: admin.id, tournament };
      }
    }
  }

  // 2. Check org_token cookie
  const cookieStore = await cookies();
  const orgToken = cookieStore.get("org_token")?.value;

  if (!orgToken) {
    throw new Error("Not authenticated: Missing organiser session");
  }

  const { data: request, error } = await supabase
    .from("organiser_requests")
    .select("id, tournament_id, status, organiser_name, expires_at, tournaments(name)")
    .eq("session_token", orgToken)
    .eq("status", "approved")
    .single();

  if (error || !request) {
    throw new Error("Not authenticated: Invalid or revoked organiser session");
  }

  if (request.expires_at && new Date(request.expires_at).getTime() < Date.now()) {
    throw new Error("Not authenticated: Organiser session expired");
  }

  if (request.tournament_id !== tournamentId) {
    throw new Error("Not authenticated: Not authorized for this tournament");
  }

  return {
    role: "organiser",
    id: request.id,
    name: request.organiser_name,
    tournamentId: request.tournament_id,
    tournament: request.tournaments,
  };
}

/**
 * Ensures the caller has general organiser access.
 */
export async function ensureOrganiser() {
  const supabase = await createClient();

  // Check admin
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase
      .from("admins")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (admin) {
      return { id: admin.id, name: "Administrator", role: "admin" };
    }
  }

  // Check org_token
  const cookieStore = await cookies();
  const orgToken = cookieStore.get("org_token")?.value;

  if (!orgToken) {
    throw new Error("Not authenticated");
  }

  const { data: request } = await supabase
    .from("organiser_requests")
    .select("id, tournament_id, status, organiser_name, expires_at")
    .eq("session_token", orgToken)
    .eq("status", "approved")
    .single();

  if (!request || (request.expires_at && new Date(request.expires_at).getTime() < Date.now())) {
    throw new Error("Not authenticated");
  }

  return {
    id: request.id,
    name: request.organiser_name,
    role: "organiser",
    tournamentId: request.tournament_id,
  };
}

/**
 * Log out the current organiser session.
 */
export async function logoutOrganiser() {
  const cookieStore = await cookies();
  cookieStore.delete("org_token");
  return { success: true };
}
