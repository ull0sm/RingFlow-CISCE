import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Returns YYYY-MM-DD string in a timezone-safe manner (IST Asia/Kolkata aware)
 */
export function getEventDateKey(dateVal: any): string {
  if (!dateVal) return "";
  const clean = String(dateVal).trim();
  // If already plain YYYY-MM-DD with no time
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      } catch {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dt = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dt}`;
      }
    }
  } catch {}

  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return clean.split("T")[0];
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata (IST),
 * falling back to local system date if unavailable.
 */
export function getTodayDateKey(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

/**
 * Checks whether an event date corresponds to today (IST or local system date).
 */
export function isEventToday(dateVal: any, referenceToday?: string): boolean {
  if (!dateVal) return false;
  const eventKey = getEventDateKey(dateVal);
  const rawKey = String(dateVal).split("T")[0];

  const todayIST = getTodayDateKey();
  if (eventKey === todayIST || rawKey === todayIST) return true;

  if (referenceToday && (eventKey === referenceToday || rawKey === referenceToday)) {
    return true;
  }

  try {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (eventKey === localToday || rawKey === localToday) return true;
  } catch {}

  return false;
}

/**
 * Computes whether a tournament is live, upcoming, or past based on its status and date.
 */
export function computeTournamentStatus(
  t: { status?: string; event_date?: string },
  referenceToday?: string
): "live" | "upcoming" | "past" {
  if (t.status === "completed" || t.status === "archived") return "past";
  if (t.status === "live") return "live";
  if (!t.event_date) return "upcoming";

  const eventKey = getEventDateKey(t.event_date);
  const todayKey = referenceToday || getTodayDateKey();

  if (isEventToday(t.event_date, todayKey)) {
    return "live";
  }

  if (eventKey > todayKey) {
    return "upcoming";
  }

  return "past";
}

/**
 * Formats date consistently across SSR and client (e.g. "Aug 27, 2026")
 * Avoiding locale differences between server (Node) and browser.
 */
export function formatDisplayDate(dateVal?: string | null): string {
  if (!dateVal) return "DATE TBD";
  try {
    const clean = String(dateVal).trim();
    const match = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = match[1];
      const monthIdx = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${MONTH_NAMES[monthIdx]} ${day}, ${year}`;
      }
    }
    const d = new Date(clean);
    if (isNaN(d.getTime())) return clean;
    return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  } catch {
    return String(dateVal);
  }
}

/**
 * Formats date with weekday consistently across SSR and client (e.g. "Thu, Aug 27, 2026")
 */
export function formatDisplayDateWithWeekday(dateVal?: string | null): string {
  if (!dateVal) return "";
  try {
    const clean = String(dateVal).trim();
    const match = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const monthIdx = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      if (monthIdx >= 0 && monthIdx < 12) {
        const utcDate = new Date(Date.UTC(year, monthIdx, day));
        const weekday = WEEKDAY_NAMES[utcDate.getUTCDay()];
        return `${weekday}, ${MONTH_NAMES[monthIdx]} ${day}, ${year}`;
      }
    }
    const d = new Date(clean);
    if (isNaN(d.getTime())) return clean;
    return `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  } catch {
    return String(dateVal);
  }
}

/**
 * Generates a cryptographically secure 6-digit numeric access code for Tatami moderators (e.g. "627472")
 */
export function generateAccessCode(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomInt === "function") {
    return (crypto as any).randomInt(100000, 1000000).toString();
  }
  const array = new Uint32Array(1);
  globalThis.crypto.getRandomValues(array);
  return (100000 + (array[0] % 900000)).toString();
}

/**
 * Normalizes user-entered access codes to eliminate visual ambiguities:
 * - Upper cases and trims whitespace/dashes
 * - Maps letter 'O' to digit '0'
 * - Maps letters 'I' and 'L' to digit '1'
 */
export function normalizeAccessCode(code?: string | null): string {
  if (!code) return "";
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/**
 * Generates an unambiguous 6-character alphanumeric code avoiding visually confusing characters (0, O, 1, I, L)
 */
export function generateUnambiguousCode(length = 6): string {
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
