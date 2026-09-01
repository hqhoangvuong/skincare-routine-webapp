import { todayIso } from "./date";
import type { AppState } from "./types";

export function makeDefaultState(now: Date = new Date()): AppState {
  return {
    version: 2,
    updatedAt: now.toISOString(),
    programStartDate: todayIso(now),
    completedSteps: [],
    ui: {
      activeCategory: "face",
      activeDayByCategory: { face: 0, hair: 0, body: 0 },
    },
  };
}
