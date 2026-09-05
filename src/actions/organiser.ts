"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Ensures the currently authenticated user is registered in the public.organisers table.
 * Matches case-insensitively by email.
 * Returns the organiser's record.
 */
/**
 * Ensures the currently authenticated user is recognized as an organiser.
 * Matches case-insensitively by email against the organisers table OR any assigned tournament.
 * Returns the organiser's record.
 */
export async function ensureOrganiser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    throw new Error("Not authenticated");
  }

  const userEmail = user.email.trim().toLowerCase();

  // 1. Check if organiser exists in organisers table
  const { data: organiser } = await supabase
    .from("organisers")
    .select("*")
    .ilike("email", userEmail)
    .maybeSingle();

  if (organiser) {
    return organiser;
  }

  // 2. Check if this email is assigned to ANY tournament as organiser_email
  const { data: assignedTournament } = await supabase
    .from("tournaments")
    .select("id, organiser_email")
    .ilike("organiser_email", `%${userEmail}%`)
    .limit(1)
    .maybeSingle();

  if (assignedTournament) {
    // Auto-provision into organisers table for subsequent fast lookups
    const { data: newOrganiser } = await supabase
      .from("organisers")
      .upsert({ email: userEmail, name: user.user_metadata?.full_name || null }, { onConflict: "email" })
      .select("*")
      .single();

    if (newOrganiser) return newOrganiser;
    return { id: user.id, email: userEmail, name: user.user_metadata?.full_name || null };
  }

  throw new Error(`Unauthorized: Your email (${user.email}) is not registered as an organizer for any tournament.`);
}

/**
 * Ensures the authenticated user is an authorized organiser for the SPECIFIC tournament.
 * Returns the organiser role & tournament details.
 */
export async function ensureOrganiserHasAccessToTournament(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    throw new Error("Not authenticated");
  }

  // Admins have global access to any tournament
  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (admin) {
    return { role: "admin", email: user.email };
  }

  // Check tournament's assigned organiser email
  const { data: tournament, error: tourError } = await supabase
    .from("tournaments")
    .select("id, name, organiser_email")
    .eq("id", tournamentId)
    .single();

  if (tourError || !tournament) {
    throw new Error("Tournament not found");
  }

  const userEmail = user.email.toLowerCase().trim();
  const assigned = (tournament.organiser_email || "").toLowerCase();
  const allowedEmails = assigned.split(",").map((e: string) => e.trim()).filter(Boolean);

  if (!allowedEmails.includes(userEmail)) {
    throw new Error(`Unauthorized: Your account (${user.email}) is not assigned as an organizer for ${tournament.name}.`);
  }

  return { role: "organiser", email: user.email, tournament };
}

