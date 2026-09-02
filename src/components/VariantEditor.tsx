import { useEffect, useRef } from "react";
import { isStepTuple, isThresholdVariant, type RoutineStep, type StepTuple } from "../shared/types";
import { useBufferedText } from "../hooks/useBufferedText";

type Kind = "plain" | "threshold" | "cycle";

export function firstTuple(step: RoutineStep): StepTuple {
  if (isStepTuple(step)) return step;
  if (isThresholdVariant(step)) return step.before;
  return step.weeks[0];
}

function kindOf(step: RoutineStep): Kind {
  if (isStepTuple(step)) return "plain";
  return step.kind;
}

function padWeeks(weeks: StepTuple[], length: 2 | 4): StepTuple[] {
  const next = weeks.slice(0, length);
  while (next.length < length) next.push(["", ""]);
  return next;
}

function TupleFields({
  label, value, onChange, autoFocusFirst = false,
}: {
  label: { product: string; note: string };
  value: StepTuple;
  onChange: (t: StepTuple) => void;
  autoFocusFirst?: boolean;
}) {
  const productBuf = useBufferedText(value[0], (p) => onChange([p, value[1]]));
  const noteBuf = useBufferedText(value[1], (n) => onChange([value[0], n]));
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusFirst) firstRef.current?.focus();
  }, [autoFocusFirst]);
  return (
    <div className="variant-branch">
      <label>
        {label.product}
        <input
          ref={firstRef}
          type="text"
          placeholder="Tên sản phẩm / bước"
          value={productBuf.value}
          onChange={productBuf.onChange}
          onFocus={productBuf.onFocus}
          onBlur={productBuf.onBlur}
        />
      </label>
      <label>
        {label.note}
        <input
          type="text"
          placeholder="Ghi chú (không bắt buộc)"
          value={noteBuf.value}
          onChange={noteBuf.onChange}
          onFocus={noteBuf.onFocus}
          onBlur={noteBuf.onBlur}
        />
      </label>
    </div>
  );
}

function UntilWeekField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const buf = useBufferedText(String(value), (s) => onCommit(coerceWeek(s)));
  return (
    <label>
      Đổi từ tuần thứ
      <input type="number" min={1} value={buf.value}
        onChange={buf.onChange} onFocus={buf.onFocus} onBlur={buf.onBlur} />
    </label>
  );
}

export default function VariantEditor({
  value,
  onChange,
}: {
  value: RoutineStep;
  onChange: (next: RoutineStep) => void;
}) {
  const kind = kindOf(value);
  const base = firstTuple(value);

  function switchKind(next: Kind): void {
    if (next === kind) return;
    if (next === "plain") onChange(base);
    else if (next === "threshold")
      onChange({ kind: "threshold", untilWeek: 2, before: [...base], from: [...base] });
    else onChange({ kind: "cycle", length: 2, weeks: [[...base], [...base]] });
  }

  return (
    <div className="variant-editor">
      <label>
        Kiểu đổi theo tuần
        <select value={kind} onChange={(e) => switchKind(toKind(e.target.value))}>
          <option value="plain">Không đổi theo tuần</option>
          <option value="threshold">Đổi theo mốc tuần</option>
          <option value="cycle">Luân phiên theo chu kỳ</option>
        </select>
      </label>

      {kind === "plain" && (
        <TupleFields label={{ product: "Sản phẩm", note: "Ghi chú" }} value={base}
          onChange={(t) => onChange(t)} />
      )}

      {kind === "threshold" && !isStepTuple(value) && value.kind === "threshold" && (
        <>
          <UntilWeekField value={value.untilWeek} onCommit={(n) => onChange({ ...value, untilWeek: n })} />
          <TupleFields
            label={{ product: `Sản phẩm — tuần 1–${value.untilWeek}`, note: `Ghi chú — tuần 1–${value.untilWeek}` }}
            value={value.before}
            onChange={(t) => onChange({ ...value, before: t })} />
          <TupleFields
            label={{ product: `Sản phẩm — từ tuần ${value.untilWeek + 1}`, note: `Ghi chú — từ tuần ${value.untilWeek + 1}` }}
            value={value.from}
            onChange={(t) => onChange({ ...value, from: t })} />
        </>
      )}

      {kind === "cycle" && !isStepTuple(value) && value.kind === "cycle" && (
        <>
          <label>
            Số tuần trong chu kỳ
            <select value={value.length}
              onChange={(e) => {
                const length = e.target.value === "4" ? 4 : 2;
                onChange({ kind: "cycle", length, weeks: padWeeks(value.weeks, length) });
              }}>
              <option value="2">2</option>
              <option value="4">4</option>
            </select>
          </label>
          {value.weeks.map((week, i) => (
            <TupleFields key={i}
              label={{ product: cycleLabel(value.length, i, "Sản phẩm"), note: cycleLabel(value.length, i, "Ghi chú") }}
              value={week}
              onChange={(t) => {
                const weeks = value.weeks.map((w, wi) => (wi === i ? t : w));
                onChange({ ...value, weeks });
              }} />
          ))}
        </>
      )}
    </div>
  );
}

function toKind(v: string): Kind {
  return v === "threshold" ? "threshold" : v === "cycle" ? "cycle" : "plain";
}

function coerceWeek(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

function cycleLabel(length: 2 | 4, i: number, prefix: string): string {
  if (length === 2) return `${prefix} — tuần ${i === 0 ? "lẻ (1, 3…)" : "chẵn (2, 4…)"}`;
  return `${prefix} — tuần ${i + 1}`;
}
