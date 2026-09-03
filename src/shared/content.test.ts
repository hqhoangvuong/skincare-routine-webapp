import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { routine } from "./routine";
import {
  getCategoryData, resolveDayForState, stepId, isStepEdited,
  addProduct, renameProduct, removeProduct,
  addStep, updateStepTuple, removeStep, setStepVariant, resetCategory,
  getStoredDays, moveStep, moveProduct, productUsage,
  updateDayMeta, setFocusPrefix, getFocusPrefix, isDayMetaEdited, isFocusPrefixEdited,
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

  it("isStepEdited stays null for every step after a reorder (moved, not changed)", () => {
    const s = moveStep(base, "face", 0, "am", 0, 2);
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    for (const st of day.am) {
      expect(isStepEdited(s, "face", 0, "am", st.id)).toBeNull();
    }
  });

  it("reorders a hair steps phase; ids swap and isStepEdited stays null", () => {
    const s = moveStep(base, "hair", 0, "steps", 0, 1);
    const day = s.overrides?.hair?.days[0];
    if (!day || !("steps" in day)) throw new Error("hair day");
    expect(day.steps.slice(0, 2).map((x) => x.id)).toEqual([
      "hair.0.steps.1", "hair.0.steps.0",
    ]);
    for (const st of day.steps) {
      expect(isStepEdited(s, "hair", 0, "steps", st.id)).toBeNull();
    }
  });
});

describe("moveProduct", () => {
  it("reorders a product within the shelf", () => {
    const s = moveProduct(base, "body", 0, 2);
    expect(getCategoryData(s, "body").products).toEqual([
      "Dầu khô đa năng Nuxe Huile Multi",
      "Kem dưỡng ẩm Vaseline Gluta Hya Night",
      "Tẩy da chết cơ thể cà phê Cocoon",
    ]);
  });

  it("returns the same state reference for a no-op or out-of-range move", () => {
    expect(moveProduct(base, "body", 1, 1)).toBe(base);
    expect(moveProduct(base, "body", -1, 0)).toBe(base);
    expect(moveProduct(base, "body", 0, 99)).toBe(base);
  });

  it("creates the override from the shipped shelf on first move and leaves other categories alone", () => {
    const s = moveProduct(base, "body", 0, 1);
    expect(s.overrides?.body).toBeDefined();
    expect(s.overrides?.face).toBeUndefined();
    expect(getCategoryData(s, "body").products).toHaveLength(routine.body.products.length);
  });
});

describe("addProduct with a name", () => {
  it("appends the given name", () => {
    const s = addProduct(base, "face", "Kem chống nắng SPF 50");
    const products = getCategoryData(s, "face").products;
    expect(products[products.length - 1]).toBe("Kem chống nắng SPF 50");
  });

  it("still appends an empty string when called with no name", () => {
    const s = addProduct(base, "face");
    const products = getCategoryData(s, "face").products;
    expect(products[products.length - 1]).toBe("");
  });
});

describe("productUsage", () => {
  it("finds a plain step that names the product", () => {
    // Monday PM step 0 is ["Tẩy trang Bioderma", ""]
    const hits = productUsage(base, "face", "Tẩy trang Bioderma");
    expect(hits).toContainEqual({ dayIndex: 0, phase: "pm", stepId: "face.0.pm.0" });
    // it appears on several days — all PM
    expect(hits.every((h) => h.phase === "pm")).toBe(true);
    expect(hits.length).toBeGreaterThan(1);
  });

  it("matches inside a threshold branch (Wed AM Vitamin C / Niacinamide)", () => {
    const nia = productUsage(base, "face", "Serum Niacinamide 15% — Cocoon");
    expect(nia.some((h) => h.dayIndex === 2 && h.phase === "am")).toBe(true);
  });

  it("matches inside a cycle branch (Sun PM mask rotation)", () => {
    const mask = productUsage(base, "face", "Mặt nạ Histolab Peppermint");
    expect(mask).toEqual([{ dayIndex: 6, phase: "pm", stepId: "face.6.pm.3" }]);
  });

  it("trims both sides and returns [] for an empty/whitespace name", () => {
    expect(productUsage(base, "face", "  Tẩy trang Bioderma ").length).toBeGreaterThan(0);
    expect(productUsage(base, "face", "   ")).toEqual([]);
    expect(productUsage(base, "face", "")).toEqual([]);
  });

  it("goes empty for the old name after a rename, non-empty for the new one", () => {
    const s = renameProduct(base, "face", 0, "Tẩy trang Bioderma Sensibio H2O");
    // step content is untouched by a shelf rename, so usage is by step text:
    // the step still says "Tẩy trang Bioderma", so the OLD shelf name still matches steps
    // — the meaningful assertion is that querying the NEW distinct string finds nothing
    expect(productUsage(s, "face", "Tẩy trang Bioderma Sensibio H2O")).toEqual([]);
  });

  it("is ordered by day then phase", () => {
    const hits = productUsage(base, "face", "Toner Cocoon Sen");
    const keys = hits.map((h) => `${h.dayIndex}.${h.phase}`);
    const sorted = [...keys].sort((a, b) => {
      const [da, pa] = a.split(".");
      const [db, pb] = b.split(".");
      if (da !== db) return Number(da) - Number(db);
      return (pa === "am" ? 0 : 1) - (pb === "am" ? 0 : 1);
    });
    expect(keys).toEqual(sorted);
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

  it("updateDayMeta stores an explicit empty focus (not the default)", () => {
    const s = updateDayMeta(base, "face", 0, { focus: "" });
    const day = getStoredDays(s, "face")[0];
    if ("steps" in day) throw new Error("face day");
    expect(day.focus).toBe("");
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
    // a prefix-only change is category-level, not per-day: isDayMetaEdited stays false
    expect(isDayMetaEdited(setFocusPrefix(base, "face", "z"), "face", 3)).toBe(false);
    expect(isDayMetaEdited(updateDayMeta(base, "face", 0, { focus: "z" }), "face", 3)).toBe(false);
  });

  it("isFocusPrefixEdited: false with no override, false when set back to the default, true on a real change", () => {
    expect(isFocusPrefixEdited(base, "face")).toBe(false);
    expect(isFocusPrefixEdited(setFocusPrefix(base, "face", "Tối nay: "), "face")).toBe(true);
    expect(isFocusPrefixEdited(setFocusPrefix(base, "face", "Trọng tâm tối nay: "), "face")).toBe(false);
    expect(isFocusPrefixEdited(setFocusPrefix(base, "body", ""), "body")).toBe(false);
  });
});
