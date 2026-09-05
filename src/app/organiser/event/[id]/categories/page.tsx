import React from "react";
import OrganiserHeader from "@/components/layout/OrganiserHeader";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CategoriesClient from "@/components/admin/CategoriesClient";
import { ensureOrganiserHasAccessToTournament } from "@/actions/organiser";

export default async function OrganiserCategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  try {
    await ensureOrganiserHasAccessToTournament(tournamentId);
  } catch (err: any) {
    if (err.message?.includes("Not authenticated")) {
      redirect("/login/organiser");
    }
    redirect("/organiser");
  }

  const supabase = await createClient();

  const [
    { data: tournament },
    { data: categories }
  ] = await Promise.all([
    supabase.from("tournaments").select("name").eq("id", tournamentId).single(),
    supabase.from("categories").select("*").eq("tournament_id", tournamentId).order("created_at", { ascending: false })
  ]);

  if (!tournament) redirect("/organiser");

  return (
    <>
      <OrganiserHeader title="Categories" eventName={tournament.name} />
      <CategoriesClient 
        tournamentId={tournamentId} 
        initialCategories={categories || []} 
        readOnly={true} 
      />
    </>
  );
}
