import { describe, expect, it } from "vitest";
import { routine } from "./routine";
import { isHairDay } from "./types";

describe("routine data", () => {
  it("has all three categories with 7 days each", () => {
    for (const category of ["face", "hair", "body"] as const) {
      expect(routine[category].days).toHaveLength(7);
      expect(routine[category].products.length).toBeGreaterThan(0);
    }
  });

  // Every category, not just face — this is the only assertion standing
  // between a reordered day and a silently wrong routine.
  it.each(["face", "hair", "body"] as const)(
    "orders %s days from Monday (T2) to Sunday (CN)",
    (category) => {
      const shorts = routine[category].days.map((d) => d.short);
      expect(shorts).toEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    },
  );

  it("gives face and body days am/pm lists, and hair days a flat steps list", () => {
    expect(isHairDay(routine.face.days[0])).toBe(false);
    expect(isHairDay(routine.body.days[0])).toBe(false);
    expect(isHairDay(routine.hair.days[0])).toBe(true);
  });

  it("keeps every step as a [product, note] pair", () => {
    for (const category of ["face", "hair", "body"] as const) {
      for (const day of routine[category].days) {
        const steps = isHairDay(day) ? day.steps : [...day.am, ...day.pm];
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(step).toHaveLength(2);
          expect(typeof step[0]).toBe("string");
          expect(typeof step[1]).toBe("string");
          expect(step[0].length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps Wednesday morning on the steady-state Niacinamide serum (the week rule now lives in schedule.ts)", () => {
    const wednesday = routine.face.days[2];
    if (isHairDay(wednesday)) throw new Error("expected a face day");
    expect(wednesday.am[2][0]).toBe("Serum Niacinamide 15% — Cocoon");
    expect(wednesday.am.map((s) => s[1]).join(" ")).not.toContain("Tuần");
  });

  it("keeps Sunday evening on the odd-week mask (the rotation now lives in schedule.ts)", () => {
    const sunday = routine.face.days[6];
    if (isHairDay(sunday)) throw new Error("expected a face day");
    expect(sunday.pm[3][0]).toBe("Mặt nạ Histolab Peppermint");
    expect(sunday.pm.map((s) => s[1]).join(" ")).not.toContain("Tuần 2&4");
  });
});
