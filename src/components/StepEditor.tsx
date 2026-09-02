import { useEffect, useRef, useState } from "react";
import VariantEditor from "./VariantEditor";
import ConfirmRemove from "./ConfirmRemove";
import { isStepTuple, type RoutineStep } from "../shared/types";
import type { ResolvedStep } from "../shared/content";

const EDIT_TAG: Record<"modified" | "added", string> = { modified: "đã đổi", added: "mới" };

export default function StepEditor({
  display,
  raw,
  edited = null,
  initialOpen = false,
  autoFocusFirst = false,
  onUpdateTuple,
  onSetVariant,
  onRemove,
}: {
  display: ResolvedStep;
  raw: RoutineStep;
  edited?: "modified" | "added" | null;
  initialOpen?: boolean;
  autoFocusFirst?: boolean;
  onUpdateTuple: (product: string, note: string) => void;
  onSetVariant: (next: RoutineStep) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const liRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (initialOpen && liRef.current?.scrollIntoView) liRef.current.scrollIntoView({ block: "nearest" });
  }, [initialOpen]);

  const cls = `step-edit${edited === "modified" ? " is-modified" : edited === "added" ? " is-added" : ""}`;

  return (
    <li ref={liRef} className={cls}>
      <div className="step-edit-head">
        <button type="button" className="step-edit-toggle" aria-expanded={open}
          aria-label={`Sửa bước: ${display.product || "Bước chưa đặt tên"}`}
          onClick={() => setOpen((v) => !v)}>
          <span>{display.product || "Bước chưa đặt tên"}</span>
          {edited && <span className="step-edit-tag">{EDIT_TAG[edited]}</span>}
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        <ConfirmRemove label="Xoá bước" onConfirm={onRemove} />
      </div>
      {open && (
        <VariantEditor
          value={raw}
          autoFocusFirst={autoFocusFirst}
          onChange={(next) => {
            if (isStepTuple(next)) onUpdateTuple(next[0], next[1]);
            else onSetVariant(next);
          }}
        />
      )}
    </li>
  );
}
