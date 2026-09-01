import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { isAppState, isCompletedStep, migrate } from "./types";

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
