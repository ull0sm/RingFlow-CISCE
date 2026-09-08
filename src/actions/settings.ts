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
    show_public_draws?: boolean;
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

  if (typeof data.show_public_draws === "boolean") {
    updatePayload.show_public_draws = data.show_public_draws;
  }

  const { error } = await supabase
    .from("tournaments")
    .update(updatePayload)
    .eq("id", tournamentId);

  if (error) {
    if (error.message?.includes("show_public_draws")) {
      // Retry without show_public_draws in case migration5 hasn't been executed yet
      delete updatePayload.show_public_draws;
      await supabase.from("tournaments").update(updatePayload).eq("id", tournamentId);
      revalidatePath(`/admin/event/${tournamentId}/settings`);
      throw new Error(
        "Tournament details saved! To save the Public Draws toggle, please run migration5_public_draws_toggle.sql in Supabase SQL Editor."
      );
    }
    console.error("Failed to update tournament settings:", error);
    throw new Error("Failed to update tournament settings");
  }

  revalidatePath(`/admin/event/${tournamentId}/settings`);
  revalidatePath(`/admin/event/${tournamentId}/dashboard`);
  revalidatePath(`/admin`);
  revalidatePath(`/organiser`);
  revalidatePath(`/public/event/${tournamentId}`);
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
