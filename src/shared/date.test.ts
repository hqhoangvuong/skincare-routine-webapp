import { describe, expect, it } from "vitest";
import { todayIso, weekdayIndex } from "./date";

describe("todayIso", () => {
  it("returns the ICT date, not the UTC date, just after ICT midnight", () => {
    // 2026-08-30T17:30Z is 2026-08-31T00:30 in ICT (UTC+7)
    expect(todayIso(new Date("2026-08-30T17:30:00Z"))).toBe("2026-08-31");
  });

  it("still returns the earlier date just before ICT midnight", () => {
    // 2026-08-30T16:59Z is 2026-08-30T23:59 in ICT
    expect(todayIso(new Date("2026-08-30T16:59:00Z"))).toBe("2026-08-30");
  });
});

describe("weekdayIndex", () => {
  it("returns 0 for Monday", () => {
    // 2026-08-31 is a Monday
    expect(weekdayIndex(new Date("2026-08-31T03:00:00Z"))).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 2026-08-30 is a Sunday
    expect(weekdayIndex(new Date("2026-08-30T03:00:00Z"))).toBe(6);
  });

  it("uses the ICT day, so late-UTC Sunday is already Monday", () => {
    expect(weekdayIndex(new Date("2026-08-30T17:30:00Z"))).toBe(0);
  });
});
