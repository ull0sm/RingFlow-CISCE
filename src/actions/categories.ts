"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { ensureAdminOwnsTournament } from "./admin";
import { CategoryInput } from "./tournament";

export async function addCategory(tournamentId: string, input: CategoryInput) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  // Verify tournament exists
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .single();

  if (!tournament) throw new Error("Unauthorized or tournament not found");

  const name = (input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("Category name is required");

  const athletesCount = Math.max(0, Math.min(10000, Math.floor(Number(input.athletes_count) || 0)));
  const expectedMatches = Math.max(0, athletesCount - 1);

  const { data, error } = await supabase
    .from("categories")
    .insert({
      tournament_id: tournamentId,
      name,
      age_bracket: (input.age_bracket || "").trim().slice(0, 100),
      weight_class: (input.weight_class || "").trim().slice(0, 100),
      athletes_count: athletesCount,
      expected_matches: expectedMatches,
      has_full_roster: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to add category:", error);
    throw new Error("Failed to add category");
  }

  revalidatePath(`/admin/event/${tournamentId}/categories`);
  return data;
}

export async function bulkAddCategories(tournamentId: string, categories: any[]) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  // Verify tournament exists
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .single();

  if (!tournament) throw new Error("Unauthorized or tournament not found");

  const toInsert = (Array.isArray(categories) ? categories : []).map(cat => {
    const athletesCount = Math.max(0, Math.min(10000, Math.floor(Number(cat.athletes_count) || 0)));
    return {
      tournament_id: tournamentId,
      name: (cat.name || "").trim().slice(0, 200),
      age_bracket: (cat.age_bracket || "").trim().slice(0, 100),
      weight_class: (cat.weight_class || "").trim().slice(0, 100),
      athletes_count: athletesCount,
      expected_matches: Math.max(0, athletesCount - 1),
      has_full_roster: false,
      belt: cat.belt ? String(cat.belt).trim().slice(0, 50) : null,
      age_min: typeof cat.age_min === "number" ? cat.age_min : null,
      age_max: typeof cat.age_max === "number" ? cat.age_max : null,
      sex: cat.sex ? String(cat.sex).trim().slice(0, 20) : null,
      day: cat.day ? String(cat.day).trim().slice(0, 50) : null,
    };
  });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("categories").insert(toInsert);
    if (error) {
      console.error("Failed to bulk add categories:", error);
      throw new Error("Failed to bulk add categories");
    }
  }

  revalidatePath(`/admin/event/${tournamentId}/categories`);
  return { success: true, count: toInsert.length };
}

export async function updateCategory(categoryId: string, tournamentId: string, updates: Partial<CategoryInput> & { expected_matches?: number }) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  // Verification
  const { data: cat } = await supabase
    .from("categories")
    .select("tournament_id")
    .eq("id", categoryId)
    .single();

  if (!cat || cat.tournament_id !== tournamentId) throw new Error("Category not found");

  const { error } = await supabase
    .from("categories")
    .update(updates)
    .eq("id", categoryId);

  if (error) {
    console.error("Failed to update category:", error);
    throw new Error("Failed to update category");
  }

  revalidatePath(`/admin/event/${tournamentId}/categories`);
}

export async function deleteCategory(categoryId: string, tournamentId: string) {
  await ensureAdminOwnsTournament(tournamentId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("tournament_id", tournamentId);

  if (error) {
    console.error("Failed to delete category:", error);
    throw new Error("Failed to delete category");
  }

  revalidatePath(`/admin/event/${tournamentId}/categories`);
}
