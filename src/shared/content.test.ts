import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { routine } from "./routine";
import { getCategoryData, resolveDayForState, stepId } from "./content";
import type { AppState, CategoryOverride } from "./types";

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
