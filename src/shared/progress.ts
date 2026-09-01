import { programWeek, weekdayDateIso } from "./date";
import { resolveDayForState } from "./content";
import type { AppState, Category, CompletedStep, StepPhase } from "./types";

function sameStep(a: CompletedStep, b: CompletedStep): boolean {
  return a.date === b.date && a.category === b.category && a.stepId === b.stepId;
}

/** Add `target` if absent, remove it if present. Pure. Does not stamp updatedAt. */
export function toggleCompletedStep(state: AppState, target: CompletedStep): AppState {
  const without = state.completedSteps.filter((entry) => !sameStep(entry, target));
  const next = without.length === state.completedSteps.length ? [...without, target] : without;
  return { ...state, completedSteps: next };
}

/** True when the step slot is checked for its date within `nowIso`'s week. */
export function isStepDone(
  completed: CompletedStep[],
  category: Category,
  dayIndex: number,
  stepId: string,
  nowIso: string,
): boolean {
  const date = weekdayDateIso(dayIndex, nowIso);
  return completed.some((entry) => sameStep(entry, { date, category, stepId }));
}

function phaseSteps(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, week: number,
): { id: string }[] {
  const day = resolveDayForState(state, category, dayIndex, week);
  if (day.kind === "hair") return phase === "steps" ? day.steps : [];
  if (phase === "am") return day.am;
  if (phase === "pm") return day.pm;
  return [];
}

export function phaseCompletion(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, nowIso: string,
): { done: number; total: number } {
  const week = programWeek(state.programStartDate, nowIso);
  const steps = phaseSteps(state, category, dayIndex, phase, week);
  const date = weekdayDateIso(dayIndex, nowIso);
  let done = 0;
  for (const step of steps) {
    if (state.completedSteps.some((e) => sameStep(e, { date, category, stepId: step.id }))) done += 1;
  }
  return { done, total: steps.length };
}

export function dayCompletion(
  state: AppState, category: Category, dayIndex: number, nowIso: string,
): { done: number; total: number } {
  const week = programWeek(state.programStartDate, nowIso);
  const day = resolveDayForState(state, category, dayIndex, week);
  const phases: StepPhase[] = day.kind === "hair" ? ["steps"] : ["am", "pm"];
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    const c = phaseCompletion(state, category, dayIndex, phase, nowIso);
    done += c.done;
    total += c.total;
  }
  return { done, total };
}
