import type { ReactNode } from "react";
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { programWeek, todayIso } from "../shared/date";
import { isStepDone, phaseCompletion } from "../shared/progress";
import { resolveDay } from "../shared/schedule";
import { isHairDay, type Category, type CompletedStep, type StepPhase, type StepTuple } from "../shared/types";

type ToggleStep = (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void;

function Steps({
  steps,
  category,
  dayIndex,
  phase,
  completedSteps,
  nowIso,
  onToggleStep,
}: {
  steps: StepTuple[];
  category: Category;
  dayIndex: number;
  phase: StepPhase;
  completedSteps: CompletedStep[];
  nowIso: string;
  onToggleStep: ToggleStep;
}) {
  return (
    <ul className="steps">
      {steps.map(([product, note], index) => {
        const checked = isStepDone(completedSteps, category, dayIndex, phase, index, nowIso);
        return (
          <li key={`${product}-${index}`}>
            <label className="step-check">
              <input
                type="checkbox"
                aria-label={product}
                checked={checked}
                onChange={() => onToggleStep(category, dayIndex, phase, index)}
              />
              <span className="step-check-box" aria-hidden="true" />
            </label>
            <div className="icon-badge">
              <Icon icon={pickIcon(product)} />
            </div>
            <div>
              <strong>{product}</strong>
              {note ? <span className="note">{note}</span> : null}
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
  dayIndex,
  programStartDate,
  completedSteps,
  onToggleStep,
  now = new Date(),
}: {
  category: Category;
  dayIndex: number;
  programStartDate: string;
  completedSteps: CompletedStep[];
  onToggleStep: ToggleStep;
  now?: Date;
}) {
  const nowIso = todayIso(now);
  const week = programWeek(programStartDate, nowIso);
  const day = resolveDay(category, dayIndex, week);

  if (isHairDay(day)) {
    const c = phaseCompletion(completedSteps, programStartDate, category, dayIndex, "steps", nowIso);
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
            phase="steps"
            completedSteps={completedSteps}
            nowIso={nowIso}
            onToggleStep={onToggleStep}
          />
        </Card>
      </div>
    );
  }

  const copy = category === "body" ? PANEL_COPY.body : PANEL_COPY.face;
  const am = phaseCompletion(completedSteps, programStartDate, category, dayIndex, "am", nowIso);
  const pm = phaseCompletion(completedSteps, programStartDate, category, dayIndex, "pm", nowIso);
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
          phase="am"
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
          phase="pm"
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
        />
      </Card>
    </div>
  );
}
