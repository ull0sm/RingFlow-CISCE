#!/usr/bin/env node

/**
 * Bulk Category PDF Uploader for RingFlow
 *
 * Uploads athlete list PDFs directly to Supabase Storage and updates the database.
 * Completely bypasses Next.js / Vercel body size limits.
 *
 * Features:
 * - Exact & fuzzy name matching identical to the RingFlow web app
 * - Duplicate conflict detection (multiple files mapping to the same category)
 * - Overwrite detection (categories that already have a PDF attached)
 * - Interactive summary and confirmation before any upload
 * - Real-time progress and error handling
 *
 * Usage:
 *   node scripts/upload-category-pdfs.mjs <folder_path> [tournament_id]
 */

// Polyfill WebSocket for Node < 22 environments where Supabase Realtime checks for native WebSocket
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class DummyWebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

// ── 1. Load Environment Variables from .env.local / .env ──────────────────────
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  const env = {};

  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key] && !env[key]) {
          env[key] = val;
        }
      }
    }
  }

  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
  console.error("\n❌ Missing Supabase credentials in .env.local.");
  console.error("Please ensure NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY are set.\n");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

// ── 2. Intelligent Multi-Tier Fuzzy Matching Helpers ─────────────────────────

/**
 * Normalizes strings by stripping file extensions, typical bracket/draw suffixes,
 * underscores, hyphens, and uniform whitespace.
 */
function cleanString(str) {
  if (!str) return "";
  return str
    .replace(/\.pdf$/i, "")
    .replace(/[-_ ]*(draws?|brackets?|sheets?|lists?|matches?|charts?|reports?|round\s*\d+|court\s*\d+|tatami\s*\d+|ring\s*\d+|final|official)[-_ ]*$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s*[-–—]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Strips all non-alphanumeric characters for compact comparison.
 */
function toAlphanumeric(str) {
  return cleanString(str).replace(/[^a-z0-9]/g, "");
}

/**
 * Extracts structured semantic components (gender, age bracket, discipline, weight)
 * from either a filename or a category name / fields.
 */
function extractComponents(rawStr, categoryObj = null) {
  let combined = rawStr || "";
  if (categoryObj) {
    combined = `${categoryObj.name || ""} ${categoryObj.age_bracket || ""} ${categoryObj.sex || ""} ${categoryObj.weight_class || ""}`;
  }

  let s = (" " + combined.toLowerCase() + " ")
    .replace(/[_]/g, " ")
    .replace(/[()[\]{},;]/g, " ")
    .replace(/\s+/g, " ");

  // 1. Gender / Sex
  let gender = null;
  if (categoryObj?.sex) {
    const sUpper = String(categoryObj.sex).toUpperCase().trim();
    if (sUpper === "F" || sUpper.startsWith("FEM")) gender = "F";
    else if (sUpper === "M" || sUpper.startsWith("MAL")) gender = "M";
  }
  if (!gender) {
    if (/\b(female|girls?|women|woman)\b/.test(s)) {
      gender = "F";
    } else if (/\b(male|boys?|men|man)\b/.test(s)) {
      gender = "M";
    } else if (/\b(f)\b/.test(s)) {
      gender = "F";
    } else if (/\b(m)\b/.test(s)) {
      gender = "M";
    }
  }

  // 2. Age Division
  let age = null;
  if (categoryObj?.age_bracket) {
    const aMatch = String(categoryObj.age_bracket).toLowerCase().match(/\b(?:u\s*[-_]?\s*|under\s*[-_]?\s*)(\d{1,2})\b/);
    if (aMatch) age = `U${aMatch[1]}`;
  }
  if (!age) {
    const uMatch = s.match(/\b(?:u\s*[-_]?\s*|under\s*[-_]?\s*)(\d{1,2})\b/);
    if (uMatch) {
      age = `U${uMatch[1]}`;
    } else if (/\bsenior\b/.test(s)) {
      age = "Senior";
    } else if (/\bcadet\b/.test(s)) {
      age = "Cadet";
    } else if (/\bjunior\b/.test(s)) {
      age = "Junior";
    } else if (/\bsub\s*junior\b/.test(s)) {
      age = "Sub-Junior";
    }
  }

  // 3. Discipline (Kata vs Kumite)
  let discipline = null;
  if (/\bkata\b/.test(s)) {
    discipline = "Kata";
  } else if (/\bkumite\b/.test(s)) {
    discipline = "Kumite";
  }

  // 4. Weight Class
  let weight = null;
  const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?)(?:\s*(?:kgs?|kg|kilos?))?/);
  const overMatch = s.match(/(?:(?:more\s*than|above|over|greater\s*than|>|\+)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\+|plus))\s*(?:kgs?|kg|kilos?)?/);
  const underMatch = s.match(/(?:(?:less\s*than|under|below|<|-)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:-|minus))\s*(?:kgs?|kg|kilos?)?/);

  if (rangeMatch) {
    weight = {
      type: "range",
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
    };
  } else if (overMatch) {
    const num = overMatch[1] || overMatch[2];
    weight = {
      type: "over",
      min: parseFloat(num),
    };
  } else if (underMatch) {
    const num = underMatch[1] || underMatch[2];
    weight = {
      type: "under",
      max: parseFloat(num),
    };
  }

  // If no discipline explicitly mentioned, but weight is present, it's Kumite
  if (!discipline && weight) {
    discipline = "Kumite";
  }

  return { gender, age, discipline, weight };
}

/**
 * Standard Levenshtein distance for string edit difference.
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Normalized string similarity score between 0.0 and 1.0.
 */
function stringSimilarity(s1, s2) {
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return 1 - dist / maxLen;
}

/**
 * Finds the best category match for a given PDF filename using:
 *  1. Exact Clean Match (normalized spacing, underscores, noise stripped)
 *  2. Compact Alphanumeric Match (punctuation & spacing ignored)
 *  3. Structured Semantic Component Match (Age + Gender + Discipline + Weight)
 *  4. Fuzzy Similarity Match with Hard Safety Constraints (no gender/age/weight conflict)
 */
function findMatch(filename, categories) {
  const cleanCandidate = cleanString(filename);
  const alphaCandidate = toAlphanumeric(filename);
  const candidateComp = extractComponents(filename);

  // 1. Direct clean match
  for (const cat of categories) {
    const cleanCat = cleanString(cat.name || cat.category_name);
    if (cleanCandidate === cleanCat) {
      return { category: cat, matchType: "Exact Clean", confidence: 1.0 };
    }
  }

  // 2. Compact alphanumeric match
  for (const cat of categories) {
    const alphaCat = toAlphanumeric(cat.name || cat.category_name);
    if (alphaCandidate === alphaCat) {
      return { category: cat, matchType: "Alphanumeric", confidence: 0.99 };
    }
  }

  // 3. Structured Component Semantic Match
  const semanticMatches = [];
  for (const cat of categories) {
    const catComp = extractComponents(cat.name || cat.category_name, cat);

    // Hard safety guards:
    // Gender must match if both specify it
    if (candidateComp.gender && catComp.gender && candidateComp.gender !== catComp.gender) continue;
    // Age division must match if both specify it
    if (candidateComp.age && catComp.age && candidateComp.age !== catComp.age) continue;
    // Discipline must match if both specify it
    if (candidateComp.discipline && catComp.discipline && candidateComp.discipline !== catComp.discipline) continue;

    // Weight check
    if (candidateComp.weight && catComp.weight) {
      if (candidateComp.weight.type === catComp.weight.type) {
        if (
          candidateComp.weight.type === "range" &&
          candidateComp.weight.min === catComp.weight.min &&
          candidateComp.weight.max === catComp.weight.max
        ) {
          semanticMatches.push(cat);
        } else if (
          candidateComp.weight.type === "over" &&
          candidateComp.weight.min === catComp.weight.min
        ) {
          semanticMatches.push(cat);
        } else if (
          candidateComp.weight.type === "under" &&
          candidateComp.weight.max === catComp.weight.max
        ) {
          semanticMatches.push(cat);
        }
      }
    } else if (!candidateComp.weight && !catComp.weight) {
      // Both might be Kata or non-weight
      if (candidateComp.discipline === "Kata" && catComp.discipline === "Kata") {
        semanticMatches.push(cat);
      }
    }
  }

  if (semanticMatches.length === 1) {
    return { category: semanticMatches[0], matchType: "Semantic Component", confidence: 0.95 };
  }

  // 4. Fuzzy Similarity Match with Strict Safety Constraints
  let bestCat = null;
  let bestScore = 0;

  for (const cat of categories) {
    const catComp = extractComponents(cat.name || cat.category_name, cat);

    // Hard safety guards:
    // Never match opposite genders
    if (candidateComp.gender && catComp.gender && candidateComp.gender !== catComp.gender) continue;
    // Never match different age divisions
    if (candidateComp.age && catComp.age && candidateComp.age !== catComp.age) continue;
    // Never match Kata with Kumite
    if (candidateComp.discipline && catComp.discipline && candidateComp.discipline !== catComp.discipline) continue;
    // Never match conflicting weights
    if (candidateComp.weight && catComp.weight) {
      if (candidateComp.weight.type !== catComp.weight.type) continue;
      if (candidateComp.weight.min !== catComp.weight.min) continue;
      if (candidateComp.weight.max !== catComp.weight.max) continue;
    }

    const cleanCat = cleanString(cat.name || cat.category_name);
    const score = stringSimilarity(cleanCandidate, cleanCat);

    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  if (bestCat && bestScore >= 0.70) {
    return { category: bestCat, matchType: "Fuzzy Similarity", confidence: bestScore };
  }

  return null;
}

// ── 3. Main Script ─────────────────────────────────────────────────────────────
async function main() {
  console.log("==================================================");
  console.log("   RingFlow Bulk Category PDF Uploader");
  console.log("==================================================\n");

  let supabase;

  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: globalThis.WebSocket,
    },
  };

  if (serviceRoleKey) {
    // Service role key automatically bypasses all RLS policies
    supabase = createClient(supabaseUrl, serviceRoleKey, clientOptions);
    console.log("✔ Authenticated via SUPABASE_SERVICE_ROLE_KEY (RLS bypassed for all storage/tables).\n");
  } else {
    supabase = createClient(supabaseUrl, anonKey, clientOptions);
    console.log("ℹ️  SUPABASE_SERVICE_ROLE_KEY not found. Using Anon key.");
    console.log("   Signing in as Admin using email/password...\n");

    const email = await askQuestion("Admin Email: ");
    const password = await askQuestion("Admin Password: ");

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (authError || !authData.user) {
      console.error("\n❌ Authentication failed:", authError?.message || "Unknown error");
      rl.close();
      process.exit(1);
    }
    console.log(`\n✔ Logged in as ${authData.user.email}\n`);
  }

  // Parse Folder Path
  let folderPath = process.argv[2];
  if (!folderPath) {
    folderPath = await askQuestion("Enter the folder path containing PDFs: ");
  }
  folderPath = path.resolve(folderPath.trim().replace(/^['"]|['"]$/g, ""));

  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error(`\n❌ Folder not found: "${folderPath}"`);
    rl.close();
    process.exit(1);
  }

  // Parse or Select Tournament
  let tournamentId = process.argv[3];
  if (!tournamentId) {
    console.log("Fetching recent tournaments from database...");
    const { data: tournaments, error: tourError } = await supabase
      .from("tournaments")
      .select("id, name, event_date, status")
      .order("created_at", { ascending: false })
      .limit(10);

    if (tourError || !tournaments || tournaments.length === 0) {
      console.error("❌ Failed to fetch tournaments or no tournaments found:", tourError?.message);
      rl.close();
      process.exit(1);
    }

    console.log("\nSelect Tournament:");
    tournaments.forEach((t, index) => {
      console.log(`  [${index + 1}] ${t.name} (Status: ${t.status}, ID: ${t.id})`);
    });

    const selection = await askQuestion("\nEnter number (1-" + tournaments.length + ") or paste Tournament UUID: ");
    const selNum = parseInt(selection.trim(), 10);
    if (!isNaN(selNum) && selNum >= 1 && selNum <= tournaments.length) {
      tournamentId = tournaments[selNum - 1].id;
    } else {
      tournamentId = selection.trim();
    }
  }

  // Verify tournament
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .single();

  if (tErr || !tournament) {
    console.error(`\n❌ Tournament with ID "${tournamentId}" not found.`);
    rl.close();
    process.exit(1);
  }

  console.log(`\nSelected Tournament: "${tournament.name}" (${tournament.id})`);

  // Fetch Categories for Tournament
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, age_bracket, weight_class, sex, doc_url")
    .eq("tournament_id", tournamentId);

  if (catError || !categories || categories.length === 0) {
    console.error("\n❌ No categories found for this tournament. Please create categories first.");
    rl.close();
    process.exit(1);
  }

  console.log(`Found ${categories.length} categories in database.\n`);

  // Scan folder for PDFs
  const allFiles = fs.readdirSync(folderPath);
  const pdfFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) {
    console.log(`❌ No .pdf files found in "${folderPath}".`);
    rl.close();
    process.exit(1);
  }

  console.log(`Found ${pdfFiles.length} PDF file(s) in folder.`);

  // ── Match PDFs with Overwrite & Duplicate Conflict Handling ────────────────
  const newUploads = [];
  const overwrites = [];
  const unmatched = [];
  const categoryAssignedFiles = new Map(); // categoryId -> [filenames]

  for (const filename of pdfFiles) {
    const matchResult = findMatch(filename, categories);

    if (!matchResult) {
      unmatched.push(filename);
      continue;
    }

    const cat = matchResult.category;

    // Track duplicate assignments to the same category
    if (!categoryAssignedFiles.has(cat.id)) {
      categoryAssignedFiles.set(cat.id, []);
    }
    categoryAssignedFiles.get(cat.id).push(filename);

    const isOverwrite = Boolean(cat.doc_url);
    const item = {
      filename,
      category: cat,
      matchType: matchResult.matchType,
      confidence: matchResult.confidence,
    };

    if (isOverwrite) {
      overwrites.push(item);
    } else {
      newUploads.push(item);
    }
  }

  // Check for duplicate conflicts (multiple files in the folder matching same category)
  const conflicts = [];
  for (const [catId, files] of categoryAssignedFiles.entries()) {
    if (files.length > 1) {
      const cat = categories.find((c) => c.id === catId);
      conflicts.push({ category: cat, files });
    }
  }

  console.log("\n==================================================");
  console.log("                MATCH REPORT");
  console.log("==================================================");
  console.log(`  📄 Total PDF Files Scanned : ${pdfFiles.length}`);
  console.log(`  ✨ New Attachments          : ${newUploads.length}`);
  console.log(`  ⚠️  Overwrites (Already Attached): ${overwrites.length}`);
  console.log(`  ❓ Unmatched (No Category)  : ${unmatched.length}`);
  if (conflicts.length > 0) {
    console.log(`  🚨 Duplicate Conflicts     : ${conflicts.length}`);
  }
  console.log("==================================================\n");

  // Show Matched New Attachments
  if (newUploads.length > 0) {
    console.log(`✨ MATCHED NEW ATTACHMENTS (${newUploads.length} files ready):`);
    newUploads.forEach((item) => {
      const conf = item.confidence ? ` (${Math.round(item.confidence * 100)}%)` : "";
      console.log(`   - ${item.filename} -> "${item.category.name}" [${item.matchType}]${conf}`);
    });
    console.log();
  }

  // Show Duplicate Conflicts
  if (conflicts.length > 0) {
    console.log("🚨 DUPLICATE CONFLICT WARNING:");
    console.log("   Multiple files in your folder matched the SAME category:");
    conflicts.forEach((c) => {
      console.log(`   - Category "${c.category.name}":`);
      c.files.forEach((f) => console.log(`       -> ${f}`));
    });
    console.log("   (If you proceed, the last file in the list will overwrite the earlier ones)\n");
  }

  // Show Overwrites
  if (overwrites.length > 0) {
    console.log(`⚠️  OVERWRITE WARNING (${overwrites.length} categories already have a PDF attached):`);
    overwrites.forEach((item) => {
      const conf = item.confidence ? ` (${Math.round(item.confidence * 100)}%)` : "";
      console.log(`   - "${item.filename}" will REPLACE existing PDF for "${item.category.name}" [${item.matchType}]${conf}`);
    });
    console.log();
  }

  // Show Unmatched
  if (unmatched.length > 0) {
    console.log(`❓ UNMATCHED FILES (${unmatched.length} files will be skipped):`);
    unmatched.forEach((f) => console.log(`   - ${f}`));
    console.log();
  }

  const totalToUpload = newUploads.length + overwrites.length;
  if (totalToUpload === 0) {
    console.log("❌ No files matched any category names. Nothing to upload.");
    rl.close();
    process.exit(0);
  }

  // Confirmation prompt with overwrite distinction
  let confirmMessage = `Proceed to upload ${totalToUpload} PDF(s)`;
  if (overwrites.length > 0) {
    confirmMessage += ` (including ${overwrites.length} OVERWRITE${overwrites.length > 1 ? "S" : ""})`;
  }
  confirmMessage += "? (y/N): ";

  const proceed = await askQuestion(confirmMessage);
  if (proceed.trim().toLowerCase() !== "y") {
    console.log("\nAborted by user. No files were uploaded.");
    rl.close();
    process.exit(0);
  }

  console.log("\nUploading directly to Supabase Storage ('category-docs')...\n");

  const filesToUpload = [...newUploads, ...overwrites];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < filesToUpload.length; i++) {
    const { filename, category } = filesToUpload[i];
    const filePath = path.join(folderPath, filename);
    const storagePath = `${tournamentId}/${category.id}.pdf`;
    const progressPrefix = `[${i + 1}/${filesToUpload.length}]`;

    try {
      const fileBuffer = fs.readFileSync(filePath);

      // 1. Upload to Supabase Storage with cacheControl=0 to prevent CDN caching
      const { error: uploadError } = await supabase.storage
        .from("category-docs")
        .upload(storagePath, fileBuffer, {
          contentType: "application/pdf",
          upsert: true,
          cacheControl: "0",
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // 2. Get public URL with cache-busting timestamp
      const { data: urlData } = supabase.storage
        .from("category-docs")
        .getPublicUrl(storagePath);

      const docUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;

      // 3. Update category doc_url in DB
      const { error: updateError } = await supabase
        .from("categories")
        .update({ doc_url: docUrl })
        .eq("id", category.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const isOverwrite = Boolean(category.doc_url);
      const actionTag = isOverwrite ? "[REPLACED]" : "[ATTACHED]";
      console.log(`✔ ${progressPrefix} ${actionTag} ${filename} -> "${category.name}"`);
      successCount++;
    } catch (err) {
      console.error(`✖ ${progressPrefix} FAILED ${filename}: ${err.message}`);
      errorCount++;
    }
  }

  console.log("\n==================================================");
  console.log(`✔ Upload Complete: ${successCount} files saved.`);
  if (errorCount > 0) console.log(`✖ Errors:          ${errorCount} failed.`);
  if (unmatched.length > 0) console.log(`⚠️  Skipped:         ${unmatched.length} unmatched files.`);
  console.log("==================================================\n");

  rl.close();
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  rl.close();
  process.exit(1);
});
