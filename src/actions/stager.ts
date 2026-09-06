"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { ensureAdminOwnsTournament } from "./admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StagerCode = {
  code: string;
  label: string;
};

// ─── Public: Request stager access ────────────────────────────────────────────

/**
 * Stager submits their access code + name to request tournament access.
 * Validates code against the stager_codes JSONB array on the tournament.
 */
export async function requestStagerAccess(
  accessCode: string,
  stagerName: string,
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

  const cleanName = (stagerName || "").trim().slice(0, 100);
  if (!cleanName) {
    return { success: false, error: "Please enter your name." };
  }

  const supabase = await createClient();

  // Resolve IP from headers
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

  // Find a tournament that has this code in its stager_codes JSONB array
  const { data: tournaments, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, stager_codes");

  if (tournamentError || !tournaments) {
    return { success: false, error: "Failed to validate access code. Please try again." };
  }

  // Match code against each tournament's stager_codes array
  let matchedTournament: { id: string; name: string } | null = null;
  for (const t of tournaments) {
    const codes: StagerCode[] = Array.isArray(t.stager_codes) ? t.stager_codes : [];
    if (codes.some((c) => c.code.toUpperCase() === cleanCode)) {
      matchedTournament = { id: t.id, name: t.name };
      break;
    }
  }

  if (!matchedTournament) {
    return { success: false, error: "Invalid stager access code. Please check with the tournament director." };
  }

  // Check if this code already has an active (approved/pending) session
  const { data: existingActive } = await supabase
    .from("stager_requests")
    .select("id, status")
    .eq("tournament_id", matchedTournament.id)
    .eq("access_code_used", cleanCode)
    .in("status", ["approved"])
    .maybeSingle();

  if (existingActive) {
    return {
      success: false,
      error: "This stager code is already in use by an active session. Each code allows one user at a time.",
    };
  }

  // Insert stager request
  const { data: request, error: reqError } = await supabase
    .from("stager_requests")
    .insert({
      tournament_id: matchedTournament.id,
      access_code_used: cleanCode,
      status: "pending",
      stager_name: cleanName,
      device_info: finalDeviceInfo,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
    })
    .select("id")
    .single();

  if (reqError || !request) {
    console.error("Failed to create stager request:", reqError);
    return { success: false, error: "Failed to submit access request. Please try again." };
  }

  return { success: true, requestId: request.id, tournamentName: matchedTournament.name };
}

// ─── Public: Poll request status (waiting room) ────────────────────────────

export async function checkStagerStatus(requestId: string) {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("stager_requests")
    .select("status, session_token, tournament_id, expires_at, stager_name")
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
    stagerName: request.stager_name,
  };
}

// ─── Admin: Approve / Reject / Revoke ─────────────────────────────────────

export async function approveStagerRequest(requestId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const sessionToken = crypto.randomUUID();

  const { error } = await supabase
    .from("stager_requests")
    .update({ status: "approved", session_token: sessionToken })
    .eq("id", requestId)
    .eq("tournament_id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return { success: true };
}

export async function rejectStagerRequest(requestId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("stager_requests")
    .update({ status: "rejected" })
    .eq("id", requestId)
    .eq("tournament_id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return { success: true };
}

export async function revokeStagerSession(requestId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("stager_requests")
    .update({ status: "revoked", session_token: null })
    .eq("id", requestId)
    .eq("tournament_id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return { success: true };
}

// ─── Admin: Generate stager codes ─────────────────────────────────────────

/**
 * Generates N new unique 6-char stager codes and APPENDS them to stager_codes.
 * Existing codes are never overwritten — codes accumulate so stagers can be
 * added at any point during the tournament.
 */
export async function generateStagerCodes(tournamentId: string, count: number) {
  await ensureAdminOwnsTournament(tournamentId);
  if (count < 1 || count > 50) {
    throw new Error("Count must be between 1 and 50.");
  }

  const supabase = await createClient();

  // Fetch existing codes
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("stager_codes")
    .eq("id", tournamentId)
    .single();

  const existing: StagerCode[] = Array.isArray(tournament?.stager_codes)
    ? tournament.stager_codes
    : [];

  const usedCodes = new Set(existing.map((c) => c.code.toUpperCase()));

  const newCodes: StagerCode[] = [];
  let attempts = 0;
  const startIndex = existing.length + 1;

  while (newCodes.length < count && attempts < 1000) {
    attempts++;
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    if (!usedCodes.has(candidate)) {
      usedCodes.add(candidate);
      newCodes.push({
        code: candidate,
        label: `Stager ${startIndex + newCodes.length}`,
      });
    }
  }

  const merged = [...existing, ...newCodes];

  const { error } = await supabase
    .from("tournaments")
    .update({ stager_codes: merged })
    .eq("id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return { success: true, stager_codes: merged };
}

/**
 * Remove a single stager code by its code value.
 */
export async function removeStagerCode(tournamentId: string, code: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("stager_codes")
    .eq("id", tournamentId)
    .single();

  const existing: StagerCode[] = Array.isArray(tournament?.stager_codes)
    ? tournament.stager_codes
    : [];

  const updated = existing.filter((c) => c.code.toUpperCase() !== code.toUpperCase());

  const { error } = await supabase
    .from("tournaments")
    .update({ stager_codes: updated })
    .eq("id", tournamentId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/event/${tournamentId}/rings`);
  return { success: true, stager_codes: updated };
}

// ─── Stager Auth Helpers ───────────────────────────────────────────────────

/**
 * Validates the stager_token cookie and checks it belongs to the given tournament.
 * Also allows authenticated admins who own the tournament.
 */
export async function ensureStagerHasAccessToTournament(tournamentId: string) {
  const supabase = await createClient();
  const cookieStore = await cookies();

  // 1. Check stager_token cookie first so the stager's actual registered name is used
  const stagerToken = cookieStore.get("stager_token")?.value;
  if (stagerToken) {
    const { data: request } = await supabase
      .from("stager_requests")
      .select("id, tournament_id, status, stager_name, session_token, expires_at, tournaments(name)")
      .or(`session_token.eq.${stagerToken},id.eq.${stagerToken}`)
      .eq("status", "approved")
      .maybeSingle();

    if (request && request.tournament_id === tournamentId) {
      if (!request.expires_at || new Date(request.expires_at).getTime() >= Date.now()) {
        const cookieName = cookieStore.get("stager_name")?.value;
        const finalName = request.stager_name || (cookieName ? decodeURIComponent(cookieName) : "Stager");
        return {
          role: "stager",
          id: request.id,
          name: finalName,
          tournamentId: request.tournament_id,
          tournament: (request as any).tournaments,
        };
      }
    }
  }

  // 2. Fallback: Allow authenticated admin who owns the tournament (for admin testing/preview)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase
      .from("admins")
      .select("id, full_name, email")
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
        const cookieName = cookieStore.get("stager_name")?.value;
        const resolvedName = cookieName
          ? decodeURIComponent(cookieName)
          : admin.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Admin";

        return { role: "admin", id: admin.id, name: resolvedName, tournament };
      }
    }
  }

  if (!stagerToken) {
    throw new Error("Not authenticated: Missing stager session");
  }

  throw new Error("Unauthorized: Invalid or expired stager session");
}

/**
 * General stager check (used in middleware-like contexts).
 */
export async function ensureStager() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const stagerToken = cookieStore.get("stager_token")?.value;
  if (stagerToken) {
    const { data: request } = await supabase
      .from("stager_requests")
      .select("id, tournament_id, status, stager_name, expires_at")
      .or(`session_token.eq.${stagerToken},id.eq.${stagerToken}`)
      .eq("status", "approved")
      .maybeSingle();

    if (request && (!request.expires_at || new Date(request.expires_at).getTime() >= Date.now())) {
      return {
        id: request.id,
        name: request.stager_name,
        role: "stager",
        tournamentId: request.tournament_id,
      };
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: admin } = await supabase
      .from("admins")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (admin) {
      const cookieName = cookieStore.get("stager_name")?.value;
      const adminName = cookieName
        ? decodeURIComponent(cookieName)
        : admin.full_name || user.user_metadata?.full_name || "Administrator";
      return { id: admin.id, name: adminName, role: "admin" };
    }
  }

  throw new Error("Not authenticated");
}

export async function logoutStager() {
  const cookieStore = await cookies();
  cookieStore.delete("stager_token");
  cookieStore.delete("stager_name");
  return { success: true };
}

// ─── Stager Board Action: Update category status ───────────────────────────

/**
 * Stager clicks "In Progress" or "Called" on a category card.
 * If the same status is clicked again, it clears (toggles off).
 */
export async function updateCategoryStagerStatus(
  categoryId: string,
  tournamentId: string,
  newStatus: "calling" | "ready" | null,
  stagerName?: string
) {
  // Validate stager has access and get canonical stager name
  const stagerInfo = await ensureStagerHasAccessToTournament(tournamentId);
  const effectiveName = stagerName && stagerName !== "Stager"
    ? stagerName
    : (stagerInfo.name || "Stager");

  const supabase = await createClient();

  const { error } = await supabase
    .from("category_assignments")
    .update({
      stager_status: newStatus,
      stager_name: newStatus ? effectiveName : null,
      stager_action_at: newStatus ? new Date().toISOString() : null,
    })
    .eq("category_id", categoryId);

  if (error) throw new Error(error.message);

  return { success: true };
}
