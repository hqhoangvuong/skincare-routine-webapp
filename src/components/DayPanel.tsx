import type { ReactNode } from "react";
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { isHairDay, type Category, type DayData, type StepTuple } from "../shared/types";

function Steps({ steps }: { steps: StepTuple[] }) {
  return (
    <ul className="steps">
      {steps.map(([product, note], index) => (
        <li key={`${product}-${index}`}>
          <div className="icon-badge">
            <Icon icon={pickIcon(product)} />
          </div>
          <div>
            <strong>{product}</strong>
            {note ? <span className="note">{note}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Card({
  className,
  title,
  subtitle,
  children,
}: {
  className?: string;
  title: string;
  subtitle: string;
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
      </div>
      {children}
    </div>
  );
}

const PANEL_COPY: Record<
  "face" | "body",
  {
    badgePrefix: string;
    am: { title: string; subtitle: string };
    pm: { title: string; subtitle: string };
  }
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

export default function DayPanel({ day, category }: { day: DayData; category: Category }) {
  if (isHairDay(day)) {
    return (
      <div className="panel active">
        <div className="badge-row">
          <span className="badge focus">{day.full}</span>
          <span className="badge">{day.type}</span>
        </div>
        <Card title="Chăm tóc hôm nay" subtitle={day.type}>
          <Steps steps={day.steps} />
        </Card>
      </div>
    );
  }

  const copy = category === "body" ? PANEL_COPY.body : PANEL_COPY.face;
  return (
    <div className="panel active">
      <div className="badge-row">
        <span className="badge focus">{day.full}</span>
        <span className="badge">
          {copy.badgePrefix}
          {day.focus}
        </span>
      </div>
      <Card className="am" title={copy.am.title} subtitle={copy.am.subtitle}>
        <Steps steps={day.am} />
      </Card>
      <Card className="pm" title={copy.pm.title} subtitle={copy.pm.subtitle}>
        <Steps steps={day.pm} />
      </Card>
    </div>
  );
}
