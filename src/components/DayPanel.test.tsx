import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DayPanel from "./DayPanel";
import { makeDefaultState } from "../shared/defaults";
import { addStep, getStoredDays, stepId, updateStepTuple } from "../shared/content";
import { routine } from "../shared/routine";
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
    const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(), onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn() };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull(); // no "2/5" badge
    const toggles = screen.getAllByRole("button", { name: /sửa bước/i });
    expect(toggles.length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: /thêm bước/i })[0]);
    expect(onEdit.onAddStep).toHaveBeenCalledWith("am");
  });

  it("marks an overridden step as modified in edit mode", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const id = stepId("face", 2, "am", 0);
    const state = updateStepTuple(base, "face", 2, "am", id, "Sản phẩm tuỳ chỉnh", "");
    const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(), onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn() };
    render(<DayPanel category="face" state={state} dayIndex={2} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    expect(screen.getByText("đã đổi")).toBeInTheDocument();
  });

  it("opens and focuses the row whose id === justAddedId", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    // hand-build an override with one added step so its id is deterministic
    const withStep = addStep(base, "face", 0, "am");
    const day = withStep.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    const newId = day.am[day.am.length - 1].id;
    const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(), onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn() };
    render(<DayPanel category="face" state={withStep} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} justAddedId={newId} />);
    expect(screen.getAllByLabelText("Sản phẩm").length).toBeGreaterThan(0); // a row is expanded
    // the added row's first product field has focus
    const added = screen.getAllByLabelText("Sản phẩm");
    expect(added.some((el) => el === document.activeElement)).toBe(true);
  });

  it("edit mode renders a drag handle per step; ArrowDown on the first calls onReorderStep", async () => {
    const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const onEdit = {
      onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(),
      onSetVariant: vi.fn(), onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn(),
    };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    const handles = screen.getAllByRole("button", { name: /sắp xếp bước/ });
    expect(handles.length).toBeGreaterThan(1);
    handles[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onEdit.onReorderStep).toHaveBeenCalledWith("am", 0, 1);
  });

  it("edit mode shows the day-header block; blurring the name input calls onUpdateDayMeta", async () => {
    const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const onEdit = {
      onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(),
      onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn(),
    };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    const nameInput = screen.getByLabelText("Tên ngày");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Thứ Hai BHA");
    expect(onEdit.onUpdateDayMeta).not.toHaveBeenCalled(); // buffered
    await userEvent.tab();
    expect(onEdit.onUpdateDayMeta).toHaveBeenCalledWith({ full: "Thứ Hai BHA" });
  });

  it("the face badge uses getFocusPrefix from the override", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const state = { ...base, overrides: { face: {
      products: [...routine.face.products],
      days: getStoredDays(base, "face"),
      focusPrefix: "Tối nay xoáy vào: ",
    } } };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW} />);
    expect(screen.getByText(/Tối nay xoáy vào:/)).toBeInTheDocument();
  });

  it("read mode shows no day-header inputs", () => {
    const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW} />);
    expect(screen.queryByLabelText("Tên ngày")).toBeNull();
  });

  it("edit mode: removing a step calls onRemoveStep with (phase, id)", async () => {
    const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(), onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn() };
    render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: /xoá bước/i })[0]);
    expect(onEdit.onRemoveStep).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onEdit.onRemoveStep).toHaveBeenCalledWith("am", "face.0.am.0");
  });
});
