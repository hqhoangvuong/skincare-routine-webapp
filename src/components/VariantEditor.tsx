import { isStepTuple, isThresholdVariant, type RoutineStep, type StepTuple } from "../shared/types";

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
  label, value, onChange,
}: {
  label: { product: string; note: string };
  value: StepTuple;
  onChange: (t: StepTuple) => void;
}) {
  return (
    <div className="variant-branch">
      <label>
        {label.product}
        <input type="text" value={value[0]} placeholder="Bước chưa đặt tên"
          onChange={(e) => onChange([e.target.value, value[1]])} />
      </label>
      <label>
        {label.note}
        <input type="text" value={value[1]}
          onChange={(e) => onChange([value[0], e.target.value])} />
      </label>
    </div>
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
    else if (next === "threshold") onChange({ kind: "threshold", untilWeek: 2, before: base, from: base });
    else onChange({ kind: "cycle", length: 2, weeks: [base, base] });
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
          <label>
            Đổi từ tuần thứ
            <input type="number" min={1} value={value.untilWeek}
              onChange={(e) => onChange({ ...value, untilWeek: coerceWeek(e.target.value) })}
              onBlur={(e) => onChange({ ...value, untilWeek: coerceWeek(e.target.value) })} />
          </label>
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
