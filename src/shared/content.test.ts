import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { routine } from "./routine";
import {
  getCategoryData, resolveDayForState, stepId, isStepEdited,
  addProduct, renameProduct, removeProduct,
  addStep, updateStepTuple, removeStep, setStepVariant, resetCategory,
  getStoredDays, moveStep,
  updateDayMeta, setFocusPrefix, getFocusPrefix, isDayMetaEdited,
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

  it("new-step id equals `${category}.${dayIndex}.${phase}.new-${stepSeq ?? 0}`", () => {
    const b = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const seq = b.stepSeq ?? 0;
    const s = addStep(b, "face", 4, "pm");
    const day = s.overrides?.face?.days[4];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.pm[day.pm.length - 1].id).toBe(`face.4.pm.new-${seq}`);
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

  it("cloneOverride carries focusPrefix through a later CoW edit", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    // seed an override that already has a focusPrefix, then trigger another CoW edit
    const seeded = { ...base, overrides: { face: {
      products: [...routine.face.products],
      days: getStoredDays(base, "face"),
      focusPrefix: "Tối nay: ",
    } } };
    const after = renameProduct(seeded, "face", 0, "X");
    expect(after.overrides?.face?.focusPrefix).toBe("Tối nay: ");
  });
});

describe("isStepEdited", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

  it("returns null for a category with no override", () => {
    expect(isStepEdited(base, "face", 0, "am", stepId("face", 0, "am", 0))).toBeNull();
  });

  it("returns null for a step in a CoW-cloned category that was not itself changed", () => {
    // renameProduct clones the whole face category but touches no step
    const s = renameProduct(base, "face", 0, "Tên khác");
    expect(isStepEdited(s, "face", 0, "am", stepId("face", 0, "am", 0))).toBeNull();
  });

  it("returns 'modified' after updateStepTuple on a default step", () => {
    const id = stepId("face", 2, "am", 0);
    const s = updateStepTuple(base, "face", 2, "am", id, "Sản phẩm mới", "");
    expect(isStepEdited(s, "face", 2, "am", id)).toBe("modified");
    expect(isStepEdited(s, "face", 2, "am", stepId("face", 2, "am", 1))).toBeNull();
  });

  it("returns 'modified' after setStepVariant (plain -> threshold)", () => {
    const id = stepId("face", 3, "pm", 0);
    const s = setStepVariant(base, "face", 3, "pm", id, {
      kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""],
    });
    expect(isStepEdited(s, "face", 3, "pm", id)).toBe("modified");
  });

  it("returns 'added' for a new-* step", () => {
    const s = addStep(base, "hair", 1, "steps");
    const day = s.overrides?.hair?.days[1];
    if (!day || !("steps" in day)) throw new Error("hair day");
    const newId = day.steps[day.steps.length - 1].id;
    expect(newId).toBe("hair.1.steps.new-0");
    expect(isStepEdited(s, "hair", 1, "steps", newId)).toBe("added");
  });

  it("returns null when the id is not found in the phase", () => {
    const s = renameProduct(base, "face", 0, "x");
    expect(isStepEdited(s, "face", 0, "am", "face.0.am.does-not-exist")).toBeNull();
  });

  it("does not mark a step as modified after an earlier sibling is removed", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    // face day 0 (Monday) AM has 5 steps; remove index 0, survivors shift to 0..3
    const s = removeStep(base, "face", 0, "am", stepId("face", 0, "am", 0));
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("expected a face day");
    for (const st of day.am) {
      expect(isStepEdited(s, "face", 0, "am", st.id)).toBeNull();
    }
  });

  it("still marks a genuinely edited step even after its index shifts", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const editedId = stepId("face", 0, "am", 3);
    let s = updateStepTuple(base, "face", 0, "am", editedId, "Sản phẩm đổi", "");
    s = removeStep(s, "face", 0, "am", stepId("face", 0, "am", 0)); // now editedId sits at array index 2
    expect(isStepEdited(s, "face", 0, "am", editedId)).toBe("modified");
  });
});

describe("moveStep", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

  it("reorders a step within a phase, ids and contents riding along", () => {
    const s = moveStep(base, "face", 0, "am", 0, 2);
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    // original ids were face.0.am.0 .. face.0.am.4; after moving 0 -> 2:
    expect(day.am.map((x) => x.id)).toEqual([
      "face.0.am.1", "face.0.am.2", "face.0.am.0", "face.0.am.3", "face.0.am.4",
    ]);
  });

  it("leaves completedSteps byte-unchanged", () => {
    const withChecks = { ...base, completedSteps: [
      { date: "2026-08-24", category: "face" as const, stepId: "face.0.am.0" },
    ] };
    const s = moveStep(withChecks, "face", 0, "am", 0, 2);
    expect(s.completedSteps).toEqual(withChecks.completedSteps);
  });

  it("returns the same state reference for same-index or out-of-range", () => {
    expect(moveStep(base, "face", 0, "am", 1, 1)).toBe(base);
    expect(moveStep(base, "face", 0, "am", -1, 0)).toBe(base);
    expect(moveStep(base, "face", 0, "am", 0, 99)).toBe(base);
  });

  it("does not create an override for other categories", () => {
    const s = moveStep(base, "face", 0, "am", 0, 1);
    expect(s.overrides?.hair).toBeUndefined();
  });
});

describe("day metadata helpers", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

  it("updateDayMeta sets full on a face day and clones the category", () => {
    const s = updateDayMeta(base, "face", 0, { full: "Thứ Hai (BHA)" });
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.full).toBe("Thứ Hai (BHA)");
    expect(s.overrides?.hair).toBeUndefined();
  });

  it("updateDayMeta applies focus to a face day and ignores a type key", () => {
    const s = updateDayMeta(base, "face", 0, { focus: "BHA nhẹ", type: "ignored" });
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.focus).toBe("BHA nhẹ");
    expect("type" in day).toBe(false);
  });

  it("updateDayMeta applies type to a hair day and ignores a focus key", () => {
    const s = updateDayMeta(base, "hair", 0, { type: "Ngày gội mới", focus: "ignored" });
    const day = s.overrides?.hair?.days[0];
    if (!day || !("steps" in day)) throw new Error("hair day");
    expect(day.type).toBe("Ngày gội mới");
  });

  it("getFocusPrefix returns the shipped default, then the override value", () => {
    expect(getFocusPrefix(base, "face")).toBe("Trọng tâm tối nay: ");
    expect(getFocusPrefix(base, "body")).toBe("");
    expect(getFocusPrefix(base, "hair")).toBe("");
    const s = setFocusPrefix(base, "face", "Tối nay: ");
    expect(getFocusPrefix(s, "face")).toBe("Tối nay: ");
    const cleared = setFocusPrefix(base, "face", "");
    expect(getFocusPrefix(cleared, "face")).toBe(""); // explicit empty, not the default
  });

  it("isDayMetaEdited: false for no override / cloned-but-unedited, true after an edit", () => {
    expect(isDayMetaEdited(base, "face", 0)).toBe(false);
    const cloned = renameProduct(base, "face", 0, "X"); // CoW clone, day meta untouched
    expect(isDayMetaEdited(cloned, "face", 0)).toBe(false);
    expect(isDayMetaEdited(updateDayMeta(base, "face", 0, { focus: "z" }), "face", 0)).toBe(true);
    expect(isDayMetaEdited(setFocusPrefix(base, "face", "z"), "face", 3)).toBe(true); // any day of that category
  });
});
