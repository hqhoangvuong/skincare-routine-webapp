import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CategorySwitcher from "./CategorySwitcher";

describe("CategorySwitcher", () => {
  it("marks the active category button as active", () => {
    render(<CategorySwitcher active="hair" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Tóc/ })).toHaveClass("active");
    expect(screen.getByRole("button", { name: /Da mặt/ })).not.toHaveClass("active");
  });

  it("calls onSelect with the clicked category", async () => {
    const onSelect = vi.fn();
    render(<CategorySwitcher active="face" onSelect={onSelect} />);
    // The body button reads "Da cơ thể", not "Cơ thể" — match the real label.
    await userEvent.click(screen.getByRole("button", { name: /Da cơ thể/ }));
    expect(onSelect).toHaveBeenCalledWith("body");
  });
});
