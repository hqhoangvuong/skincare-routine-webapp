import { weekdayIndexOfIso } from "./date";

export type Category = "face" | "hair" | "body";

export const CATEGORIES: readonly Category[] = ["face", "hair", "body"];

/** [product name, note]. The note is "" when there isn't one. */
export type StepTuple = [product: string, note: string];

export type ThresholdVariant = {
  kind: "threshold";
  /** `before` applies to program-weeks 1..untilWeek; `from` applies from untilWeek+1 on. */
  untilWeek: number;
  before: StepTuple;
  from: StepTuple;
};

export type CycleVariant = {
  kind: "cycle";
  /** Cycle length in weeks. Only 2 and 4 are offered in the editor. */
  length: 2 | 4;
  /** Exactly `length` entries; selected by `(week - 1) % length`. */
  weeks: StepTuple[];
};

export type ConditionalStep = ThresholdVariant | CycleVariant;

/** A step as authored: a plain [product, note] or a week-conditional step. */
export type RoutineStep = StepTuple | ConditionalStep;

export type StepPhase = "am" | "pm" | "steps";

const STEP_PHASES: readonly StepPhase[] = ["am", "pm", "steps"];

export type CompletedStep = {
  date: string; // ISO date of the routine day this step belongs to
  category: Category;
  stepId: string;
};

export type StoredStep = { id: string; step: RoutineStep };

export type StoredFaceOrBodyDay = {
  short: string; full: string; focus: string;
  am: StoredStep[]; pm: StoredStep[];
};
export type StoredHairDay = {
  short: string; full: string; type: string;
  steps: StoredStep[];
};
export type StoredDay = StoredFaceOrBodyDay | StoredHairDay;

export type CategoryOverride = {
  products: string[];
  days: StoredDay[];
};

export type FaceOrBodyDay = {
  short: string;
  full: string;
  focus: string;
  am: RoutineStep[];
  pm: RoutineStep[];
};

/** Hair days are a flat list and use `type` where face/body use `focus`. */
export type HairDay = {
  short: string;
  full: string;
  type: string;
  steps: RoutineStep[];
};

export type DayData = FaceOrBodyDay | HairDay;

export type CategoryData = {
  products: string[];
  days: DayData[];
};

export function isHairDay(day: DayData): day is HairDay {
  return "steps" in day;
}

export type AppState = {
  version: 3;
  /** ISO timestamp of the last local mutation; drives mount-time reconciliation. */
  updatedAt: string;
  /** ISO date, e.g. "2026-08-24". */
  programStartDate: string;
  /** Every checked step, as a dated log. Unordered; treated as a set. No cap. */
  completedSteps: CompletedStep[];
  /** Present only for categories the user has edited. */
  overrides?: {
    face?: CategoryOverride;
    hair?: CategoryOverride;
    body?: CategoryOverride;
  };
  /** Monotonic counter for new-step ids. Absent = 0. */
  stepSeq?: number;
  ui: {
    activeCategory: Category;
    activeDayByCategory: Record<Category, number>;
  };
};

export type SyncStatus = "synced" | "offline" | "unauthorized";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCategory(value: unknown): value is Category {
  return CATEGORIES.some((category) => category === value);
}

/** Every known category must map to a number; a missing or non-number entry fails. */
function isActiveDayByCategory(value: unknown): value is Record<Category, number> {
  if (!isRecord(value)) return false;
  return CATEGORIES.every((category) => typeof value[category] === "number");
}

export function isStepPhase(value: unknown): value is StepPhase {
  return STEP_PHASES.some((phase) => phase === value);
}

export function isCompletedStep(value: unknown): value is CompletedStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    isCategory(value.category) &&
    typeof value.stepId === "string"
  );
}

export function isStepTuple(value: unknown): value is StepTuple {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
  );
}

export function isThresholdVariant(value: unknown): value is ThresholdVariant {
  if (!isRecord(value)) return false;
  return (
    value.kind === "threshold" &&
    typeof value.untilWeek === "number" &&
    isStepTuple(value.before) &&
    isStepTuple(value.from)
  );
}

export function isCycleVariant(value: unknown): value is CycleVariant {
  if (!isRecord(value)) return false;
  if (value.kind !== "cycle") return false;
  if (value.length !== 2 && value.length !== 4) return false;
  return (
    Array.isArray(value.weeks) &&
    value.weeks.length === value.length &&
    value.weeks.every(isStepTuple)
  );
}

export function isConditionalStep(value: unknown): value is ConditionalStep {
  return isThresholdVariant(value) || isCycleVariant(value);
}

export function isRoutineStep(value: unknown): value is RoutineStep {
  return isStepTuple(value) || isConditionalStep(value);
}

export function isStoredStep(value: unknown): value is StoredStep {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && isRoutineStep(value.step);
}

function isStoredDay(value: unknown): value is StoredDay {
  if (!isRecord(value)) return false;
  if (typeof value.short !== "string" || typeof value.full !== "string") return false;
  if ("steps" in value) {
    return (
      typeof value.type === "string" &&
      Array.isArray(value.steps) &&
      value.steps.every(isStoredStep)
    );
  }
  return (
    typeof value.focus === "string" &&
    Array.isArray(value.am) && value.am.every(isStoredStep) &&
    Array.isArray(value.pm) && value.pm.every(isStoredStep)
  );
}

export function isCategoryOverride(value: unknown): value is CategoryOverride {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.products) &&
    value.products.every((entry: unknown) => typeof entry === "string") &&
    Array.isArray(value.days) &&
    value.days.length === 7 &&
    value.days.every(isStoredDay)
  );
}

function isOverrides(value: unknown): value is AppState["overrides"] {
  if (!isRecord(value)) return false;
  for (const key of CATEGORIES) {
    if (key in value && !isCategoryOverride(value[key])) return false;
  }
  return true;
}

/**
 * Validates an untrusted blob parsed from JSON. Lives here, beside the type it
 * guards, so the frontend's localStorage mirror and the Worker's PUT handler
 * validate identically — two separate implementations would be free to drift,
 * and the failure mode is one side accepting a blob the other rejects.
 *
 * The nested `ui` shape is validated too, not just its presence: on the
 * Worker's PUT path a shape-blind guard would let a malformed `ui` (e.g.
 * `{}` or `[]`) get persisted into KV and served back on every later load.
 */
export function isAppState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 3 &&
    typeof v.updatedAt === "string" &&
    typeof v.programStartDate === "string" &&
    Array.isArray(v.completedSteps) &&
    v.completedSteps.every(isCompletedStep) &&
    (v.overrides === undefined || isOverrides(v.overrides)) &&
    (v.stepSeq === undefined || typeof v.stepSeq === "number") &&
    isRecord(v.ui) &&
    isCategory(v.ui.activeCategory) &&
    isActiveDayByCategory(v.ui.activeDayByCategory)
  );
}

type V1State = {
  version: 1;
  updatedAt: string;
  programStartDate: string;
  ui: { activeCategory: Category; activeDayByCategory: Record<Category, number> };
};

/**
 * A frozen snapshot of the v1 shape (this is intentionally a near-duplicate of
 * the pre-v2 `isAppState` body — it must NOT track future `isAppState` changes).
 */
function isV1State(value: unknown): value is V1State {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.updatedAt === "string" &&
    typeof value.programStartDate === "string" &&
    isRecord(value.ui) &&
    isCategory(value.ui.activeCategory) &&
    isActiveDayByCategory(value.ui.activeDayByCategory)
  );
}

type V2CompletedStep = {
  date: string; category: Category; phase: "am" | "pm" | "steps"; stepIndex: number;
};
type V2State = {
  version: 2;
  updatedAt: string;
  programStartDate: string;
  completedSteps: V2CompletedStep[];
  ui: { activeCategory: Category; activeDayByCategory: Record<Category, number> };
};

/** Frozen snapshot of the v2 shape. Must NOT track future isAppState changes. */
function isV2CompletedStep(value: unknown): value is V2CompletedStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    isCategory(value.category) &&
    (value.phase === "am" || value.phase === "pm" || value.phase === "steps") &&
    typeof value.stepIndex === "number"
  );
}
function isV2State(value: unknown): value is V2State {
  if (!isRecord(value)) return false;
  return (
    value.version === 2 &&
    typeof value.updatedAt === "string" &&
    typeof value.programStartDate === "string" &&
    Array.isArray(value.completedSteps) &&
    value.completedSteps.every(isV2CompletedStep) &&
    isRecord(value.ui) &&
    isCategory(value.ui.activeCategory) &&
    isActiveDayByCategory(value.ui.activeDayByCategory)
  );
}

/**
 * Upgrades an untrusted stored blob to the current `AppState` shape, or returns
 * null if it is neither a current state nor a recognisable older one. The one
 * place version migrations live; both deployables call it on every untrusted
 * read (localStorage mirror, Worker GET, remote fetch body).
 */
export function migrate(value: unknown): AppState | null {
  if (isAppState(value)) return value;

  if (isV2State(value)) {
    return {
      version: 3,
      updatedAt: value.updatedAt,
      programStartDate: value.programStartDate,
      completedSteps: value.completedSteps.map((c) => ({
        date: c.date,
        category: c.category,
        stepId: `${c.category}.${weekdayIndexOfIso(c.date)}.${c.phase}.${c.stepIndex}`,
      })),
      ui: value.ui,
    };
  }

  if (isV1State(value)) {
    return {
      version: 3,
      updatedAt: value.updatedAt,
      programStartDate: value.programStartDate,
      completedSteps: [],
      ui: value.ui,
    };
  }

  return null;
}
