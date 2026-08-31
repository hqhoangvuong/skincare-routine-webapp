import { todayIso } from "./date";
import type { AppState } from "./types";

export function makeDefaultState(now: Date = new Date()): AppState {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    programStartDate: todayIso(now),
    ui: {
      activeCategory: "face",
      activeDayByCategory: { face: 0, hair: 0, body: 0 },
    },
  };
}
