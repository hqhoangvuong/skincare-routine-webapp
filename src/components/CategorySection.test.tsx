import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CategorySection from "./CategorySection";
import { routine } from "../shared/routine";
import { makeDefaultState } from "../shared/defaults";

const stateProps = {
  state: makeDefaultState(new Date("2026-08-24T00:00:00Z")),
  onToggleStep: () => {},
  editContent: () => {},
};

describe("CategorySection", () => {
  it("renders every product in the gallery", () => {
    // Scoped to the gallery: on Monday (activeDay 0) the day panel legitimately
    // repeats two of these exact product names in its own steps (e.g. "Dầu khô
    // đa năng Nuxe Huile Multi" and "Kem dưỡng ẩm Vaseline Gluta Hya Night" are
    // both today's routine and gallery items), so an unscoped screen.getByText
    // would find two matches and fail as ambiguous rather than as a real bug.
    render(<CategorySection category="body" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
    // getByTestId returns an HTMLElement, so `within` needs no cast (the
    // no-cast rule in CLAUDE.md covers tests too); Gallery carries the
    // matching data-testid.
    const gallery = screen.getByTestId("gallery");
    for (const product of routine.body.products) {
      expect(within(gallery).getByText(product)).toBeInTheDocument();
    }
  });

  it("renders seven day tabs", () => {
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
    expect(screen.getAllByRole("tab")).toHaveLength(7);
  });

  it("shows the active day's steps", () => {
    render(<CategorySection category="face" activeDay={4} onSelectDay={() => {}} {...stateProps} />);
    // Friday PM is the AHA night
    expect(screen.getByText("Toner AHA Dermarium Rough Addition 8%")).toBeInTheDocument();
  });

  it("calls onSelectDay when another tab is clicked", async () => {
    const onSelectDay = vi.fn();
    render(<CategorySection category="face" activeDay={0} onSelectDay={onSelectDay} {...stateProps} />);
    await userEvent.click(screen.getByRole("tab", { name: /T5/ }));
    expect(onSelectDay).toHaveBeenCalledWith(3);
  });

  it("renders hair days as one flat list, with no AM/PM cards", () => {
    render(<CategorySection category="hair" activeDay={1} onSelectDay={() => {}} {...stateProps} />);
    expect(screen.getByText("Dầu Mielle Rosemary Mint Scalp & Hair Oil")).toBeInTheDocument();
    expect(document.querySelector(".card.am")).toBeNull();
  });

  it("applies the category's theme class", () => {
    const { container } = render(
      <CategorySection category="hair" activeDay={0} onSelectDay={() => {}} {...stateProps} />,
    );
    expect(container.querySelector("section")).toHaveClass("theme-yellow");
  });

  it("toggles edit mode with the pencil and hides the week strip + checkboxes", async () => {
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
    expect(screen.getByRole("group", { name: /Tiến độ tuần/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    expect(screen.queryByRole("group", { name: /Tiến độ tuần/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: /đặt lại theo mặc định/i })).toBeInTheDocument();
  });

  it("exits edit mode when the category prop changes (remount via key in App)", async () => {
    // App.tsx remounts CategorySection with key={activeCategory}; a key change
    // must discard the local `editing` useState. Toggle it on, then remount
    // under a new key and assert the pencil is back to aria-pressed=false.
    const pencil = () => screen.getByRole("button", { name: /chỉnh sửa nội dung/i });
    const { rerender } = render(
      <CategorySection key="face" category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />,
    );
    expect(pencil()).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pencil());
    expect(pencil()).toHaveAttribute("aria-pressed", "true");
    rerender(<CategorySection key="hair" category="hair" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
    expect(pencil()).toHaveAttribute("aria-pressed", "false");
  });
});
