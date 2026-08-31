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

  it("orders days from Monday (T2) to Sunday (CN)", () => {
    const shorts = routine.face.days.map((d) => d.short);
    expect(shorts).toEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
  });

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

  it("preserves the week-1-2 Niacinamide note on Wednesday morning", () => {
    const wednesday = routine.face.days[2];
    expect(isHairDay(wednesday)).toBe(false);
    if (isHairDay(wednesday)) return;
    const notes = wednesday.am.map((s) => s[1]).join(" ");
    expect(notes).toContain("Tuần 3");
  });
});
