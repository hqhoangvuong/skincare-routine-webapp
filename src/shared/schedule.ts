import { routine } from "./routine";
import {
  isStepTuple, isThresholdVariant,
  type Category, type RoutineStep, type StepTuple,
} from "./types";

/**
 * A RoutineStep resolved to the concrete [product, note] for `week` (1-based,
 * from programWeek()). A plain tuple is returned by reference; a threshold
 * switches at untilWeek; a cycle indexes weeks by (week - 1) % length.
 */
export function resolveStep(step: RoutineStep, week: number): StepTuple {
  if (isStepTuple(step)) return step;
  if (isThresholdVariant(step)) return week <= step.untilWeek ? step.before : step.from;
  return step.weeks[(week - 1) % step.length];
}

/**
 * A routine day with every step resolved to a concrete tuple — the shape
 * `DayData` had before RoutineStep widened the authored arrays.
 */
export type ResolvedDay =
  | { short: string; full: string; focus: string; am: StepTuple[]; pm: StepTuple[] }
  | { short: string; full: string; type: string; steps: StepTuple[] };

/**
 * The routine day for (category, dayIndex) with every step resolved for `week`.
 * TEMPORARY: superseded by content.ts#resolveDayForState (which also applies
 * user overrides) — kept only until progress.ts and the components move over.
 */
export function resolveDay(category: Category, dayIndex: number, week: number): ResolvedDay {
  const day = routine[category].days[dayIndex];
  if ("steps" in day) {
    return { ...day, steps: day.steps.map((s) => resolveStep(s, week)) };
  }
  return {
    ...day,
    am: day.am.map((s) => resolveStep(s, week)),
    pm: day.pm.map((s) => resolveStep(s, week)),
  };
}
