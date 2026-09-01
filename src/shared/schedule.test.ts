import { describe, expect, it } from "vitest";
import { routine } from "./routine";
import { resolveDay } from "./schedule";
import { isHairDay } from "./types";

function faceDay(dayIndex: number, week: number) {
  const day = resolveDay("face", dayIndex, week);
  if (isHairDay(day)) throw new Error("expected a face day");
  return day;
}

describe("resolveDay — Wednesday AM serum", () => {
  it("is Vitamin C in weeks 1 and 2", () => {
    for (const week of [1, 2]) {
      expect(faceDay(2, week).am[2][0]).toBe("Serum Vitamin C — Cocoon Nghệ C22");
      expect(faceDay(2, week).am[2][1]).toContain("Tuần 1–2");
    }
  });
  it("is Niacinamide from week 3 on", () => {
    for (const week of [3, 4, 7]) {
      expect(faceDay(2, week).am[2][0]).toBe("Serum Niacinamide 15% — Cocoon");
    }
  });
});

describe("resolveDay — Sunday PM mask", () => {
  it("is Peppermint on odd cycle weeks (1, 3, 5, 7)", () => {
    for (const week of [1, 3, 5, 7]) {
      expect(faceDay(6, week).pm[3][0]).toBe("Mặt nạ Histolab Peppermint");
    }
  });
  it("is Natural White on even cycle weeks (2, 4, 6, 8)", () => {
    for (const week of [2, 4, 6, 8]) {
      expect(faceDay(6, week).pm[3][0]).toBe("Mặt nạ Histolab Natural White");
    }
  });
});

describe("resolveDay — everything else is untouched", () => {
  it("returns the exact routine object for a non-conditional face day", () => {
    expect(resolveDay("face", 0, 1)).toBe(routine.face.days[0]);
    expect(resolveDay("face", 2, 5)).toBe(routine.face.days[2]); // week 3+ Wednesday = steady state
  });
  it("never rewrites hair or body days", () => {
    expect(resolveDay("hair", 2, 1)).toBe(routine.hair.days[2]);
    expect(resolveDay("body", 6, 2)).toBe(routine.body.days[6]);
  });
});
