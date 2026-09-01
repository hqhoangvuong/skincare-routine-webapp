import { programWeek, todayIso, weekdayIndex } from "../shared/date";
import { dayCompletion } from "../shared/progress";
import type { AppState, Category } from "../shared/types";

const DAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function WeekProgress({
  category,
  state,
  now = new Date(),
}: {
  category: Category;
  state: AppState;
  now?: Date;
}) {
  const nowIso = todayIso(now);
  const week = programWeek(state.programStartDate, nowIso);
  const today = weekdayIndex(now);

  return (
    <div className="week-progress" role="group" aria-label={`Tiến độ tuần ${week}`}>
      <span className="week-progress-label">Tuần {week}</span>
      <ol className="week-progress-track">
        {DAY_SHORT.map((short, index) => {
          const { done, total } = dayCompletion(state, category, index, nowIso);
          const fill =
            total > 0 && done >= total ? "is-full" : done > 0 ? "is-partial" : "is-empty";
          return (
            <li
              key={short}
              className={`week-progress-marker ${fill}${index === today ? " is-today" : ""}`}
            >
              <span aria-hidden="true">{short}</span>
              <span className="visually-hidden">{`${short}: ${done}/${total}`}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
