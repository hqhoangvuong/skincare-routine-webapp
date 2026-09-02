import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DayPanel from "./DayPanel";
import { makeDefaultState } from "../shared/defaults";
import { stepId, updateStepTuple } from "../shared/content";
import type { AppState } from "../shared/types";

const WEEK1_NOW = new Date("2026-08-26T03:00:00Z"); // Wednesday, program week 1
const WEEK3_NOW = new Date("2026-09-09T03:00:00Z"); // Wednesday, program week 3
const START = "2026-08-24";

function stateWithCompleted(completedSteps: AppState["completedSteps"] = []): AppState {
  return { ...makeDefaultState(new Date("2026-08-24T00:00:00Z")), programStartDate: START, completedSteps };
}

function renderPanel(overrides: Partial<ComponentProps<typeof DayPanel>> = {}) {
  const onToggleStep = vi.fn();
  render(
    <DayPanel
      category="face"
      dayIndex={2}
      state={stateWithCompleted()}
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
      <DayPanel category="face" dayIndex={2} state={stateWithCompleted()} onToggleStep={() => {}} now={WEEK1_NOW} />,
    );
    expect(screen.getByText("Serum Vitamin C — Cocoon Nghệ C22")).toBeInTheDocument();
    unmount();
    render(
      <DayPanel category="face" dayIndex={2} state={stateWithCompleted()} onToggleStep={() => {}} now={WEEK3_NOW} />,
    );
    expect(screen.getByText("Serum Niacinamide 15% — Cocoon")).toBeInTheDocument();
  });

  it("gives each step checkbox an accessible name from its product", () => {
    render(
      <DayPanel category="face" dayIndex={2} state={stateWithCompleted()} onToggleStep={() => {}} now={WEEK3_NOW} />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Serum Niacinamide 15% — Cocoon" }),
    ).toBeInTheDocument();
  });

  it("read mode renders overridden product content, not the shipped default", () => {
    const overridden = updateStepTuple(
      stateWithCompleted(), "face", 2, "am", stepId("face", 2, "am", 0),
      "Sữa rửa mặt tuỳ chỉnh", "",
    );
    render(
      <DayPanel category="face" dayIndex={2} state={overridden} onToggleStep={() => {}} now={WEEK1_NOW} />,
    );
    expect(screen.getByText("Sữa rửa mặt tuỳ chỉnh")).toBeInTheDocument();
    expect(screen.queryByText("Rửa mặt nhẹ bằng nước ấm")).toBeNull();
  });

  it("renders a checkbox per step and calls onToggleStep with the slot", async () => {
    const { onToggleStep } = renderPanel();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    await userEvent.click(boxes[0]);
    expect(onToggleStep).toHaveBeenCalledWith("face", 2, "face.2.am.0");
  });

  it("reflects completedSteps as checked and counts them per card", () => {
    renderPanel({
      state: stateWithCompleted([
        { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 0) },
        { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 1) },
      ]),
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
      <DayPanel
        category="hair"
        dayIndex={0}
        state={stateWithCompleted()}
        onToggleStep={() => {}}
        now={new Date("2026-08-24T03:00:00Z")}
      />,
    );
    expect(document.querySelector(".card.am")).toBeNull();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("edit mode: renders StepEditor rows, hides the count badge, shows add-step", async () => {
    const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn() };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull(); // no "2/5" badge
    const toggles = screen.getAllByRole("button", { name: /sửa bước/i });
    expect(toggles.length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: /thêm bước/i })[0]);
    expect(onEdit.onAddStep).toHaveBeenCalledWith("am");
  });

  it("edit mode: removing a step calls onRemoveStep with (phase, id)", async () => {
    const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn() };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: /xoá bước/i })[0]);
    expect(onEdit.onRemoveStep).toHaveBeenCalledWith("am", "face.0.am.0");
  });
});
