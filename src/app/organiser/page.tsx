import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import OrganiserHeader from "@/components/layout/OrganiserHeader";
import { createClient } from "@/utils/supabase/server";
import { ensureOrganiser } from "@/actions/organiser";
import { formatDisplayDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrganiserTournamentSelectionPage() {
  let organiser;
  let organiserErrorStr = "";
  let tournaments: any[] = [];

  try {
    organiser = await ensureOrganiser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false });
      
    if (error) {
      console.error("Error fetching tournaments for organiser:", error);
    } else if (data) {
      tournaments = data;
    }
  } catch (err: any) {
    console.error("Organiser auth verification error:", err.message);
    organiserErrorStr = err.message;
    // If not authenticated at all, redirect to organiser login
    if (err.message.includes("Not authenticated")) {
      redirect("/login/organiser");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      <OrganiserHeader title="Select Tournament" />
      <div className="p-margin-desktop bg-surface pb-24 w-full flex-1">
        <div className="max-w-7xl mx-auto w-full">
          {/* Welcome Section */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-label-caps font-bold tracking-wider uppercase bg-primary text-on-primary">
                Organiser Terminal
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">
              Welcome{organiser?.name ? `, ${organiser.name}` : ""}
            </h1>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Select an ongoing tournament to monitor live tatamis, category assignments, and student rosters.
            </p>
          </div>
          
          {organiserErrorStr && (
            <div className="mb-8 p-4 bg-error/10 border border-error/20 rounded-lg text-error">
              <p className="font-bold">Access Denied:</p>
              <p>{organiserErrorStr}</p>
              <div className="mt-4">
                <Link 
                  href="/login/organiser" 
                  className="px-4 py-2 bg-error text-white rounded text-xs font-bold inline-block hover:opacity-90"
                >
                  Return to Organiser Login
                </Link>
              </div>
            </div>
          )}

          {/* Tournament Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary">sports_martial_arts</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Available Tournaments</h3>
            </div>
          </div>

          {/* Tournament Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {tournaments.length === 0 && !organiserErrorStr && (
              <div className="col-span-full text-center p-12 border border-dashed border-outline-variant rounded-xl text-on-surface-variant bg-surface-container-lowest">
                <span className="material-symbols-outlined text-4xl text-outline mb-2">event_busy</span>
                <p className="font-medium">No tournaments currently available to monitor.</p>
                <p className="text-xs text-on-surface-variant/70 mt-1">Please check back once tournament administrators initiate an event.</p>
              </div>
            )}
            
            {tournaments.map((tournament) => (
              <Link 
                key={tournament.id} 
                href={`/organiser/event/${tournament.id}/dashboard`} 
                className="group bg-surface-container-lowest border border-outline-variant hover:border-secondary transition-all cursor-pointer rounded-xl overflow-hidden flex flex-col shadow-xs hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="p-card-padding flex-grow">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2.5 py-0.5 font-label-caps text-[11px] font-bold rounded-full flex items-center gap-1.5 ${
                      tournament.status === 'active' ? 'bg-error-container text-on-error-container' : 
                      tournament.status === 'draft' ? 'bg-surface-container-highest text-on-surface-variant' : 
                      'bg-tertiary-fixed text-on-tertiary-fixed'
                    }`}>
                      {tournament.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />}
                      {tournament.status.toUpperCase()}
                    </span>
                    <span className="font-data-mono text-xs text-on-surface-variant opacity-70">
                      ID: {tournament.id.split('-')[0]}
                    </span>
                  </div>
                  <h4 className="font-headline-sm text-headline-sm text-primary mb-2 group-hover:text-secondary transition-colors font-bold">
                    {tournament.name}
                  </h4>
                  <div className="space-y-1 text-xs text-on-surface-variant">
                    <p className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-outline">calendar_today</span>
                      <span>{formatDisplayDate(tournament.event_date)}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-outline">location_on</span>
                      <span className="truncate">{tournament.venue || 'Venue TBA'}</span>
                    </p>
                  </div>
                </div>
                <div className="px-card-padding py-3.5 bg-surface-container-low border-t border-outline-variant flex justify-between items-center group-hover:bg-surface-container transition-colors">
                  <span className="font-label-caps text-xs font-semibold text-primary">Enter Dashboard</span>
                  <span className="material-symbols-outlined text-secondary text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
