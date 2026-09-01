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
    const next = last(onChange);
    if (Array.isArray(next) || next.kind !== "threshold") throw new Error("expected threshold");
    expect(next.before).toEqual(["A", ""]);
    expect(next.from[0]).toBe("B!");
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
