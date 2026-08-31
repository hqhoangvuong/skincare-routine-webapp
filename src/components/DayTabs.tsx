import type { DayData } from "../shared/types";

export default function DayTabs({
  days,
  activeDay,
  onSelect,
}: {
  days: DayData[];
  activeDay: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {days.map((day, index) => (
        <button
          key={day.short}
          type="button"
          role="tab"
          aria-selected={index === activeDay}
          className={`tab${index === activeDay ? " active" : ""}`}
          onClick={() => onSelect(index)}
        >
          {day.short}
          {/* Last word only: the source renders day.full.split(" ").pop(),
              so "Thứ Hai" shows as "Hai" and "Chủ Nhật" as "Nhật". */}
          <span className="d">{day.full.split(" ").pop()}</span>
        </button>
      ))}
    </div>
  );
}
