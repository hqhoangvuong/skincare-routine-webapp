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

import {
  addDaysIso,
  mondayIsoOf,
  programWeek,
  weekCyclePosition,
  weekdayDateIso,
  weekdayIndexOfIso,
} from "./date";

describe("weekdayIndexOfIso", () => {
  it("returns 0 for a Monday and 6 for a Sunday", () => {
    expect(weekdayIndexOfIso("2026-08-31")).toBe(0); // Monday
    expect(weekdayIndexOfIso("2026-09-06")).toBe(6); // Sunday
  });
});

describe("addDaysIso", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("mondayIsoOf", () => {
  it("snaps any weekday back to its Monday", () => {
    expect(mondayIsoOf("2026-09-02")).toBe("2026-08-31"); // Wed -> Mon
    expect(mondayIsoOf("2026-08-31")).toBe("2026-08-31"); // Mon -> itself
    expect(mondayIsoOf("2026-09-06")).toBe("2026-08-31"); // Sun -> Mon
  });
});

describe("programWeek", () => {
  it("is week 1 for any day in the start date's Mon-Sun week", () => {
    // 2026-08-26 is a Wednesday; its week is 2026-08-24..30
    expect(programWeek("2026-08-26", "2026-08-24")).toBe(1);
    expect(programWeek("2026-08-26", "2026-08-30")).toBe(1);
  });
  it("flips on Mondays", () => {
    expect(programWeek("2026-08-26", "2026-08-31")).toBe(2);
    expect(programWeek("2026-08-26", "2026-09-14")).toBe(4);
  });
  it("clamps a now before the start date to 1", () => {
    expect(programWeek("2026-08-26", "2026-08-01")).toBe(1);
  });
});

describe("weekCyclePosition", () => {
  it("cycles 1,2,3,4,1,2,... by program week", () => {
    const start = "2026-08-24"; // a Monday
    expect(weekCyclePosition(start, "2026-08-24")).toBe(1);
    expect(weekCyclePosition(start, "2026-08-31")).toBe(2);
    expect(weekCyclePosition(start, "2026-09-14")).toBe(4);
    expect(weekCyclePosition(start, "2026-09-21")).toBe(1);
  });
});

describe("weekdayDateIso", () => {
  it("returns the date of the given weekday within now's week", () => {
    expect(weekdayDateIso(0, "2026-09-02")).toBe("2026-08-31"); // Monday of that week
    expect(weekdayDateIso(2, "2026-09-02")).toBe("2026-09-02"); // Wednesday
    expect(weekdayDateIso(6, "2026-09-02")).toBe("2026-09-06"); // Sunday
  });
});
