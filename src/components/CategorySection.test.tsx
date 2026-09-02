import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CategorySection from "./CategorySection";
import { routine } from "../shared/routine";
import { makeDefaultState } from "../shared/defaults";
import { updateStepTuple, stepId } from "../shared/content";

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

  it("pill shows an edited dot once the category has an override", () => {
    const edited = updateStepTuple(
      makeDefaultState(new Date("2026-08-24T00:00:00Z")),
      "face", 2, "am", stepId("face", 2, "am", 0), "x", "",
    );
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}}
      {...stateProps} state={edited} />);
    expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("data-edited", "true");
  });

  it("no dot for an unedited category", () => {
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
    expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("data-edited", "false");
  });

  it("renders the customizations strip only in edit mode with an override; its Đặt lại is confirm-gated", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const editContent = vi.fn();
    const edited = updateStepTuple(
      makeDefaultState(new Date("2026-08-24T00:00:00Z")),
      "face", 2, "am", stepId("face", 2, "am", 0), "x", "",
    );
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}}
      {...stateProps} state={edited} editContent={editContent} />);
    expect(screen.queryByText(/Bạn đã tuỳ chỉnh mục này/)).toBeNull(); // not editing yet
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    expect(screen.getByText(/Bạn đã tuỳ chỉnh mục này/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(editContent).not.toHaveBeenCalled(); // confirm returned false
    confirmSpy.mockRestore();
  });

  it("the standalone 'Đặt lại theo mặc định' button is gone", async () => {
    const edited = updateStepTuple(
      makeDefaultState(new Date("2026-08-24T00:00:00Z")),
      "face", 2, "am", stepId("face", 2, "am", 0), "x", "",
    );
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}}
      {...stateProps} state={edited} />);
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    expect(screen.queryByText("Đặt lại theo mặc định")).toBeNull();
  });

  it("stays in edit mode across a day-tab switch", async () => {
    function Host() {
      const [d, setD] = useState(0);
      return <CategorySection {...stateProps} category="face" activeDay={d} onSelectDay={setD} />;
    }
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("tab", { name: /T5/ }));
    expect(screen.getByRole("tab", { name: /T5/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Thứ Năm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("a keyboard step reorder in edit mode changes the rendered order", async () => {
    function Host() {
      const [st, setSt] = useState(makeDefaultState(new Date("2026-08-24T00:00:00Z")));
      return (
        <CategorySection
          category="face"
          activeDay={0}
          onSelectDay={() => {}}
          state={st}
          onToggleStep={() => {}}
          editContent={(mut) => setSt(mut)}
        />
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    const handlesBefore = screen.getAllByRole("button", { name: /Kéo để sắp xếp bước/ });
    // the first AM step label, before the move
    const firstToggleBefore = screen.getAllByRole("button", { name: /^Sửa bước:/ })[0].textContent;
    handlesBefore[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    const firstToggleAfter = screen.getAllByRole("button", { name: /^Sửa bước:/ })[0].textContent;
    expect(firstToggleAfter).not.toBe(firstToggleBefore);
  });

  it("editing the day name in edit mode persists (re-render shows the new value)", async () => {
    function Host() {
      const [st, setSt] = useState(makeDefaultState(new Date("2026-08-24T00:00:00Z")));
      return (
        <CategorySection
          category="face"
          activeDay={0}
          onSelectDay={() => {}}
          state={st}
          onToggleStep={() => {}}
          editContent={(mut) => setSt(mut)}
        />
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    const nameInput = screen.getByLabelText("Tên ngày");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Ngày BHA");
    await userEvent.tab();
    // assert something rendered downstream of committed state: the day-name badge
    // in DayPanel only updates if the commit reached state (a no-op handler leaves
    // it at the default day name).
    expect(screen.getByText("Ngày BHA")).toBeInTheDocument();
  });

  it("editing the focus prefix in edit mode persists (face category only)", async () => {
    function Host() {
      const [st, setSt] = useState(makeDefaultState(new Date("2026-08-24T00:00:00Z")));
      return (
        <CategorySection
          category="face"
          activeDay={0}
          onSelectDay={() => {}}
          state={st}
          onToggleStep={() => {}}
          editContent={(mut) => setSt(mut)}
        />
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
    const prefixInput = screen.getByLabelText("Tiền tố nhãn (áp dụng cả mục)");
    await userEvent.clear(prefixInput);
    await userEvent.type(prefixInput, "Tối nay: ");
    await userEvent.tab();
    // the face focus badge renders `${prefix}${day.focus}`; `/^Tối nay: /` matches
    // the committed badge but not the shipped default `"Trọng tâm tối nay: …"`.
    expect(screen.getByText(/^Tối nay: /)).toBeInTheDocument();
  });
});
