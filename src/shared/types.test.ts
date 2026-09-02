import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import {
  isAppState, isCompletedStep, isCategoryOverride, migrate,
  isStepTuple, isThresholdVariant, isCycleVariant, isConditionalStep, isRoutineStep,
} from "./types";

const v3 = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

const goodOverride = {
  products: ["A", "B"],
  days: Array.from({ length: 7 }, (_, i) => ({
    short: "T2", full: "Thứ Hai", focus: "x",
    am: [{ id: `face.${i}.am.0`, step: ["P", ""] }],
    pm: [{ id: `face.${i}.pm.0`, step: ["Q", ""] }],
  })),
};

describe("isCompletedStep (v3)", () => {
  it("accepts a well-formed entry", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face", stepId: "face.2.am.0" })).toBe(true);
  });
  it("rejects a missing stepId, a bad category, a non-string date", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face" })).toBe(false);
    expect(isCompletedStep({ date: "2026-09-02", category: "nails", stepId: "x" })).toBe(false);
    expect(isCompletedStep({ date: 20260902, category: "face", stepId: "x" })).toBe(false);
    expect(isCompletedStep(null)).toBe(false);
  });
});

describe("isCategoryOverride", () => {
  it("accepts a well-formed override", () => {
    expect(isCategoryOverride(goodOverride)).toBe(true);
  });
  it("rejects wrong day count, a step missing id, a non-RoutineStep step", () => {
    expect(isCategoryOverride({ ...goodOverride, days: goodOverride.days.slice(0, 6) })).toBe(false);
    // A step object with no `id`. Built by rebuilding day 0's am list without an
    // `id` key rather than `delete`-ing one (strict mode forbids deleting a
    // required property); the intent — a step missing its id — is identical.
    const noId = {
      ...goodOverride,
      days: goodOverride.days.map((day, i) =>
        i === 0 ? { ...day, am: [{ step: ["P", ""] }] } : day,
      ),
    };
    expect(isCategoryOverride(noId)).toBe(false);
    const badStep = structuredClone(goodOverride);
    badStep.days[0].am[0].step = ["only-one"];
    expect(isCategoryOverride(badStep)).toBe(false);
  });

  describe("isCategoryOverride — focusPrefix", () => {
    it("accepts an override with a string focusPrefix and one with it absent", () => {
      expect(isCategoryOverride({ ...goodOverride, focusPrefix: "Tối nay: " })).toBe(true);
      expect(isCategoryOverride({ ...goodOverride })).toBe(true);
    });
    it("rejects a non-string focusPrefix", () => {
      expect(isCategoryOverride({ ...goodOverride, focusPrefix: 3 })).toBe(false);
    });
  });
});

describe("isAppState (v3)", () => {
  it("accepts a default state and one with a valid override", () => {
    expect(isAppState(v3)).toBe(true);
    expect(isAppState({ ...v3, overrides: { face: goodOverride }, stepSeq: 3 })).toBe(true);
  });
  it("rejects a v2-shaped blob", () => {
    const v2 = {
      version: 2, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate,
      completedSteps: [], ui: v3.ui,
    };
    expect(isAppState(v2)).toBe(false);
  });
  it("rejects a malformed overrides and a non-number stepSeq", () => {
    expect(isAppState({ ...v3, overrides: { face: { products: [] } } })).toBe(false);
    expect(isAppState({ ...v3, overrides: [] })).toBe(false);
    expect(isAppState({ ...v3, stepSeq: "3" })).toBe(false);
  });
  it("rejects a bad completedSteps element", () => {
    expect(isAppState({ ...v3, completedSteps: [{ date: "x", category: "face" }] })).toBe(false);
  });
});

describe("migrate to v3", () => {
  it("passes a valid v3 state through unchanged", () => {
    expect(migrate(v3)).toEqual(v3);
  });

  it("remaps a v2 completedSteps entry to a derived stepId by weekday", () => {
    const v2 = {
      version: 2, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate,
      completedSteps: [
        { date: "2026-08-24", category: "face", phase: "am", stepIndex: 2 }, // a Monday
        { date: "2026-08-30", category: "hair", phase: "steps", stepIndex: 0 }, // a Sunday
      ],
      ui: v3.ui,
    };
    const out = migrate(v2);
    expect(out?.version).toBe(3);
    expect(out?.completedSteps).toEqual([
      { date: "2026-08-24", category: "face", stepId: "face.0.am.2" },
      { date: "2026-08-30", category: "hair", stepId: "hair.6.steps.0" },
    ]);
    expect(out?.overrides).toBeUndefined();
    expect(out?.stepSeq).toBeUndefined();
  });

  it("chains a v1 blob to v3 with an empty completedSteps", () => {
    const v1 = { version: 1, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate, ui: v3.ui };
    expect(migrate(v1)).toEqual({
      version: 3, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate,
      completedSteps: [], ui: v3.ui,
    });
  });

  it("returns null for junk", () => {
    expect(migrate({ hello: "world" })).toBeNull();
    expect(migrate({ version: 2 })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});

describe("RoutineStep guards", () => {
  const tuple = ["Serum", "note"];
  const threshold = { kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""] };
  const cycle2 = { kind: "cycle", length: 2, weeks: [["A", ""], ["B", ""]] };
  const cycle4 = { kind: "cycle", length: 4, weeks: [["A", ""], ["B", ""], ["C", ""], ["D", ""]] };

  it("isStepTuple accepts a 2-string array, rejects everything else", () => {
    expect(isStepTuple(tuple)).toBe(true);
    expect(isStepTuple(["A"])).toBe(false);
    expect(isStepTuple(["A", 1])).toBe(false);
    expect(isStepTuple(["A", "", ""])).toBe(false);
    expect(isStepTuple({})).toBe(false);
    expect(isStepTuple(threshold)).toBe(false);
  });

  it("isThresholdVariant checks shape, not the untilWeek >= 1 rule (that is UI coercion)", () => {
    expect(isThresholdVariant(threshold)).toBe(true);
    expect(isThresholdVariant({ ...threshold, untilWeek: 0 })).toBe(true);
    expect(isThresholdVariant({ ...threshold, untilWeek: "2" })).toBe(false);
    expect(isThresholdVariant({ ...threshold, before: ["A"] })).toBe(false);
    expect(isThresholdVariant({ kind: "threshold" })).toBe(false);
  });

  it("isCycleVariant requires weeks.length === length and length in {2,4}", () => {
    expect(isCycleVariant(cycle2)).toBe(true);
    expect(isCycleVariant(cycle4)).toBe(true);
    expect(isCycleVariant({ ...cycle2, length: 3 })).toBe(false);
    expect(isCycleVariant({ ...cycle2, weeks: [["A", ""]] })).toBe(false); // length mismatch
    expect(isCycleVariant({ ...cycle2, weeks: [["A", ""], ["B", 1]] })).toBe(false);
  });

  it("isConditionalStep / isRoutineStep compose the above", () => {
    expect(isConditionalStep(threshold)).toBe(true);
    expect(isConditionalStep(cycle4)).toBe(true);
    expect(isConditionalStep(tuple)).toBe(false);
    expect(isRoutineStep(tuple)).toBe(true);
    expect(isRoutineStep(threshold)).toBe(true);
    expect(isRoutineStep({ kind: "weird" })).toBe(false);
    expect(isRoutineStep(null)).toBe(false);
  });
});
