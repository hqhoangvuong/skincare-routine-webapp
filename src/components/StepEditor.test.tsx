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

  it("removing a step needs two taps", async () => {
    const onRemove = vi.fn();
    render(
      <StepEditor display={{ id: "face.0.am.0", product: "Toner", note: "" }}
        raw={["Toner", ""]} onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={onRemove} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    expect(onRemove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders the 'đã đổi' tag and is-modified class when edited='modified'", () => {
    const { container } = render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        edited="modified" onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText("đã đổi")).toBeInTheDocument();
    expect(container.querySelector("li.step-edit.is-modified")).not.toBeNull();
  });

  it("renders 'mới' and is-added when edited='added'", () => {
    const { container } = render(
      <StepEditor display={{ id: "x", product: "", note: "" }} raw={["", ""]}
        edited="added" onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText("mới")).toBeInTheDocument();
    expect(container.querySelector("li.step-edit.is-added")).not.toBeNull();
  });

  it("no tag when edited is null/undefined", () => {
    render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByText("đã đổi")).toBeNull();
    expect(screen.queryByText("mới")).toBeNull();
  });

  it("initialOpen mounts the row expanded", () => {
    render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        initialOpen onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByLabelText("Sản phẩm")).toBeInTheDocument();
  });

  it("opens when initialOpen flips to true on an already-mounted row (same-day jump)", () => {
    const { rerender } = render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        initialOpen={false} onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Sản phẩm")).toBeNull();
    rerender(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        initialOpen onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByLabelText("Sản phẩm")).toBeInTheDocument();
  });

  it("initialOpen + autoFocusFirst focuses the first product input", () => {
    render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        initialOpen autoFocusFirst onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByLabelText("Sản phẩm")).toHaveFocus();
  });

  it("initialOpen without autoFocusFirst does not steal focus", () => {
    render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        initialOpen onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByLabelText("Sản phẩm")).not.toHaveFocus();
  });

  it("renders a dragHandle node before the toggle when given one", () => {
    render(
      <StepEditor
        display={{ id: "x", product: "Toner", note: "" }}
        raw={["Toner", ""]}
        dragHandle={<button aria-label="handle">::</button>}
        onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()}
      />,
    );
    const head = document.querySelector(".step-edit-head");
    if (!(head instanceof HTMLElement)) throw new Error("no head");
    expect(head.firstElementChild).toHaveAttribute("aria-label", "handle");
  });

  it("renders no handle when dragHandle is omitted", () => {
    render(
      <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
        onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
    );
    const head = document.querySelector(".step-edit-head");
    if (!(head instanceof HTMLElement)) throw new Error("no head");
    expect(head.firstElementChild?.getAttribute("aria-label")).toContain("Sửa bước");
  });
});
