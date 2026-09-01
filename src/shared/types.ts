export type Category = "face" | "hair" | "body";

export const CATEGORIES: readonly Category[] = ["face", "hair", "body"];

/** [product name, note]. The note is "" when there isn't one. */
export type StepTuple = [product: string, note: string];

export type StepPhase = "am" | "pm" | "steps";

const STEP_PHASES: readonly StepPhase[] = ["am", "pm", "steps"];

export type CompletedStep = {
  date: string; // ISO date of the routine day this step belongs to
  category: Category;
  phase: StepPhase;
  stepIndex: number;
};

export type FaceOrBodyDay = {
  short: string;
  full: string;
  focus: string;
  am: StepTuple[];
  pm: StepTuple[];
};

/** Hair days are a flat list and use `type` where face/body use `focus`. */
export type HairDay = {
  short: string;
  full: string;
  type: string;
  steps: StepTuple[];
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
  version: 2;
  /** ISO timestamp of the last local mutation; drives mount-time reconciliation. */
  updatedAt: string;
  /** ISO date, e.g. "2026-08-24". */
  programStartDate: string;
  /** Every checked step, as a dated log. Unordered; treated as a set. No cap. */
  completedSteps: CompletedStep[];
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

function isStepPhase(value: unknown): value is StepPhase {
  return STEP_PHASES.some((phase) => phase === value);
}

export function isCompletedStep(value: unknown): value is CompletedStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    isCategory(value.category) &&
    isStepPhase(value.phase) &&
    typeof value.stepIndex === "number"
  );
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
    v.version === 2 &&
    typeof v.updatedAt === "string" &&
    typeof v.programStartDate === "string" &&
    Array.isArray(v.completedSteps) &&
    v.completedSteps.every(isCompletedStep) &&
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

/**
 * Upgrades an untrusted stored blob to the current `AppState` shape, or returns
 * null if it is neither a current state nor a recognisable older one. The one
 * place version migrations live; both deployables call it on every untrusted
 * read (localStorage mirror, Worker GET, remote fetch body).
 */
export function migrate(value: unknown): AppState | null {
  if (isAppState(value)) return value;
  if (isV1State(value)) {
    return {
      version: 2,
      updatedAt: value.updatedAt,
      programStartDate: value.programStartDate,
      completedSteps: [],
      ui: value.ui,
    };
  }
  return null;
}
