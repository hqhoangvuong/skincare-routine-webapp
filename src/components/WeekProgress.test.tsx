import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WeekProgress from "./WeekProgress";

const START = "2026-08-24"; // Monday, week 1
const WED_WEEK1 = new Date("2026-08-26T03:00:00Z");

describe("WeekProgress", () => {
  it("shows the current program week", () => {
    render(<WeekProgress category="face" programStartDate={START} completedSteps={[]} now={WED_WEEK1} />);
    expect(screen.getByText("Tuần 1")).toBeInTheDocument();
    // 5 weeks later
    render(
      <WeekProgress
        category="face"
        programStartDate={START}
        completedSteps={[]}
        now={new Date("2026-09-30T03:00:00Z")}
      />,
    );
    expect(screen.getByText("Tuần 6")).toBeInTheDocument();
  });

  it("renders seven day markers and marks a fully-done day", () => {
    // hair Tuesday (dayIndex 1) has exactly 2 steps; tick both for that week's Tuesday date
    const tueDate = "2026-08-25";
    const completedSteps = [
      { date: tueDate, category: "hair" as const, phase: "steps" as const, stepIndex: 0 },
      { date: tueDate, category: "hair" as const, phase: "steps" as const, stepIndex: 1 },
    ];
    render(
      <WeekProgress category="hair" programStartDate={START} completedSteps={completedSteps} now={WED_WEEK1} />,
    );
    const markers = screen.getAllByRole("listitem");
    expect(markers).toHaveLength(7);
    expect(markers[1].className).toContain("is-full"); // Tuesday
    expect(markers[0].className).toContain("is-empty"); // Monday
  });

  it("marks today's column", () => {
    render(<WeekProgress category="face" programStartDate={START} completedSteps={[]} now={WED_WEEK1} />);
    const markers = screen.getAllByRole("listitem");
    expect(markers[2].className).toContain("is-today"); // Wednesday
  });
});
