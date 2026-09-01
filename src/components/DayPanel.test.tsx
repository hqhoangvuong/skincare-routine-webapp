import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DayPanel from "./DayPanel";

const WEEK1_NOW = new Date("2026-08-26T03:00:00Z"); // Wednesday, program week 1
const WEEK3_NOW = new Date("2026-09-09T03:00:00Z"); // Wednesday, program week 3
const START = "2026-08-24";

function renderPanel(overrides: Partial<ComponentProps<typeof DayPanel>> = {}) {
  const onToggleStep = vi.fn();
  render(
    <DayPanel
      category="face"
      dayIndex={2}
      programStartDate={START}
      completedSteps={[]}
      onToggleStep={onToggleStep}
      now={WEEK1_NOW}
      {...overrides}
    />,
  );
  return { onToggleStep };
}

describe("DayPanel", () => {
  it("shows Vitamin C on Wednesday AM in week 1 and Niacinamide in week 3", () => {
    const { unmount } = render(
      <DayPanel category="face" dayIndex={2} programStartDate={START} completedSteps={[]} onToggleStep={() => {}} now={WEEK1_NOW} />,
    );
    expect(screen.getByText("Serum Vitamin C — Cocoon Nghệ C22")).toBeInTheDocument();
    unmount();
    render(
      <DayPanel category="face" dayIndex={2} programStartDate={START} completedSteps={[]} onToggleStep={() => {}} now={WEEK3_NOW} />,
    );
    expect(screen.getByText("Serum Niacinamide 15% — Cocoon")).toBeInTheDocument();
  });

  it("renders a checkbox per step and calls onToggleStep with the slot", async () => {
    const { onToggleStep } = renderPanel();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    await userEvent.click(boxes[0]);
    expect(onToggleStep).toHaveBeenCalledWith("face", 2, "am", 0);
  });

  it("reflects completedSteps as checked and counts them per card", () => {
    renderPanel({
      completedSteps: [
        { date: "2026-08-26", category: "face", phase: "am", stepIndex: 0 },
        { date: "2026-08-26", category: "face", phase: "am", stepIndex: 1 },
      ],
    });
    const amCard = document.querySelector(".card.am");
    if (!(amCard instanceof HTMLElement)) throw new Error("expected an AM card");
    expect(within(amCard).getByText("2/5")).toBeInTheDocument();
    const amBoxes = within(amCard).getAllByRole("checkbox");
    expect(amBoxes[0]).toBeChecked();
    expect(amBoxes[2]).not.toBeChecked();
  });

  it("renders one card and a flat checkbox list for a hair day", () => {
    render(
      <DayPanel category="hair" dayIndex={0} programStartDate={START} completedSteps={[]} onToggleStep={() => {}} now={new Date("2026-08-24T03:00:00Z")} />,
    );
    expect(document.querySelector(".card.am")).toBeNull();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });
});
