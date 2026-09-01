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

    await userEvent.type(inputs[1], "!");
    expect(onEdit.onRename).toHaveBeenLastCalledWith(1, "Toner!");

    await userEvent.click(screen.getAllByRole("button", { name: /xoá sản phẩm/i })[0]);
    expect(onEdit.onRemove).toHaveBeenCalledWith(0);

    await userEvent.click(screen.getByRole("button", { name: /thêm sản phẩm/i }));
    expect(onEdit.onAdd).toHaveBeenCalled();
  });

  it("shows a placeholder for an empty product name", () => {
    render(<Gallery products={[""]} editing onEdit={{ onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() }} />);
    expect(screen.getByPlaceholderText("Sản phẩm chưa đặt tên")).toBeInTheDocument();
  });
});
