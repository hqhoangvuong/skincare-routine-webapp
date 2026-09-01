import { routine } from "./routine";
import { resolveStep } from "./schedule";
import {
  isHairDay,
  type AppState, type Category, type CategoryData, type DayData,
  type StepPhase, type StoredDay, type StoredStep,
} from "./types";

export type ResolvedStep = { id: string; product: string; note: string };

export type ResolvedDay =
  | { kind: "facebody"; short: string; full: string; focus: string; am: ResolvedStep[]; pm: ResolvedStep[] }
  | { kind: "hair"; short: string; full: string; type: string; steps: ResolvedStep[] };

/** The positional id for a default (un-overridden) step. */
export function stepId(category: Category, dayIndex: number, phase: StepPhase, index: number): string {
  return `${category}.${dayIndex}.${phase}.${index}`;
}

/** Drop the ids from an override's days to get back a plain DayData[]. */
function overrideToCategoryData(days: StoredDay[], products: string[]): CategoryData {
  const plain: DayData[] = days.map((day) => {
    if ("steps" in day) {
      return { short: day.short, full: day.full, type: day.type, steps: day.steps.map((s) => s.step) };
    }
    return {
      short: day.short, full: day.full, focus: day.focus,
      am: day.am.map((s) => s.step), pm: day.pm.map((s) => s.step),
    };
  });
  return { products, days: plain };
}

export function getCategoryData(state: AppState, category: Category): CategoryData {
  const override = state.overrides?.[category];
  if (!override) return routine[category];
  return overrideToCategoryData(override.days, override.products);
}

/** Wrap a default DayData as a StoredDay with derived positional ids. */
function wrapDefaultDay(category: Category, dayIndex: number, day: DayData): StoredDay {
  if (isHairDay(day)) {
    return {
      short: day.short, full: day.full, type: day.type,
      steps: day.steps.map((step, i) => ({ id: stepId(category, dayIndex, "steps", i), step })),
    };
  }
  return {
    short: day.short, full: day.full, focus: day.focus,
    am: day.am.map((step, i) => ({ id: stepId(category, dayIndex, "am", i), step })),
    pm: day.pm.map((step, i) => ({ id: stepId(category, dayIndex, "pm", i), step })),
  };
}

/**
 * The category's days as StoredStep-carrying days: the override's frozen days if
 * one exists, otherwise the shipped defaults wrapped with derived ids.
 */
export function getStoredDays(state: AppState, category: Category): StoredDay[] {
  const override = state.overrides?.[category];
  if (override) return override.days;
  return routine[category].days.map((day, i) => wrapDefaultDay(category, i, day));
}

function resolve(stored: StoredStep, week: number): ResolvedStep {
  const [product, note] = resolveStep(stored.step, week);
  return { id: stored.id, product, note };
}

export function resolveDayForState(
  state: AppState, category: Category, dayIndex: number, week: number,
): ResolvedDay {
  const day = getStoredDays(state, category)[dayIndex];
  if ("steps" in day) {
    return {
      kind: "hair", short: day.short, full: day.full, type: day.type,
      steps: day.steps.map((s) => resolve(s, week)),
    };
  }
  return {
    kind: "facebody", short: day.short, full: day.full, focus: day.focus,
    am: day.am.map((s) => resolve(s, week)),
    pm: day.pm.map((s) => resolve(s, week)),
  };
}
