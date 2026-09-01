import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { dayCompletion, isStepDone, phaseCompletion, toggleCompletedStep } from "./progress";
import type { CompletedStep } from "./types";

const START = "2026-08-24"; // Monday, program week 1
const NOW = "2026-08-26"; // Wednesday of week 1

const wednesdayAm0: CompletedStep = { date: "2026-08-26", category: "face", phase: "am", stepIndex: 0 };

describe("toggleCompletedStep", () => {
  it("adds an absent entry and removes a present one", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const added = toggleCompletedStep(base, wednesdayAm0);
    expect(added.completedSteps).toEqual([wednesdayAm0]);
    const removed = toggleCompletedStep(added, wednesdayAm0);
    expect(removed.completedSteps).toEqual([]);
  });
  it("does not mutate the input or its updatedAt", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const out = toggleCompletedStep(base, wednesdayAm0);
    expect(base.completedSteps).toEqual([]);
    expect(out.updatedAt).toBe(base.updatedAt);
  });
});

describe("isStepDone", () => {
  it("matches by date derived from dayIndex + nowIso", () => {
    expect(isStepDone([wednesdayAm0], "face", 2, "am", 0, NOW)).toBe(true);
    expect(isStepDone([wednesdayAm0], "face", 2, "am", 1, NOW)).toBe(false);
    // same slot, a different week -> different date -> not done
    expect(isStepDone([wednesdayAm0], "face", 2, "am", 0, "2026-09-02")).toBe(false);
  });
});

describe("phaseCompletion / dayCompletion", () => {
  it("counts done vs the resolved phase length", () => {
    const completed: CompletedStep[] = [
      { date: "2026-08-26", category: "face", phase: "am", stepIndex: 0 },
      { date: "2026-08-26", category: "face", phase: "am", stepIndex: 1 },
    ];
    const c = phaseCompletion(completed, START, "face", 2, "am", NOW);
    expect(c.done).toBe(2);
    expect(c.total).toBe(5); // Wednesday AM has 5 steps
  });
  it("dayCompletion sums am + pm for a face day", () => {
    const c = dayCompletion([], START, "face", 2, NOW);
    expect(c.done).toBe(0);
    expect(c.total).toBeGreaterThan(5); // 5 AM + the PM steps
  });
  it("dayCompletion uses the flat steps list for a hair day", () => {
    const hairNow = "2026-08-25"; // Tuesday of week 1
    const c = dayCompletion([], START, "hair", 1, hairNow);
    expect(c.total).toBe(2); // hair Tuesday has 2 steps
  });
});
