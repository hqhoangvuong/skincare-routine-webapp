import type { StepPhase } from "../shared/types";

/** Column headers for the seven routine days, Monday-first. */
export const DAY_SHORT: readonly string[] = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Human label for a step phase. */
export const PHASE_LABEL: Record<StepPhase, string> = {
  am: "Sáng",
  pm: "Tối",
  steps: "Chăm tóc",
};
