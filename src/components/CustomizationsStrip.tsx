import { useState } from "react";
import { getStoredDays, isDayMetaEdited, isFocusPrefixEdited, isStepEdited } from "../shared/content";
import type { AppState, Category, StepPhase, StoredStep } from "../shared/types";
import { DAY_SHORT, PHASE_LABEL } from "./dayLabels";

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

  const daysWithMeta = getStoredDays(state, category)
    .filter((_, dayIndex) => isDayMetaEdited(state, category, dayIndex)).length;
  const prefixEdited = isFocusPrefixEdited(state, category);

  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} bước đã đổi`);
  if (added > 0) parts.push(`${added} bước mới`);
  if (daysWithMeta > 0) parts.push(`${daysWithMeta} ngày đổi tiêu đề`);
  if (prefixEdited) parts.push("tiền tố nhãn đã đổi");

  return (
    <div className="customizations">
      <div className="customizations-head">
        <span>
          ✎ Bạn đã tuỳ chỉnh mục này{modified === 0 && added === 0 && daysWithMeta === 0 && !prefixEdited ? "" : ` — ${parts.join(", ")}`}
        </span>
        <button type="button" className="reset-category" onClick={onReset}>Đặt lại</button>
        <button type="button" aria-label="Xem chi tiết" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
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
