import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WeekProgress from "./WeekProgress";
import { makeDefaultState } from "../shared/defaults";
import { stepId } from "../shared/content";
import type { AppState } from "../shared/types";

const START = "2026-08-24"; // Monday, week 1
const WED_WEEK1 = new Date("2026-08-26T03:00:00Z");

function stateWithCompleted(completedSteps: AppState["completedSteps"] = []): AppState {
  return { ...makeDefaultState(new Date("2026-08-24T00:00:00Z")), programStartDate: START, completedSteps };
}

describe("WeekProgress", () => {
  it("shows the current program week", () => {
    render(<WeekProgress category="face" state={stateWithCompleted()} now={WED_WEEK1} />);
    expect(screen.getByText("Tuần 1")).toBeInTheDocument();
    // 5 weeks later
    render(
      <WeekProgress category="face" state={stateWithCompleted()} now={new Date("2026-09-30T03:00:00Z")} />,
    );
    expect(screen.getByText("Tuần 6")).toBeInTheDocument();
  });

  it("renders seven day markers and marks a fully-done day", () => {
    // hair Tuesday (dayIndex 1) has exactly 2 steps; tick both for that week's Tuesday date
    const tueDate = "2026-08-25";
    const state = stateWithCompleted([
      { date: tueDate, category: "hair", stepId: stepId("hair", 1, "steps", 0) },
      { date: tueDate, category: "hair", stepId: stepId("hair", 1, "steps", 1) },
    ]);
    render(<WeekProgress category="hair" state={state} now={WED_WEEK1} />);
    const markers = screen.getAllByRole("listitem");
    expect(markers).toHaveLength(7);
    expect(markers[1].className).toContain("is-full"); // Tuesday
    expect(markers[0].className).toContain("is-empty"); // Monday
  });

  it("marks a day with only some steps checked as partial", () => {
    // hair Tuesday (dayIndex 1) has 2 steps; tick only one for that week's Tuesday
    const state = stateWithCompleted([
      { date: "2026-08-25", category: "hair", stepId: stepId("hair", 1, "steps", 0) },
    ]);
    render(<WeekProgress category="hair" state={state} now={WED_WEEK1} />);
    const markers = screen.getAllByRole("listitem");
    expect(markers[1].className).toContain("is-partial"); // Tuesday
    expect(markers[1].className).not.toContain("is-full");
  });

  it("marks today's column", () => {
    render(<WeekProgress category="face" state={stateWithCompleted()} now={WED_WEEK1} />);
    const markers = screen.getAllByRole("listitem");
    expect(markers[2].className).toContain("is-today"); // Wednesday
  });
});
