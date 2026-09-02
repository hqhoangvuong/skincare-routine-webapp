import { useState } from "react";
import { getStoredDays, isStepEdited } from "../shared/content";
import type { AppState, Category, StepPhase, StoredStep } from "../shared/types";

const DAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PHASE_LABEL: Record<StepPhase, string> = { am: "Sáng", pm: "Tối", steps: "Chăm tóc" };

type Change = {
  dayIndex: number;
  phase: StepPhase;
  id: string;
  product: string;
  kind: "modified" | "added";
};

function collectChanges(state: AppState, category: Category): Change[] {
  const out: Change[] = [];
  const days = getStoredDays(state, category);
  days.forEach((day, dayIndex) => {
    const phases: [StepPhase, StoredStep[]][] =
      "steps" in day
        ? [["steps", day.steps]]
        : [["am", day.am], ["pm", day.pm]];
    for (const [phase, steps] of phases) {
      steps.forEach((s) => {
        const kind = isStepEdited(state, category, dayIndex, phase, s.id);
        if (kind) {
          const stepValue = s.step;
          const product = Array.isArray(stepValue)
            ? stepValue[0]
            : stepValue.kind === "threshold"
              ? stepValue.before[0]
              : stepValue.weeks[0][0];
          out.push({ dayIndex, phase, id: s.id, product, kind });
        }
      });
    }
  });
  return out;
}

export default function CustomizationsStrip({
  state,
  category,
  onJump,
  onReset,
}: {
  state: AppState;
  category: Category;
  onJump: (dayIndex: number, stepId: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const changes = collectChanges(state, category);
  const modified = changes.filter((c) => c.kind === "modified").length;
  const added = changes.filter((c) => c.kind === "added").length;

  const parts = [`${modified} bước đã đổi`];
  if (added > 0) parts.push(`${added} bước mới`);

  return (
    <div className="customizations">
      <div className="customizations-head">
        <span>✎ Bạn đã tuỳ chỉnh mục này — {parts.join(", ")}</span>
        <button type="button" className="reset-category" onClick={onReset}>Đặt lại</button>
        <button type="button" aria-label="Xem chi tiết" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open && (
        <ul className="customizations-list">
          {changes.map((c) => (
            <li key={`${c.dayIndex}.${c.phase}.${c.id}`}>
              <button type="button" onClick={() => onJump(c.dayIndex, c.id)}>
                {DAY_SHORT[c.dayIndex]} · {PHASE_LABEL[c.phase]} · {c.product || "Bước chưa đặt tên"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
