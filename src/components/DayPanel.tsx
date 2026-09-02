import type { ReactNode } from "react";
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { programWeek, todayIso } from "../shared/date";
import { isStepDone, phaseCompletion } from "../shared/progress";
import {
  getFocusPrefix,
  getStoredDays,
  isDayMetaEdited,
  isFocusPrefixEdited,
  isStepEdited,
  resolveDayForState,
  type ResolvedDay,
  type ResolvedStep,
} from "../shared/content";
import StepEditor from "./StepEditor";
import { useBufferedText } from "../hooks/useBufferedText";
import { useDragSort } from "../hooks/useDragSort";
import type { AppState, Category, RoutineStep, StepPhase, StoredStep } from "../shared/types";

type ToggleStep = (category: Category, dayIndex: number, stepId: string) => void;

export type DayEdit = {
  onAddStep: (phase: StepPhase) => void;
  onUpdateStep: (phase: StepPhase, id: string, product: string, note: string) => void;
  onRemoveStep: (phase: StepPhase, id: string) => void;
  onSetVariant: (phase: StepPhase, id: string, variant: RoutineStep) => void;
  onReorderStep: (phase: StepPhase, fromIndex: number, toIndex: number) => void;
  onUpdateDayMeta: (patch: { full?: string; focus?: string; type?: string }) => void;
  onSetFocusPrefix: (prefix: string) => void;
};

function Steps({
  steps,
  category,
  dayIndex,
  completedSteps,
  nowIso,
  onToggleStep,
}: {
  steps: ResolvedStep[];
  category: Category;
  dayIndex: number;
  completedSteps: AppState["completedSteps"];
  nowIso: string;
  onToggleStep: ToggleStep;
}) {
  return (
    <ul className="steps">
      {steps.map((s) => {
        const checked = isStepDone(completedSteps, category, dayIndex, s.id, nowIso);
        return (
          <li key={s.id}>
            <label className="step-check">
              <input
                type="checkbox"
                aria-label={s.product}
                checked={checked}
                onChange={() => onToggleStep(category, dayIndex, s.id)}
              />
              <span className="step-check-box" aria-hidden="true" />
            </label>
            <div className="icon-badge">
              <Icon icon={pickIcon(s.product)} />
            </div>
            <div>
              <strong>{s.product}</strong>
              {s.note ? <span className="note">{s.note}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PhaseBody({
  phase,
  resolvedSteps,
  storedSteps,
  state,
  category,
  dayIndex,
  completedSteps,
  nowIso,
  onToggleStep,
  editing,
  onEdit,
  justAddedId = null,
  openStepId = null,
}: {
  phase: StepPhase;
  resolvedSteps: ResolvedStep[];
  storedSteps: StoredStep[];
  state: AppState;
  category: Category;
  dayIndex: number;
  completedSteps: AppState["completedSteps"];
  nowIso: string;
  onToggleStep: ToggleStep;
  editing: boolean;
  onEdit?: DayEdit;
  justAddedId?: string | null;
  openStepId?: string | null;
}) {
  const { order, handleProps, draggingKey } = useDragSort(
    resolvedSteps,
    (rs) => rs.id,
    (from, to) => onEdit?.onReorderStep(phase, from, to),
  );

  if (editing && onEdit) {
    const storedById = new Map(storedSteps.map((s) => [s.id, s]));
    return (
      <>
        <ul className="steps steps-edit">
          {order.map((rs) => {
            const stored = storedById.get(rs.id);
            if (!stored) return null;
            const originalIndex = storedSteps.indexOf(stored);
            return (
              <StepEditor
                key={rs.id}
                display={rs}
                raw={stored.step}
                edited={isStepEdited(state, category, dayIndex, phase, rs.id)}
                dragging={draggingKey === rs.id}
                initialOpen={rs.id === justAddedId || rs.id === openStepId}
                autoFocusFirst={rs.id === justAddedId}
                dragHandle={
                  <button
                    type="button"
                    className={`drag-handle${draggingKey === rs.id ? " is-dragging" : ""}`}
                    {...handleProps(originalIndex)}
                  >
                    ⠿
                  </button>
                }
                onUpdateTuple={(p, n) => onEdit.onUpdateStep(phase, rs.id, p, n)}
                onSetVariant={(v) => onEdit.onSetVariant(phase, rs.id, v)}
                onRemove={() => onEdit.onRemoveStep(phase, rs.id)}
              />
            );
          })}
        </ul>
        <button type="button" className="add-step" onClick={() => onEdit.onAddStep(phase)}>
          + Thêm bước
        </button>
      </>
    );
  }
  return (
    <Steps
      steps={resolvedSteps}
      category={category}
      dayIndex={dayIndex}
      completedSteps={completedSteps}
      nowIso={nowIso}
      onToggleStep={onToggleStep}
    />
  );
}

function Card({
  className,
  title,
  subtitle,
  done,
  total,
  editing = false,
  children,
}: {
  className?: string;
  title: string;
  subtitle: string;
  done: number;
  total: number;
  editing?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`card${className ? ` ${className}` : ""}`}>
      <div className="card-head">
        <Icon icon="flower" />
        <div>
          <p className="card-title">{title}</p>
          <p className="card-sub">{subtitle}</p>
        </div>
        {!editing && <span className="card-progress">{`${done}/${total}`}</span>}
      </div>
      {children}
    </div>
  );
}

const PANEL_COPY: Record<
  "face" | "body",
  { am: { title: string; subtitle: string }; pm: { title: string; subtitle: string } }
> = {
  face: {
    am: { title: "Buổi sáng", subtitle: "Chăm da ban ngày" },
    pm: { title: "Buổi tối", subtitle: "Chăm da ban đêm" },
  },
  body: {
    am: { title: "Sau khi tắm", subtitle: "Chăm thể ban ngày" },
    pm: { title: "Trước khi ngủ", subtitle: "Chăm thể ban đêm" },
  },
};

function DayHeaderEdit({
  state, category, dayIndex, day, onEdit,
}: {
  state: AppState;
  category: Category;
  dayIndex: number;
  day: ResolvedDay;
  onEdit: DayEdit;
}) {
  const nameBuf = useBufferedText(day.full, (v) => onEdit.onUpdateDayMeta({ full: v }));
  const isHair = day.kind === "hair";
  const focusVal = isHair ? day.type : day.focus;
  const focusBuf = useBufferedText(focusVal, (v) =>
    onEdit.onUpdateDayMeta(isHair ? { type: v } : { focus: v }),
  );
  const prefixBuf = useBufferedText(getFocusPrefix(state, category), (v) => onEdit.onSetFocusPrefix(v));
  const edited = isDayMetaEdited(state, category, dayIndex);
  const prefixEdited = isFocusPrefixEdited(state, category);

  return (
    <div className="day-header-edit">
      <div className="day-header-edit-row">
        <span>Tiêu đề ngày</span>
        {edited && <span className="step-edit-tag">đã đổi</span>}
      </div>
      <label>
        Tên ngày
        <input type="text" value={nameBuf.value} onChange={nameBuf.onChange}
          onFocus={nameBuf.onFocus} onBlur={nameBuf.onBlur} />
      </label>
      <label>
        {isHair ? "Loại ngày" : "Trọng tâm"}
        <input type="text" value={focusBuf.value} onChange={focusBuf.onChange}
          onFocus={focusBuf.onFocus} onBlur={focusBuf.onBlur} />
      </label>
      {category === "face" && (
        <label>
          Tiền tố nhãn (áp dụng cả mục)
          {prefixEdited && <span className="step-edit-tag">đã đổi</span>}
          <input type="text" value={prefixBuf.value} onChange={prefixBuf.onChange}
            onFocus={prefixBuf.onFocus} onBlur={prefixBuf.onBlur} />
        </label>
      )}
    </div>
  );
}

export default function DayPanel({
  category,
  state,
  dayIndex,
  onToggleStep,
  now = new Date(),
  editing = false,
  onEdit,
  justAddedId = null,
  openStepId = null,
}: {
  category: Category;
  state: AppState;
  dayIndex: number;
  onToggleStep: ToggleStep;
  now?: Date;
  editing?: boolean;
  onEdit?: DayEdit;
  justAddedId?: string | null;
  openStepId?: string | null;
}) {
  const nowIso = todayIso(now);
  const week = programWeek(state.programStartDate, nowIso);
  const day = resolveDayForState(state, category, dayIndex, week);
  const storedDay = getStoredDays(state, category)[dayIndex];
  const completedSteps = state.completedSteps;

  if (day.kind === "hair") {
    const c = editing
      ? { done: 0, total: 0 }
      : phaseCompletion(state, category, dayIndex, "steps", nowIso);
    const storedSteps = "steps" in storedDay ? storedDay.steps : [];
    return (
      <div className="panel active">
        {editing && onEdit && (
          <DayHeaderEdit
            state={state}
            category={category}
            dayIndex={dayIndex}
            day={day}
            onEdit={onEdit}
          />
        )}
        <div className="badge-row">
          <span className="badge focus">{day.full}</span>
          <span className="badge">{day.type}</span>
        </div>
        <Card title="Chăm tóc hôm nay" subtitle={day.type} done={c.done} total={c.total} editing={editing}>
          <PhaseBody
            phase="steps"
            resolvedSteps={day.steps}
            storedSteps={storedSteps}
            state={state}
            category={category}
            dayIndex={dayIndex}
            completedSteps={completedSteps}
            nowIso={nowIso}
            onToggleStep={onToggleStep}
            editing={editing}
            onEdit={onEdit}
            justAddedId={justAddedId}
            openStepId={openStepId}
          />
        </Card>
      </div>
    );
  }

  const copy = category === "body" ? PANEL_COPY.body : PANEL_COPY.face;
  const am = editing ? { done: 0, total: 0 } : phaseCompletion(state, category, dayIndex, "am", nowIso);
  const pm = editing ? { done: 0, total: 0 } : phaseCompletion(state, category, dayIndex, "pm", nowIso);
  const storedAm = "am" in storedDay ? storedDay.am : [];
  const storedPm = "pm" in storedDay ? storedDay.pm : [];
  return (
    <div className="panel active">
      {editing && onEdit && (
        <DayHeaderEdit
          state={state}
          category={category}
          dayIndex={dayIndex}
          day={day}
          onEdit={onEdit}
        />
      )}
      <div className="badge-row">
        <span className="badge focus">{day.full}</span>
        <span className="badge">
          {getFocusPrefix(state, category)}
          {day.focus}
        </span>
      </div>
      <Card
        className="am"
        title={copy.am.title}
        subtitle={copy.am.subtitle}
        done={am.done}
        total={am.total}
        editing={editing}
      >
        <PhaseBody
          phase="am"
          resolvedSteps={day.am}
          storedSteps={storedAm}
          state={state}
          category={category}
          dayIndex={dayIndex}
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
          editing={editing}
          onEdit={onEdit}
          justAddedId={justAddedId}
          openStepId={openStepId}
        />
      </Card>
      <Card
        className="pm"
        title={copy.pm.title}
        subtitle={copy.pm.subtitle}
        done={pm.done}
        total={pm.total}
        editing={editing}
      >
        <PhaseBody
          phase="pm"
          resolvedSteps={day.pm}
          storedSteps={storedPm}
          state={state}
          category={category}
          dayIndex={dayIndex}
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
          editing={editing}
          onEdit={onEdit}
          justAddedId={justAddedId}
          openStepId={openStepId}
        />
      </Card>
    </div>
  );
}
