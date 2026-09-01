import { programWeek, weekdayDateIso } from "./date";
import { resolveDay } from "./schedule";
import { isHairDay, type AppState, type Category, type CompletedStep, type StepPhase } from "./types";

function sameStep(a: CompletedStep, b: CompletedStep): boolean {
  return (
    a.date === b.date &&
    a.category === b.category &&
    a.phase === b.phase &&
    a.stepIndex === b.stepIndex
  );
}

/**
 * Add `target` if no equal entry exists, remove it if one does. Pure. Does not
 * stamp `updatedAt` — the caller's `update()` does that.
 */
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
  phase: StepPhase,
  stepIndex: number,
  nowIso: string,
): boolean {
  const date = weekdayDateIso(dayIndex, nowIso);
  return completed.some((entry) => sameStep(entry, { date, category, phase, stepIndex }));
}

function phaseLength(category: Category, dayIndex: number, phase: StepPhase, week: number): number {
  const day = resolveDay(category, dayIndex, week);
  if (isHairDay(day)) return phase === "steps" ? day.steps.length : 0;
  if (phase === "am") return day.am.length;
  if (phase === "pm") return day.pm.length;
  return 0;
}

export function phaseCompletion(
  completed: CompletedStep[],
  programStartDate: string,
  category: Category,
  dayIndex: number,
  phase: StepPhase,
  nowIso: string,
): { done: number; total: number } {
  const week = programWeek(programStartDate, nowIso);
  const total = phaseLength(category, dayIndex, phase, week);
  const date = weekdayDateIso(dayIndex, nowIso);
  let done = 0;
  for (let i = 0; i < total; i += 1) {
    if (completed.some((entry) => sameStep(entry, { date, category, phase, stepIndex: i }))) {
      done += 1;
    }
  }
  return { done, total };
}

export function dayCompletion(
  completed: CompletedStep[],
  programStartDate: string,
  category: Category,
  dayIndex: number,
  nowIso: string,
): { done: number; total: number } {
  const week = programWeek(programStartDate, nowIso);
  const day = resolveDay(category, dayIndex, week);
  const phases: StepPhase[] = isHairDay(day) ? ["steps"] : ["am", "pm"];
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    const c = phaseCompletion(completed, programStartDate, category, dayIndex, phase, nowIso);
    done += c.done;
    total += c.total;
  }
  return { done, total };
}
