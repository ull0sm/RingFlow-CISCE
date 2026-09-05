"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Ensures the currently authenticated user is registered in the public.organisers table.
 * Matches case-insensitively by email.
 * Returns the organiser's record.
 */
export async function ensureOrganiser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    throw new Error("Not authenticated");
  }

  // Check if organiser exists by email (case-insensitive)
  const { data: organiser, error: organiserError } = await supabase
    .from("organisers")
    .select("*")
    .ilike("email", user.email.trim())
    .maybeSingle();

  if (organiserError) {
    console.error("Error fetching organiser status:", organiserError);
    throw new Error("Failed to verify organiser status.");
  }

  if (!organiser) {
    throw new Error(`Unauthorized: Your email (${user.email}) is not registered as an organizer.`);
  }

  return organiser;
}
