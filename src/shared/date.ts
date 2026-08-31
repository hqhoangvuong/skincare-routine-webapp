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
