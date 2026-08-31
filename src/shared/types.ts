export type Category = "face" | "hair" | "body";

/** [product name, note]. The note is "" when there isn't one. */
export type StepTuple = [product: string, note: string];

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
  version: 1;
  /** ISO timestamp of the last local mutation; drives mount-time reconciliation. */
  updatedAt: string;
  /** ISO date, e.g. "2026-08-24". */
  programStartDate: string;
  ui: {
    activeCategory: Category;
    activeDayByCategory: Record<Category, number>;
  };
};

export type SyncStatus = "synced" | "offline" | "unauthorized";
