"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureAdminOwnsTournament } from "./admin";

export async function updateTournamentSettings(
  tournamentId: string, 
  data: { 
    name: string; 
    event_date: string; 
    status: string; 
    venue: string; 
    city: string; 
    organiser_email?: string | null;
  }
) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const updatePayload: any = {
    name: data.name,
    event_date: data.event_date || null,
    status: data.status,
    venue: data.venue || null,
    city: data.city || null,
  };

  if (data.organiser_email !== undefined) {
    const cleanEmail = data.organiser_email?.trim().toLowerCase() || null;
    updatePayload.organiser_email = cleanEmail;

    // If an organiser email is assigned, ensure it is added to public.organisers
    // so they can authenticate via Google Sign-In as an organizer
    if (cleanEmail) {
      const emails = cleanEmail.split(",").map(e => e.trim()).filter(Boolean);
      for (const email of emails) {
        await supabase
          .from("organisers")
          .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
      }
    }
  }

  const { error } = await supabase
    .from("tournaments")
    .update(updatePayload)
    .eq("id", tournamentId);

  if (error) {
    console.error("Failed to update tournament settings:", error);
    throw new Error("Failed to update tournament settings");
  }

  revalidatePath(`/admin/event/${tournamentId}/settings`);
  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  revalidatePath(`/admin`);
  revalidatePath(`/organiser`);
}

export async function deleteTournament(tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) throw new Error(error.message);

  redirect("/admin");
}
