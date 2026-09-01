import type { ReactNode } from "react";
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { programWeek, todayIso } from "../shared/date";
import { isStepDone, phaseCompletion } from "../shared/progress";
import { resolveDayForState, type ResolvedStep } from "../shared/content";
import type { AppState, Category } from "../shared/types";

type ToggleStep = (category: Category, dayIndex: number, stepId: string) => void;

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

function Card({
  className,
  title,
  subtitle,
  done,
  total,
  children,
}: {
  className?: string;
  title: string;
  subtitle: string;
  done: number;
  total: number;
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
        <span className="card-progress">{`${done}/${total}`}</span>
      </div>
      {children}
    </div>
  );
}

const PANEL_COPY: Record<
  "face" | "body",
  { badgePrefix: string; am: { title: string; subtitle: string }; pm: { title: string; subtitle: string } }
> = {
  face: {
    badgePrefix: "Trọng tâm tối nay: ",
    am: { title: "Buổi sáng", subtitle: "Chăm da ban ngày" },
    pm: { title: "Buổi tối", subtitle: "Chăm da ban đêm" },
  },
  body: {
    badgePrefix: "",
    am: { title: "Sau khi tắm", subtitle: "Chăm thể ban ngày" },
    pm: { title: "Trước khi ngủ", subtitle: "Chăm thể ban đêm" },
  },
};

export default function DayPanel({
  category,
  state,
  dayIndex,
  onToggleStep,
  now = new Date(),
}: {
  category: Category;
  state: AppState;
  dayIndex: number;
  onToggleStep: ToggleStep;
  now?: Date;
}) {
  const nowIso = todayIso(now);
  const week = programWeek(state.programStartDate, nowIso);
  const day = resolveDayForState(state, category, dayIndex, week);
  const completedSteps = state.completedSteps;

  if (day.kind === "hair") {
    const c = phaseCompletion(state, category, dayIndex, "steps", nowIso);
    return (
      <div className="panel active">
        <div className="badge-row">
          <span className="badge focus">{day.full}</span>
          <span className="badge">{day.type}</span>
        </div>
        <Card title="Chăm tóc hôm nay" subtitle={day.type} done={c.done} total={c.total}>
          <Steps
            steps={day.steps}
            category={category}
            dayIndex={dayIndex}
            completedSteps={completedSteps}
            nowIso={nowIso}
            onToggleStep={onToggleStep}
          />
        </Card>
      </div>
    );
  }

  const copy = category === "body" ? PANEL_COPY.body : PANEL_COPY.face;
  const am = phaseCompletion(state, category, dayIndex, "am", nowIso);
  const pm = phaseCompletion(state, category, dayIndex, "pm", nowIso);
  return (
    <div className="panel active">
      <div className="badge-row">
        <span className="badge focus">{day.full}</span>
        <span className="badge">
          {copy.badgePrefix}
          {day.focus}
        </span>
      </div>
      <Card className="am" title={copy.am.title} subtitle={copy.am.subtitle} done={am.done} total={am.total}>
        <Steps
          steps={day.am}
          category={category}
          dayIndex={dayIndex}
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
        />
      </Card>
      <Card className="pm" title={copy.pm.title} subtitle={copy.pm.subtitle} done={pm.done} total={pm.total}>
        <Steps
          steps={day.pm}
          category={category}
          dayIndex={dayIndex}
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
        />
      </Card>
    </div>
  );
}
