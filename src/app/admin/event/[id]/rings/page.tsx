import React from "react";
import AdminHeader from "@/components/layout/AdminHeader";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { ensureAdminOwnsTournament } from "@/actions/admin";
import RingsClient from "@/components/admin/RingsClient";

export default async function AdminRings({ params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;
  try {
    await ensureAdminOwnsTournament(tournamentId);
  } catch {
    redirect("/admin");
  }

  const supabase = await createClient();

  const [
    { data: tournament },
    { data: rings }
  ] = await Promise.all([
    supabase.from("tournaments").select("name, stager_codes").eq("id", tournamentId).single(),
    supabase.from("rings").select("*").eq("tournament_id", tournamentId).order("ring_order", { ascending: true })
  ]);

  if (!tournament) redirect("/admin");

  const ringIds = rings?.map(r => r.id) || [];
  let modRequests: any[] = [];
  if (ringIds.length > 0) {
    const { data: reqs } = await supabase
      .from("moderator_requests")
      .select("*")
      .in("ring_id", ringIds)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false });
    if (reqs) modRequests = reqs;
  }

  // Fetch stager requests for this tournament
  const { data: stagerReqs } = await supabase
    .from("stager_requests")
    .select("*")
    .eq("tournament_id", tournamentId)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false });

  return (
    <>
      <AdminHeader title="Access" eventName={tournament.name} />
      <RingsClient
        tournamentId={tournamentId}
        initialRings={rings || []}
        initialModRequests={modRequests}
        initialStagerRequests={stagerReqs || []}
        initialStagerCodes={(tournament as any).stager_codes || []}
      />
    </>
  );
}
