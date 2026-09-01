import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { isAppState, isCompletedStep, migrate, isStepTuple, isThresholdVariant, isCycleVariant, isConditionalStep, isRoutineStep } from "./types";

const v2 = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

describe("isCompletedStep", () => {
  it("accepts a well-formed entry", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face", phase: "am", stepIndex: 2 })).toBe(true);
  });
  it("rejects a bad phase, a missing date, a non-number index, a bad category", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face", phase: "night", stepIndex: 0 })).toBe(false);
    expect(isCompletedStep({ category: "face", phase: "am", stepIndex: 0 })).toBe(false);
    expect(isCompletedStep({ date: "2026-09-02", category: "face", phase: "am", stepIndex: "0" })).toBe(false);
    expect(isCompletedStep({ date: "2026-09-02", category: "nails", phase: "am", stepIndex: 0 })).toBe(false);
    expect(isCompletedStep(null)).toBe(false);
  });
});

describe("isAppState (v2)", () => {
  it("accepts a default state", () => {
    expect(isAppState(v2)).toBe(true);
  });
  it("rejects a v1-shaped blob", () => {
    const v1 = { version: 1, updatedAt: v2.updatedAt, programStartDate: v2.programStartDate, ui: v2.ui };
    expect(isAppState(v1)).toBe(false);
  });
  it("rejects a non-array completedSteps and a bad element", () => {
    expect(isAppState({ ...v2, completedSteps: {} })).toBe(false);
    expect(isAppState({ ...v2, completedSteps: [{ date: "x", category: "face", phase: "am" }] })).toBe(false);
  });
});

describe("migrate", () => {
  it("passes a valid v2 state through unchanged", () => {
    expect(migrate(v2)).toEqual(v2);
  });
  it("upgrades a v1 blob by adding an empty completedSteps", () => {
    const v1 = { version: 1, updatedAt: v2.updatedAt, programStartDate: v2.programStartDate, ui: v2.ui };
    expect(migrate(v1)).toEqual({ ...v1, version: 2, completedSteps: [] });
  });
  it("returns null for something that is neither", () => {
    expect(migrate({ hello: "world" })).toBeNull();
    expect(migrate({ version: 1 })).toBeNull();
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
