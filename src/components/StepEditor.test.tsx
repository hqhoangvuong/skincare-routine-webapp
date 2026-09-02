import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StepEditor from "./StepEditor";

const display = { id: "face.0.am.0", product: "Toner Cocoon Sen", note: "" };

describe("StepEditor", () => {
  it("is collapsed by default and expands on tap", async () => {
    render(<StepEditor display={display} raw={["Toner Cocoon Sen", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("Toner Cocoon Sen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sản phẩm")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /sửa bước/i }));
    expect(screen.getByLabelText("Sản phẩm")).toHaveValue("Toner Cocoon Sen");
  });

  it("shows a placeholder label for an empty product", () => {
    render(<StepEditor display={{ id: "x", product: "", note: "" }} raw={["", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("Bước chưa đặt tên")).toBeInTheDocument();
  });

  it("routes a plain edit to onUpdateTuple and a kind switch to onSetVariant", async () => {
    const onUpdateTuple = vi.fn();
    const onSetVariant = vi.fn();
    render(<StepEditor display={display} raw={["Toner Cocoon Sen", ""]}
      onUpdateTuple={onUpdateTuple} onSetVariant={onSetVariant} onRemove={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /sửa bước/i }));
    await userEvent.type(screen.getByLabelText("Sản phẩm"), "!");
    expect(onUpdateTuple).not.toHaveBeenCalled(); // buffered — commits on blur
    await userEvent.tab();
    expect(onUpdateTuple).toHaveBeenLastCalledWith("Toner Cocoon Sen!", "");
    await userEvent.selectOptions(screen.getByLabelText("Kiểu đổi theo tuần"), "cycle");
    expect(onSetVariant).toHaveBeenCalledWith({
      kind: "cycle", length: 2, weeks: [["Toner Cocoon Sen", ""], ["Toner Cocoon Sen", ""]],
    });
  });

  it("calls onRemove", async () => {
    const onRemove = vi.fn();
    render(<StepEditor display={display} raw={["Toner Cocoon Sen", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: /xoá bước/i }));
    expect(onRemove).toHaveBeenCalled();
  });
});
