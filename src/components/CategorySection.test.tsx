import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CategorySection from "./CategorySection";
import { routine } from "../shared/routine";

describe("CategorySection", () => {
  it("renders every product in the gallery", () => {
    // Scoped to the gallery: on Monday (activeDay 0) the day panel legitimately
    // repeats two of these exact product names in its own steps (e.g. "Dầu khô
    // đa năng Nuxe Huile Multi" and "Kem dưỡng ẩm Vaseline Gluta Hya Night" are
    // both today's routine and gallery items), so an unscoped screen.getByText
    // would find two matches and fail as ambiguous rather than as a real bug.
    render(<CategorySection category="body" activeDay={0} onSelectDay={() => {}} />);
    // getByTestId returns an HTMLElement, so `within` needs no cast (the
    // no-cast rule in CLAUDE.md covers tests too); Gallery carries the
    // matching data-testid.
    const gallery = screen.getByTestId("gallery");
    for (const product of routine.body.products) {
      expect(within(gallery).getByText(product)).toBeInTheDocument();
    }
  });

  it("renders seven day tabs", () => {
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} />);
    expect(screen.getAllByRole("tab")).toHaveLength(7);
  });

  it("shows the active day's steps", () => {
    render(<CategorySection category="face" activeDay={4} onSelectDay={() => {}} />);
    // Friday PM is the AHA night
    expect(screen.getByText("Toner AHA Dermarium Rough Addition 8%")).toBeInTheDocument();
  });

  it("calls onSelectDay when another tab is clicked", async () => {
    const onSelectDay = vi.fn();
    render(<CategorySection category="face" activeDay={0} onSelectDay={onSelectDay} />);
    await userEvent.click(screen.getByRole("tab", { name: /T5/ }));
    expect(onSelectDay).toHaveBeenCalledWith(3);
  });

  it("renders hair days as one flat list, with no AM/PM cards", () => {
    render(<CategorySection category="hair" activeDay={1} onSelectDay={() => {}} />);
    expect(screen.getByText("Dầu Mielle Rosemary Mint Scalp & Hair Oil")).toBeInTheDocument();
    expect(document.querySelector(".card.am")).toBeNull();
  });

  it("applies the category's theme class", () => {
    const { container } = render(
      <CategorySection category="hair" activeDay={0} onSelectDay={() => {}} />,
    );
    expect(container.querySelector("section")).toHaveClass("theme-yellow");
  });
});
