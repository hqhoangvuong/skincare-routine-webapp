import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Gallery from "./Gallery";

describe("Gallery", () => {
  it("renders a plain list when not editing", () => {
    render(<Gallery products={["A", "B"]} />);
    const g = screen.getByTestId("gallery");
    expect(within(g).getByText("A")).toBeInTheDocument();
    expect(within(g).queryByRole("textbox")).toBeNull();
  });

  it("renders an input + remove per product and an add button when editing", async () => {
    const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
    render(<Gallery products={["Cleanser", "Toner"]} editing onEdit={onEdit} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("Cleanser");
    expect(screen.getByRole("textbox", { name: "Tên sản phẩm 1" })).toBe(inputs[0]);

    // the remove button names the product it removes when the name is non-empty
    await userEvent.click(screen.getByRole("button", { name: "Xoá Cleanser" }));
    expect(onEdit.onRemove).toHaveBeenCalledWith(0);

    await userEvent.click(screen.getByRole("button", { name: /thêm sản phẩm/i }));
    expect(onEdit.onAdd).toHaveBeenCalled();
  });

  it("buffers product edits — onRename fires once on blur, not per keystroke", async () => {
    const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
    render(<Gallery products={["Toner"]} editing onEdit={onEdit} />);
    const input = screen.getByRole("textbox", { name: "Tên sản phẩm 1" });
    await userEvent.type(input, "!");
    expect(onEdit.onRename).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onEdit.onRename).toHaveBeenCalledTimes(1);
    expect(onEdit.onRename).toHaveBeenCalledWith(0, "Toner!");
  });

  it("shows a placeholder and a positional remove label for an empty product name", () => {
    render(<Gallery products={[""]} editing onEdit={{ onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() }} />);
    expect(screen.getByPlaceholderText("Sản phẩm chưa đặt tên")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xoá sản phẩm 1" })).toBeInTheDocument();
  });
});
