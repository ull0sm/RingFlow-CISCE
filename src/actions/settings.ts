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
