import {
  isStepTuple, isThresholdVariant,
  type RoutineStep, type StepTuple,
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
