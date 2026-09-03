import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VariantEditor from "./VariantEditor";
import type { RoutineStep } from "../shared/types";

function last(mock: ReturnType<typeof vi.fn>): RoutineStep {
  return mock.mock.calls[mock.mock.calls.length - 1][0];
}

describe("VariantEditor", () => {
  it("plain: edits product/note, emits a tuple", async () => {
    const onChange = vi.fn();
    render(<VariantEditor value={["Toner", "am note"]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Sản phẩm"), "!");
    expect(onChange).not.toHaveBeenCalled(); // buffered — no commit while typing
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange)).toEqual(["Toner!", "am note"]);
  });

  it("switches plain -> threshold carrying the tuple into both branches", async () => {
    const onChange = vi.fn();
    render(<VariantEditor value={["Serum", "n"]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Kiểu đổi theo tuần"), "threshold");
    expect(last(onChange)).toEqual({
      kind: "threshold", untilWeek: 2, before: ["Serum", "n"], from: ["Serum", "n"],
    });
  });

  it("threshold: editing the 'from' branch keeps 'before' intact", async () => {
    const value: RoutineStep = { kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""] };
    const onChange = vi.fn();
    render(<VariantEditor value={value} onChange={onChange} />);
    const fromProduct = screen.getByLabelText("Sản phẩm — từ tuần 3");
    await userEvent.type(fromProduct, "!");
    expect(onChange).not.toHaveBeenCalled(); // buffered — no commit while typing
    await userEvent.tab();
    const next = last(onChange);
    if (Array.isArray(next) || next.kind !== "threshold") throw new Error("expected threshold");
    expect(next.before).toEqual(["A", ""]);
    expect(next.from[0]).toBe("B!");
  });

  it("threshold: untilWeek is coerced to the parent only on blur, not per keystroke", async () => {
    const value: RoutineStep = { kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""] };
    const onChange = vi.fn();
    render(<VariantEditor value={value} onChange={onChange} />);
    const week = screen.getByLabelText("Đổi từ tuần thứ");
    await userEvent.clear(week);
    await userEvent.type(week, "3");
    expect(week).toHaveValue(3);
    expect(onChange).not.toHaveBeenCalled(); // no snap-to-2 while typing/clearing
    await userEvent.tab(); // blur commits
    expect(last(onChange)).toEqual({
      kind: "threshold", untilWeek: 3, before: ["A", ""], from: ["B", ""],
    });
  });

  it("switches plain -> threshold without aliasing the tuple across branches", async () => {
    const onChange = vi.fn();
    render(<VariantEditor value={["Serum", "n"]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Kiểu đổi theo tuần"), "threshold");
    const next = last(onChange);
    if (Array.isArray(next) || next.kind !== "threshold") throw new Error("expected threshold");
    expect(next.before).not.toBe(next.from); // distinct array objects
    expect(next.before).toEqual(next.from);
  });

  it("autoFocusFirst focuses the first product field on mount", () => {
    render(<VariantEditor value={["Toner", ""]} onChange={vi.fn()} autoFocusFirst />);
    expect(screen.getByLabelText("Sản phẩm")).toHaveFocus();
  });

  it("puts list={datalistId} on the product input and not on the note input", () => {
    render(<VariantEditor value={["Toner", "n"]} onChange={vi.fn()} datalistId="shelf-face" shelfNames={["Toner"]} />);
    expect(screen.getByLabelText("Sản phẩm")).toHaveAttribute("list", "shelf-face");
    expect(screen.getByLabelText("Ghi chú")).not.toHaveAttribute("list");
  });

  it("shows the add-to-shelf button only for text not already on the shelf, and calls onAddToShelf trimmed", async () => {
    const onAddToShelf = vi.fn();
    render(
      <VariantEditor
        value={["Toner Cocoon Sen", ""]}
        onChange={vi.fn()}
        datalistId="shelf-face"
        shelfNames={["Toner Cocoon Sen"]}
        onAddToShelf={onAddToShelf}
      />,
    );
    // on-shelf text -> no button
    expect(screen.queryByRole("button", { name: /vào kệ/ })).toBeNull();
    // type an off-shelf name
    const input = screen.getByLabelText("Sản phẩm");
    await userEvent.clear(input);
    await userEvent.type(input, "  Kem chống nắng SPF 50  ");
    const addBtn = screen.getByRole("button", { name: 'Thêm "Kem chống nắng SPF 50" vào kệ' });
    await userEvent.click(addBtn);
    expect(onAddToShelf).toHaveBeenCalledWith("Kem chống nắng SPF 50");
  });

  it("offers add-to-shelf on a threshold branch field too", async () => {
    const value: RoutineStep = { kind: "threshold", untilWeek: 2, before: ["X", ""], from: ["Y", ""] };
    render(
      <VariantEditor value={value} onChange={vi.fn()} datalistId="shelf-face" shelfNames={[]} onAddToShelf={vi.fn()} />,
    );
    expect(screen.getAllByRole("button", { name: /vào kệ/ }).length).toBeGreaterThanOrEqual(2);
  });

  it("cycle: switching length 2 -> 4 pads weeks to 4", async () => {
    const value: RoutineStep = { kind: "cycle", length: 2, weeks: [["A", ""], ["B", ""]] };
    const onChange = vi.fn();
    render(<VariantEditor value={value} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Số tuần trong chu kỳ"), "4");
    const next = last(onChange);
    if (Array.isArray(next) || next.kind !== "cycle") throw new Error("expected cycle");
    expect(next.length).toBe(4);
    expect(next.weeks).toHaveLength(4);
    expect(next.weeks[0]).toEqual(["A", ""]);
    expect(next.weeks[2]).toEqual(["", ""]);
  });
});
