import { routine } from "./routine";
import { isHairDay, type Category, type DayData, type FaceOrBodyDay, type StepTuple } from "./types";

const WEEKS_1_2_WEDNESDAY_AM: StepTuple = [
  "Serum Vitamin C — Cocoon Nghệ C22",
  "Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide",
];

const EVEN_CYCLE_SUNDAY_PM: StepTuple = [
  "Mặt nạ Histolab Natural White",
  "Mặt nạ tuần chẵn trong chu kỳ 4 tuần",
];

function withStep(day: FaceOrBodyDay, phase: "am" | "pm", index: number, step: StepTuple): FaceOrBodyDay {
  const next = [...day[phase]];
  next[index] = step;
  return phase === "am" ? { ...day, am: next } : { ...day, pm: next };
}

/**
 * The routine day for (category, dayIndex), with week-conditional steps
 * substituted. `routine.ts` holds the steady-state (week 3+) form; this patches
 * weeks 1–2 and the 4-week mask rotation on top. `week` is the 1-based program
 * week (from `programWeek`). Returns the routine entry unchanged — same object
 * reference — for every non-conditional case.
 */
export function resolveDay(category: Category, dayIndex: number, week: number): DayData {
  const day = routine[category].days[dayIndex];
  if (category !== "face" || isHairDay(day)) return day;

  // Wednesday (index 2) AM serum: Vitamin C in weeks 1–2, Niacinamide from week 3.
  if (dayIndex === 2 && week <= 2) {
    return withStep(day, "am", 2, WEEKS_1_2_WEDNESDAY_AM);
  }

  // Sunday (index 6) PM mask: Peppermint on odd cycle weeks, Natural White on even.
  const cyclePosition = ((week - 1) % 4) + 1;
  if (dayIndex === 6 && (cyclePosition === 2 || cyclePosition === 4)) {
    return withStep(day, "pm", 3, EVEN_CYCLE_SUNDAY_PM);
  }

  return day;
}
