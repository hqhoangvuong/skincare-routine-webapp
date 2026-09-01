import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { routine } from "./routine";
import {
  getCategoryData, resolveDayForState, stepId,
  addProduct, renameProduct, removeProduct,
  addStep, updateStepTuple, removeStep, setStepVariant, resetCategory,
} from "./content";
import type { AppState, CategoryOverride, ThresholdVariant } from "./types";

const base: AppState = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

function withFaceOverride(mut: (o: CategoryOverride) => void): AppState {
  // start from the real default face content, wrapped with derived ids
  const days = routine.face.days.map((day, di) => {
    if ("steps" in day) {
      return { short: day.short, full: day.full, type: day.type,
        steps: day.steps.map((step, i) => ({ id: stepId("face", di, "steps", i), step })) };
    }
    return { short: day.short, full: day.full, focus: day.focus,
      am: day.am.map((step, i) => ({ id: stepId("face", di, "am", i), step })),
      pm: day.pm.map((step, i) => ({ id: stepId("face", di, "pm", i), step })) };
  });
  const override: CategoryOverride = { products: [...routine.face.products], days };
  mut(override);
  return { ...base, overrides: { face: override } };
}

describe("stepId", () => {
  it("builds the positional id string", () => {
    expect(stepId("face", 2, "am", 0)).toBe("face.2.am.0");
    expect(stepId("hair", 0, "steps", 4)).toBe("hair.0.steps.4");
  });
});

describe("getCategoryData", () => {
  it("returns the default (by reference) when there is no override", () => {
    expect(getCategoryData(base, "face")).toBe(routine.face);
    expect(getCategoryData(base, "hair")).toBe(routine.hair);
  });
  it("returns the override content when one exists, other categories untouched", () => {
    const state = withFaceOverride((o) => { o.products[0] = "Renamed cleanser"; });
    expect(getCategoryData(state, "face").products[0]).toBe("Renamed cleanser");
    expect(getCategoryData(state, "face").days).toHaveLength(7);
    expect(getCategoryData(state, "hair")).toBe(routine.hair); // independent
  });
});

describe("resolveDayForState", () => {
  it("default face Wednesday: Vitamin C at week 1, Niacinamide at week 3, same id", () => {
    const w1 = resolveDayForState(base, "face", 2, 1);
    const w3 = resolveDayForState(base, "face", 2, 3);
    if (w1.kind !== "facebody" || w3.kind !== "facebody") throw new Error("expected facebody");
    expect(w1.am[2]).toEqual({ id: "face.2.am.2", product: "Serum Vitamin C — Cocoon Nghệ C22",
      note: "Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide" });
    expect(w3.am[2].id).toBe("face.2.am.2");
    expect(w3.am[2].product).toBe("Serum Niacinamide 15% — Cocoon");
  });

  it("hair day resolves to the flat steps list", () => {
    const d = resolveDayForState(base, "hair", 1, 1);
    if (d.kind !== "hair") throw new Error("expected hair");
    expect(d.steps).toHaveLength(2);
    expect(d.steps[0].id).toBe("hair.1.steps.0");
  });

  it("uses override content and its frozen ids", () => {
    const state = withFaceOverride((o) => {
      const mon = o.days[0];
      if ("steps" in mon) throw new Error("face day");
      mon.am[1] = { id: "face.0.am.new-0", step: ["Custom toner", "note"] };
    });
    const d = resolveDayForState(state, "face", 0, 1);
    if (d.kind !== "facebody") throw new Error("expected facebody");
    expect(d.am[1]).toEqual({ id: "face.0.am.new-0", product: "Custom toner", note: "note" });
  });
});

describe("mutation helpers", () => {
  it("renameProduct clones on first touch and leaves other categories default", () => {
    const s = renameProduct(base, "face", 0, "Renamed");
    expect(s.overrides?.face?.products[0]).toBe("Renamed");
    expect(s.overrides?.hair).toBeUndefined();
    expect(base.overrides).toBeUndefined(); // input not mutated
  });

  it("addProduct / removeProduct adjust the products array", () => {
    const added = addProduct(base, "face");
    const n = routine.face.products.length;
    expect(added.overrides?.face?.products).toHaveLength(n + 1);
    expect(added.overrides?.face?.products[n]).toBe("");
    const removed = removeProduct(added, "face", 0);
    expect(removed.overrides?.face?.products).toHaveLength(n);
  });

  it("addStep appends a blank step with a new-<n> id and bumps stepSeq", () => {
    const a = addStep(base, "face", 0, "pm");
    expect(a.stepSeq).toBe(1);
    const day = a.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("expected a face day");
    expect(day.pm[day.pm.length - 1]).toEqual({ id: "face.0.pm.new-0", step: ["", ""] });
    // untouched steps keep derived ids
    expect(day.pm[0].id).toBe("face.0.pm.0");
    const b = addStep(a, "face", 0, "pm");
    expect(b.stepSeq).toBe(2);
    const day2 = b.overrides?.face?.days[0];
    if (!day2 || "steps" in day2) throw new Error("face day");
    expect(day2.pm[day2.pm.length - 1].id).toBe("face.0.pm.new-1");
  });

  it("updateStepTuple changes product/note, keeps id", () => {
    const s = updateStepTuple(base, "face", 0, "am", "face.0.am.0", "New product", "New note");
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.am[0]).toEqual({ id: "face.0.am.0", step: ["New product", "New note"] });
  });

  it("removeStep drops the step, other ids unchanged, stepSeq untouched", () => {
    const s = removeStep(base, "hair", 0, "steps", "hair.0.steps.1");
    const day = s.overrides?.hair?.days[0];
    if (!day || !("steps" in day)) throw new Error("hair day");
    expect(day.steps.find((x) => x.id === "hair.0.steps.1")).toBeUndefined();
    expect(day.steps[0].id).toBe("hair.0.steps.0");
    expect(s.stepSeq).toBeUndefined();
  });

  it("setStepVariant swaps the step form, preserving id", () => {
    const variant: ThresholdVariant = {
      kind: "threshold", untilWeek: 2, before: ["X", ""], from: ["Y", ""],
    };
    const s = setStepVariant(base, "face", 0, "am", "face.0.am.0", variant);
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.am[0]).toEqual({ id: "face.0.am.0", step: variant });
  });

  it("resetCategory removes just that override", () => {
    const two = renameProduct(renameProduct(base, "face", 0, "F"), "hair", 0, "H");
    const s = resetCategory(two, "face");
    expect(s.overrides?.face).toBeUndefined();
    expect(s.overrides?.hair?.products[0]).toBe("H");
  });
});
