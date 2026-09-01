import { useState } from "react";
import VariantEditor from "./VariantEditor";
import { isStepTuple, type RoutineStep } from "../shared/types";
import type { ResolvedStep } from "../shared/content";

export default function StepEditor({
  display,
  raw,
  onUpdateTuple,
  onSetVariant,
  onRemove,
}: {
  display: ResolvedStep;
  raw: RoutineStep;
  onUpdateTuple: (product: string, note: string) => void;
  onSetVariant: (next: RoutineStep) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="step-edit">
      <div className="step-edit-head">
        <button type="button" className="step-edit-toggle" aria-expanded={open}
          aria-label={`Sửa bước: ${display.product || "Bước chưa đặt tên"}`}
          onClick={() => setOpen((v) => !v)}>
          <span>{display.product || "Bước chưa đặt tên"}</span>
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        <button type="button" aria-label="Xoá bước" onClick={onRemove}>×</button>
      </div>
      {open && (
        <VariantEditor
          value={raw}
          onChange={(next) => {
            if (isStepTuple(next)) onUpdateTuple(next[0], next[1]);
            else onSetVariant(next);
          }}
        />
      )}
    </li>
  );
}
