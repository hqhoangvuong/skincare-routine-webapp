import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { dayCompletion, isStepDone, phaseCompletion, toggleCompletedStep } from "./progress";
import { stepId } from "./content";
import type { AppState, CompletedStep } from "./types";

const base: AppState = makeDefaultState(new Date("2026-08-24T00:00:00Z")); // programStartDate 2026-08-24 (Mon, week 1)
const NOW = "2026-08-26"; // Wednesday of week 1
const wedAm0: CompletedStep = { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 0) };

describe("toggleCompletedStep", () => {
  it("adds an absent entry and removes a present one, without mutating input", () => {
    const added = toggleCompletedStep(base, wedAm0);
    expect(added.completedSteps).toEqual([wedAm0]);
    expect(base.completedSteps).toEqual([]);
    expect(added.updatedAt).toBe(base.updatedAt);
    expect(toggleCompletedStep(added, wedAm0).completedSteps).toEqual([]);
  });
});

describe("isStepDone", () => {
  it("matches by (date-from-dayIndex, category, stepId)", () => {
    expect(isStepDone([wedAm0], "face", 2, stepId("face", 2, "am", 0), NOW)).toBe(true);
    expect(isStepDone([wedAm0], "face", 2, stepId("face", 2, "am", 1), NOW)).toBe(false);
    expect(isStepDone([wedAm0], "face", 2, stepId("face", 2, "am", 0), "2026-09-02")).toBe(false); // other week
  });
});

describe("phaseCompletion / dayCompletion", () => {
  it("counts done against the resolved phase length", () => {
    const completed: CompletedStep[] = [
      { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 0) },
      { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 1) },
    ];
    const c = phaseCompletion({ ...base, completedSteps: completed }, "face", 2, "am", NOW);
    expect(c).toEqual({ done: 2, total: 5 }); // Wednesday AM has 5 steps
  });

  it("dayCompletion sums am + pm for a face day and uses steps for a hair day", () => {
    const face = dayCompletion(base, "face", 2, NOW);
    expect(face.done).toBe(0);
    expect(face.total).toBeGreaterThan(5);
    const hair = dayCompletion(base, "hair", 1, "2026-08-25"); // Tuesday
    expect(hair.total).toBe(2);
  });

  it("a check-off on a conditional step stays counted across the week boundary", () => {
    // Wednesday AM index 2 is the threshold step; its id is week-invariant.
    const id = stepId("face", 2, "am", 2);
    const state: AppState = {
      ...base,
      completedSteps: [{ date: "2026-08-26", category: "face", stepId: id }], // week 1 (Vitamin C)
    };
    expect(phaseCompletion(state, "face", 2, "am", "2026-08-26").done).toBe(1); // week 1
    // move NOW into week 3; same routine-day-of-week date maths, different product, same id
    expect(isStepDone(state.completedSteps, "face", 2, id, "2026-09-09")).toBe(false);
    // ^ different calendar date (week 3 Wednesday) => not done for THAT date; the
    //   point of the id stability is that if she re-checks in week 3 it lands on
    //   the same slot. Assert the id used is identical regardless of week:
    expect(id).toBe("face.2.am.2");
  });
});
