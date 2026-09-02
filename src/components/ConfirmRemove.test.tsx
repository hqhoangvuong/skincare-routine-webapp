import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmRemove from "./ConfirmRemove";

describe("ConfirmRemove", () => {
  it("shows one × trigger at rest", () => {
    render(<ConfirmRemove label="Xoá bước" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Xoá bước" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
  });

  it("first click reveals Xoá / Huỷ and hides the trigger; onConfirm not yet called", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    expect(screen.getByRole("button", { name: "Xoá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá bước" })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Xoá fires onConfirm once", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Huỷ returns to the resting trigger without confirming", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.getByRole("button", { name: "Xoá bước" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("focus leaving the confirm group resets to the trigger", async () => {
    const onConfirm = vi.fn();
    render(
      <>
        <ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />
        <button>outside</button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    expect(screen.getByRole("button", { name: "Huỷ" })).toHaveFocus();
    await userEvent.click(screen.getByText("outside")); // moves focus out
    expect(screen.getByRole("button", { name: "Xoá bước" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
