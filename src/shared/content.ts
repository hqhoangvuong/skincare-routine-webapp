import { routine } from "./routine";
import { resolveStep } from "./schedule";
import {
  isHairDay, isStepTuple,
  type AppState, type Category, type CategoryData, type CategoryOverride, type DayData,
  type RoutineStep, type StepPhase, type StepTuple, type StoredDay, type StoredStep,
} from "./types";

export type ResolvedStep = { id: string; product: string; note: string };

export type ResolvedDay =
  | { kind: "facebody"; short: string; full: string; focus: string; am: ResolvedStep[]; pm: ResolvedStep[] }
  | { kind: "hair"; short: string; full: string; type: string; steps: ResolvedStep[] };

function tuplesEqual(a: StepTuple, b: StepTuple): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Structural equality for a RoutineStep — key-order-safe, no JSON.stringify. */
function routineStepsEqual(a: RoutineStep, b: RoutineStep): boolean {
  const aTuple = isStepTuple(a);
  const bTuple = isStepTuple(b);
  if (aTuple || bTuple) return aTuple && bTuple && tuplesEqual(a, b);
  if (a.kind !== b.kind) return false;
  if (a.kind === "threshold" && b.kind === "threshold") {
    return a.untilWeek === b.untilWeek && tuplesEqual(a.before, b.before) && tuplesEqual(a.from, b.from);
  }
  if (a.kind === "cycle" && b.kind === "cycle") {
    return (
      a.length === b.length &&
      a.weeks.length === b.weeks.length &&
      a.weeks.every((w, i) => tuplesEqual(w, b.weeks[i]))
    );
  }
  return false;
}

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

/**
 * Whether a step in an edited category differs from the shipped routine.
 * "added" — a `new-*` id (no shipped counterpart). "modified" — a default step
 * whose current form differs from routine.ts. null — no override, id not found,
 * or unchanged.
 *
 * The comparison is by the step's ORIGINAL index, encoded in its frozen id
 * (`${category}.${dayIndex}.${phase}.${index}`), not its current array position
 * — so reordering or deleting a sibling never mislabels an untouched step.
 */
export function isStepEdited(
  state: AppState,
  category: Category,
  dayIndex: number,
  phase: StepPhase,
  id: string,
): "modified" | "added" | null {
  if (!state.overrides?.[category]) return null;

  const storedDay = getStoredDays(state, category)[dayIndex];
  const stored: StoredStep[] = "steps" in storedDay
    ? phase === "steps" ? storedDay.steps : []
    : phase === "am" ? storedDay.am : phase === "pm" ? storedDay.pm : [];

  const found = stored.find((s) => s.id === id);
  if (found === undefined) return null;

  const last = id.slice(id.lastIndexOf(".") + 1);
  if (last.startsWith("new-")) return "added";
  const originalIndex = Number(last);

  const defaultDay = routine[category].days[dayIndex];
  // can't reuse phaseArrayOf: it aliases steps→am on face days
  const defaultSteps: RoutineStep[] = isHairDay(defaultDay)
    ? phase === "steps" ? defaultDay.steps : []
    : phase === "am" ? defaultDay.am : phase === "pm" ? defaultDay.pm : [];

  const def = defaultSteps[originalIndex];
  if (def === undefined) return "added";
  return routineStepsEqual(found.step, def) ? null : "modified";
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

/** Deep-ish clone of one override (arrays + step objects), safe to mutate. */
function cloneOverride(o: CategoryOverride): CategoryOverride {
  return {
    products: [...o.products],
    focusPrefix: o.focusPrefix,
    days: o.days.map((day) =>
      "steps" in day
        ? { ...day, steps: day.steps.map((s) => ({ ...s })) }
        : { ...day, am: day.am.map((s) => ({ ...s })), pm: day.pm.map((s) => ({ ...s })) },
    ),
  };
}

/** The category's override, cloned; created from defaults (with derived ids) on first touch. */
function ensureOverride(state: AppState, category: Category): CategoryOverride {
  const existing = state.overrides?.[category];
  if (existing) return cloneOverride(existing);
  return { products: [...routine[category].products], days: getStoredDays(state, category) };
}

function withOverride(state: AppState, category: Category, o: CategoryOverride): AppState {
  return { ...state, overrides: { ...state.overrides, [category]: o } };
}

function phaseArrayOf(day: StoredDay, phase: StepPhase): StoredStep[] {
  if ("steps" in day) return day.steps;
  return phase === "pm" ? day.pm : day.am;
}

function setPhaseArray(day: StoredDay, phase: StepPhase, next: StoredStep[]): StoredDay {
  if ("steps" in day) return { ...day, steps: next };
  return phase === "pm" ? { ...day, pm: next } : { ...day, am: next };
}

export function addProduct(state: AppState, category: Category, name = ""): AppState {
  const o = ensureOverride(state, category);
  o.products.push(name);
  return withOverride(state, category, o);
}

export function renameProduct(state: AppState, category: Category, index: number, name: string): AppState {
  const o = ensureOverride(state, category);
  if (index >= 0 && index < o.products.length) o.products[index] = name;
  return withOverride(state, category, o);
}

export function removeProduct(state: AppState, category: Category, index: number): AppState {
  const o = ensureOverride(state, category);
  if (index >= 0 && index < o.products.length) o.products.splice(index, 1);
  return withOverride(state, category, o);
}

export function addStep(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
): AppState {
  const o = ensureOverride(state, category);
  const n = state.stepSeq ?? 0;
  const day = o.days[dayIndex];
  const blank: StepTuple = ["", ""];
  const next = [...phaseArrayOf(day, phase), { id: `${category}.${dayIndex}.${phase}.new-${n}`, step: blank }];
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return { ...withOverride(state, category, o), stepSeq: n + 1 };
}

export function updateStepTuple(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
  id: string, product: string, note: string,
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const step: StepTuple = [product, note];
  const next = phaseArrayOf(day, phase).map((s) => (s.id === id ? { id, step } : s));
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return withOverride(state, category, o);
}

export function removeStep(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, id: string,
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const next = phaseArrayOf(day, phase).filter((s) => s.id !== id);
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return withOverride(state, category, o);
}

export function moveStep(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
  fromIndex: number, toIndex: number,
): AppState {
  const o0 = state.overrides?.[category];
  const currentDay = o0 ? o0.days[dayIndex] : getStoredDays(state, category)[dayIndex];
  const len = phaseArrayOf(currentDay, phase).length;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 || fromIndex >= len ||
    toIndex < 0 || toIndex >= len
  ) {
    return state;
  }

  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const arr = [...phaseArrayOf(day, phase)];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  o.days[dayIndex] = setPhaseArray(day, phase, arr);
  return withOverride(state, category, o);
}

export function moveProduct(
  state: AppState, category: Category, fromIndex: number, toIndex: number,
): AppState {
  const current = state.overrides?.[category]?.products ?? routine[category].products;
  const len = current.length;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 || fromIndex >= len ||
    toIndex < 0 || toIndex >= len
  ) {
    return state;
  }
  const o = ensureOverride(state, category);
  const arr = [...o.products];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  o.products = arr;
  return withOverride(state, category, o);
}

export function setStepVariant(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
  id: string, variant: RoutineStep,
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const next = phaseArrayOf(day, phase).map((s) => (s.id === id ? { id, step: variant } : s));
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return withOverride(state, category, o);
}

const DEFAULT_FOCUS_PREFIX: Record<Category, string> = {
  face: "Trọng tâm tối nay: ",
  body: "",
  hair: "",
};

export function updateDayMeta(
  state: AppState, category: Category, dayIndex: number,
  patch: { full?: string; focus?: string; type?: string },
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  if ("steps" in day) {
    o.days[dayIndex] = {
      ...day,
      full: patch.full ?? day.full,
      type: patch.type ?? day.type,
    };
  } else {
    o.days[dayIndex] = {
      ...day,
      full: patch.full ?? day.full,
      focus: patch.focus ?? day.focus,
    };
  }
  return withOverride(state, category, o);
}

export function setFocusPrefix(state: AppState, category: Category, prefix: string): AppState {
  const o = ensureOverride(state, category);
  o.focusPrefix = prefix;
  return withOverride(state, category, o);
}

export function getFocusPrefix(state: AppState, category: Category): string {
  const p = state.overrides?.[category]?.focusPrefix;
  return p ?? DEFAULT_FOCUS_PREFIX[category];
}

export function isDayMetaEdited(state: AppState, category: Category, dayIndex: number): boolean {
  const override = state.overrides?.[category];
  if (!override) return false;
  const stored = override.days[dayIndex];
  const def = routine[category].days[dayIndex];
  if (stored.full !== def.full) return true;
  if ("steps" in stored && isHairDay(def)) return stored.type !== def.type;
  if (!("steps" in stored) && !isHairDay(def)) return stored.focus !== def.focus;
  return false;
}

export function isFocusPrefixEdited(state: AppState, category: Category): boolean {
  const p = state.overrides?.[category]?.focusPrefix;
  if (p === undefined) return false;
  return p !== DEFAULT_FOCUS_PREFIX[category];
}

export type StepUsage = { dayIndex: number; phase: StepPhase; stepId: string };

/** The product name strings a step names, across every conditional branch. */
function stepProductNames(step: RoutineStep): string[] {
  if (isStepTuple(step)) return [step[0]];
  if (step.kind === "threshold") return [step.before[0], step.from[0]];
  return step.weeks.map((w) => w[0]);
}

/**
 * Every step in `category` whose product name (any branch, trimmed) equals
 * `name` trimmed. Week-independent — "is this product named in the step",
 * not "does the step resolve to it this week". Ordered by day, then
 * am/pm/steps, then array order. Empty/whitespace `name` → [].
 */
export function productUsage(
  state: AppState, category: Category, name: string,
): StepUsage[] {
  const target = name.trim();
  if (target === "") return [];
  const out: StepUsage[] = [];
  getStoredDays(state, category).forEach((day, dayIndex) => {
    const phases: [StepPhase, StoredStep[]][] = "steps" in day
      ? [["steps", day.steps]]
      : [["am", day.am], ["pm", day.pm]];
    for (const [phase, steps] of phases) {
      for (const s of steps) {
        if (stepProductNames(s.step).some((n) => n.trim() === target)) {
          out.push({ dayIndex, phase, stepId: s.id });
        }
      }
    }
  });
  return out;
}

export function resetCategory(state: AppState, category: Category): AppState {
  if (!state.overrides?.[category]) return state;
  const nextOverrides = { ...state.overrides };
  delete nextOverrides[category];
  const isEmpty = Object.keys(nextOverrides).length === 0;
  return { ...state, overrides: isEmpty ? undefined : nextOverrides };
}
