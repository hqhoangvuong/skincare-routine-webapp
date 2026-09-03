import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Gallery from "./Gallery";
import { makeDefaultState } from "../shared/defaults";

describe("Gallery", () => {
  it("renders a plain list when not editing", () => {
    render(<Gallery products={["A", "B"]} />);
    const g = screen.getByTestId("gallery");
    expect(within(g).getByText("A")).toBeInTheDocument();
    expect(within(g).queryByRole("textbox")).toBeNull();
  });

  it("renders an input + remove per product and an add button when editing", async () => {
    const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onJump: vi.fn() };
    render(<Gallery products={["Cleanser", "Toner"]} editing onEdit={onEdit} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("Cleanser");
    expect(screen.getByRole("textbox", { name: "Tên sản phẩm 1" })).toBe(inputs[0]);

    // the remove button names the product it removes when the name is non-empty
    expect(screen.getByRole("button", { name: "Xoá Cleanser" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /thêm sản phẩm/i }));
    expect(onEdit.onAdd).toHaveBeenCalled();
  });

  it("removing a product needs two taps", async () => {
    const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onJump: vi.fn() };
    render(<Gallery products={["Cleanser"]} editing onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá Cleanser" }));
    expect(onEdit.onRemove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onEdit.onRemove).toHaveBeenCalledWith(0);
  });

  it("buffers product edits — onRename fires once on blur, not per keystroke", async () => {
    const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onJump: vi.fn() };
    render(<Gallery products={["Toner"]} editing onEdit={onEdit} />);
    const input = screen.getByRole("textbox", { name: "Tên sản phẩm 1" });
    await userEvent.type(input, "!");
    expect(onEdit.onRename).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onEdit.onRename).toHaveBeenCalledTimes(1);
    expect(onEdit.onRename).toHaveBeenCalledWith(0, "Toner!");
  });

  it("shows a placeholder and a positional remove label for an empty product name", () => {
    render(
      <Gallery
        products={[""]}
        editing
        onEdit={{ onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onJump: vi.fn() }}
      />,
    );
    expect(screen.getByPlaceholderText("Sản phẩm chưa đặt tên")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xoá sản phẩm 1" })).toBeInTheDocument();
  });

  const fullEdit = () => ({
    onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onJump: vi.fn(),
  });
  const start = new Date("2026-08-24T00:00:00Z");
  const isChip = (b: Element): boolean => /^(T[2-7]|CN) (Sáng|Tối|Chăm tóc)$/.test(b.textContent ?? "");

  it("lists the days/phases that use a shelf entry, with a jump button each", () => {
    const s = makeDefaultState(start);
    render(
      <Gallery products={["Tẩy trang Bioderma"]} state={s} category="face" editing onEdit={fullEdit()} />,
    );
    // "Tẩy trang Bioderma" is Monday PM step 0 (and other PM days)
    const chips = screen.getAllByRole("button").filter(isChip);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0]).toHaveTextContent("T2 Tối");
  });

  it("fires onJump with (dayIndex, stepId) when a usage chip is clicked", async () => {
    const s = makeDefaultState(start);
    const onEdit = fullEdit();
    render(<Gallery products={["Tẩy trang Bioderma"]} state={s} category="face" editing onEdit={onEdit} />);
    const chips = screen.getAllByRole("button").filter(isChip);
    await userEvent.click(chips[0]);
    expect(onEdit.onJump).toHaveBeenCalledWith(0, "face.0.pm.0");
  });

  it("shows the unused note for an entry no step names", () => {
    const s = makeDefaultState(start);
    render(<Gallery products={["Mặt nạ Wonjin / Histolab"]} state={s} category="face" editing onEdit={fullEdit()} />);
    expect(screen.getByText("⚠ Chưa dùng ở bước nào")).toBeInTheDocument();
  });

  it("ArrowDown on a product handle calls onMove(0, 1); the handle label has the arrow hint", async () => {
    const onEdit = fullEdit();
    render(
      <Gallery products={["A", "B", "C"]} state={makeDefaultState(start)} category="face" editing onEdit={onEdit} />,
    );
    const handle = screen.getByRole("button", { name: "Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp sản phẩm 1" });
    handle.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onEdit.onMove).toHaveBeenCalledWith(0, 1);
  });

  it("editable shelf is a ul/li list with the usage block inside each row", () => {
    const s = makeDefaultState(start);
    const { container } = render(
      <Gallery products={["Tẩy trang Bioderma"]} state={s} category="face" editing onEdit={fullEdit()} />,
    );
    const list = container.querySelector("ul.gallery-edit-list");
    expect(list).not.toBeNull();
    const li = list?.querySelector("li.prod.prod-edit");
    expect(li?.querySelector(".prod-edit-head")).not.toBeNull();
    expect(li?.querySelector(".prod-usage")).not.toBeNull(); // usage block is a CHILD of the li
  });

  it("sustained ArrowDown keeps moving the same product (no oscillation)", async () => {
    const calls: [number, number][] = [];
    function Host() {
      const [items, setItems] = useState(["A", "B", "C"]);
      return (
        <Gallery
          products={items}
          state={makeDefaultState(start)}
          category="face"
          editing
          onEdit={{
            ...fullEdit(),
            onMove: (f, t) => {
              calls.push([f, t]);
              setItems((prev) => {
                const next = [...prev];
                const [m] = next.splice(f, 1);
                next.splice(t, 0, m);
                return next;
              });
            },
          }}
        />
      );
    }
    render(<Host />);
    screen
      .getByRole("button", { name: "Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp sản phẩm 1" })
      .focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    // A moves 0->1 then 1->2, NOT 0->1 then 1->0
    expect(calls).toEqual([[0, 1], [1, 2]]);
    expect(screen.getByRole("textbox", { name: "Tên sản phẩm 1" })).toHaveValue("B");
    expect(screen.getByRole("textbox", { name: "Tên sản phẩm 3" })).toHaveValue("A");
  });
});
