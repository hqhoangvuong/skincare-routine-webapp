import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CustomizationsStrip from "./CustomizationsStrip";
import { makeDefaultState } from "../shared/defaults";
import { addStep, stepId, updateStepTuple } from "../shared/content";

const start = new Date("2026-08-24T00:00:00Z");

describe("CustomizationsStrip", () => {
  it("counts modified and added steps", () => {
    let s = makeDefaultState(start);
    s = updateStepTuple(s, "face", 2, "am", stepId("face", 2, "am", 0), "Đổi 1", "");
    s = updateStepTuple(s, "face", 3, "pm", stepId("face", 3, "pm", 0), "Đổi 2", "");
    s = addStep(s, "face", 0, "am");
    render(<CustomizationsStrip state={s} category="face" onJump={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/2 bước đã đổi/)).toBeInTheDocument();
    expect(screen.getByText(/1 bước mới/)).toBeInTheDocument();
  });

  it("expands to jump links that call onJump(dayIndex, stepId)", async () => {
    let s = makeDefaultState(start);
    const id = stepId("face", 4, "pm", 0);
    s = updateStepTuple(s, "face", 4, "pm", id, "Đổi", "");
    const onJump = vi.fn();
    render(<CustomizationsStrip state={s} category="face" onJump={onJump} onReset={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /xem chi tiết/i }));
    await userEvent.click(screen.getByRole("button", { name: /T6 · Tối · Đổi/ }));
    expect(onJump).toHaveBeenCalledWith(4, id);
  });

  it("Đặt lại calls onReset", async () => {
    let s = makeDefaultState(start);
    s = updateStepTuple(s, "face", 0, "am", stepId("face", 0, "am", 0), "x", "");
    const onReset = vi.fn();
    render(<CustomizationsStrip state={s} category="face" onJump={vi.fn()} onReset={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
