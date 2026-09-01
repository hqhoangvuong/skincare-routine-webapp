export const TZ = "Asia/Ho_Chi_Minh";

// en-CA formats as YYYY-MM-DD, which is what we want to store.
const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
});

const MONDAY_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calendar date in Asia/Ho_Chi_Minh, as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return isoFormatter.format(now);
}

/** Weekday in Asia/Ho_Chi_Minh, 0 = Monday .. 6 = Sunday (matches the T2..CN tab order). */
export function weekdayIndex(now: Date = new Date()): number {
  return MONDAY_FIRST.indexOf(weekdayFormatter.format(now));
}

/**
 * 0 = Mon .. 6 = Sun for a date-only ISO string. No timezone is involved: the
 * weekday of "2026-09-03" is the same everywhere, so this stays off the
 * Intl/TZ path the Date-taking helpers above use.
 */
export function weekdayIndexOfIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** `iso` shifted by `days` (may be negative), formatted "YYYY-MM-DD". */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** ISO date of the Monday of `iso`'s week. */
export function mondayIsoOf(iso: string): string {
  return addDaysIso(iso, -weekdayIndexOfIso(iso));
}

/**
 * 1-based program week: week 1 is the Mon-Sun week containing `startIso`, and
 * the number flips every Monday. Clamped to a minimum of 1, so a `nowIso`
 * before `startIso` still reads as week 1.
 */
export function programWeek(startIso: string, nowIso: string): number {
  const [sy, sm, sd] = mondayIsoOf(startIso).split("-").map(Number);
  const [ny, nm, nd] = mondayIsoOf(nowIso).split("-").map(Number);
  const diffDays = (Date.UTC(ny, nm - 1, nd) - Date.UTC(sy, sm - 1, sd)) / 86_400_000;
  // An empty or malformed startIso/nowIso (e.g. a cleared <input type="date">)
  // makes diffDays NaN; clamp to week 1 rather than render "Tuần NaN".
  if (!Number.isFinite(diffDays)) return 1;
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/**
 * Position in the repeating 4-week cycle: 1, 2, 3, 4, 1, 2, ...
 * No production caller yet — staged for a later sub-project (notifications).
 */
export function weekCyclePosition(startIso: string, nowIso: string): number {
  return ((programWeek(startIso, nowIso) - 1) % 4) + 1;
}

/** ISO date of weekday `dayIndex` (0 = Mon) within `nowIso`'s week. */
export function weekdayDateIso(dayIndex: number, nowIso: string): string {
  return addDaysIso(mondayIsoOf(nowIso), dayIndex);
}
