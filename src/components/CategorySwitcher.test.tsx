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

  it("tags each button with its data-cat", () => {
    // All three active gradients are keyed off `.cat-btn[data-cat="…"].active`
    // in styles.css, so dropping the attribute would silently break every
    // category's active styling while the rest of the suite stayed green.
    render(<CategorySwitcher active="hair" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Da mặt/ })).toHaveAttribute("data-cat", "face");
    expect(screen.getByRole("button", { name: /Tóc/ })).toHaveAttribute("data-cat", "hair");
    expect(screen.getByRole("button", { name: /Da cơ thể/ })).toHaveAttribute("data-cat", "body");
  });

  it("calls onSelect with the clicked category", async () => {
    const onSelect = vi.fn();
    render(<CategorySwitcher active="face" onSelect={onSelect} />);
    // The body button reads "Da cơ thể", not "Cơ thể" — match the real label.
    await userEvent.click(screen.getByRole("button", { name: /Da cơ thể/ }));
    expect(onSelect).toHaveBeenCalledWith("body");
  });
});
