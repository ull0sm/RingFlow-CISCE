"use server";

import { createClient } from "@/utils/supabase/server";
import { ensureAdmin } from "./admin";
import { generateAccessCode } from "@/lib/utils";

export type CategoryInput = {
  name: string;
  age_bracket: string;
  weight_class: string;
  athletes_count: number;
};

export type TournamentInput = {
  name: string;
  event_date: string;
  venue: string;
  city: string;
  categories: CategoryInput[];
  ringCount: number;
};

export async function createTournament(input: TournamentInput) {
  const adminId = await ensureAdmin();
  const supabase = await createClient();

  // Validate inputs
  const name = (input.name || "").trim();
  if (!name || name.length > 200) {
    throw new Error("Tournament name is required and must be under 200 characters.");
  }

  const venue = (input.venue || "").trim().slice(0, 200) || null;
  const city = (input.city || "").trim().slice(0, 200) || null;
  const event_date = input.event_date ? new Date(input.event_date).toISOString() : null;

  const ringCount = Math.floor(Number(input.ringCount));
  if (isNaN(ringCount) || ringCount < 1 || ringCount > 50) {
    throw new Error("Ring count must be an integer between 1 and 50.");
  }

  // 1. Create Tournament
  const organiserCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .insert({
      admin_id: adminId,
      name,
      event_date,
      venue,
      city,
      status: "draft",
      organiser_code: organiserCode,
    })
    .select("id")
    .single();

  if (tournamentError) {
    console.error("Failed to create tournament:", tournamentError);
    throw new Error("Failed to create tournament");
  }

  const tournamentId = tournament.id;

  // 2. Create Categories
  if (Array.isArray(input.categories) && input.categories.length > 0) {
    const categoriesToInsert = input.categories.map((c) => {
      const catName = (c.name || "").trim().slice(0, 200);
      const athletesCount = Math.max(0, Math.min(10000, Math.floor(Number(c.athletes_count) || 0)));
      // expected_matches = n - 1
      const expectedMatches = Math.max(0, athletesCount - 1);

      return {
        tournament_id: tournamentId,
        name: catName,
        age_bracket: (c.age_bracket || "").trim().slice(0, 100),
        weight_class: (c.weight_class || "").trim().slice(0, 100),
        athletes_count: athletesCount,
        expected_matches: expectedMatches,
        has_full_roster: false,
      };
    });

    const { error: categoriesError } = await supabase
      .from("categories")
      .insert(categoriesToInsert);

    if (categoriesError) {
      console.error("Failed to create categories:", categoriesError);
      throw new Error("Failed to create categories");
    }
  }

  // 3. Create Rings
  const ringsToInsert = Array.from({ length: ringCount }).map((_, i) => {
    return {
      tournament_id: tournamentId,
      name: `Tatami ${String(i + 1).padStart(2, "0")}`,
      ring_order: i + 1,
      access_code: generateAccessCode(),
    };
  });

  const { error: ringsError } = await supabase
    .from("rings")
    .insert(ringsToInsert);

  if (ringsError) {
    console.error("Failed to create rings:", ringsError);
    throw new Error("Failed to create rings");
  }

  return tournamentId;
}
