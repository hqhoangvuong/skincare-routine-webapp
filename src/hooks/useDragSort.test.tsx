import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, afterEach } from "vitest";
import { useDragSort } from "./useDragSort";

// jsdom (this repo, v25) has no PointerEvent. The brief sanctions a MouseEvent-based
// polyfill so the pointer path can be dispatched from tests; clientY rides through
// MouseEvent's init, pointerId is carried explicitly.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  }
  vi.stubGlobal("PointerEvent", PointerEventPolyfill);
}

type Row = { id: string; label: string };

function List({
  items, onReorder, opts, keyOf = (r: Row) => r.id,
}: {
  items: Row[];
  onReorder: (f: number, t: number) => void;
  opts?: { mode?: "live" | "onDrop"; itemNoun?: string };
  keyOf?: (r: Row, i: number) => string;
}) {
  const { order, handleProps, draggingKey, dropTargetKey } = useDragSort(items, keyOf, onReorder, opts);
  return (
    <ul>
      {order.map((r, i) => (
        <li key={keyOf(r, i)} data-dragging={draggingKey === keyOf(r, i)} data-drop={dropTargetKey === keyOf(r, i)}>
          <button {...handleProps(i)}>{r.label}</button>
        </li>
      ))}
    </ul>
  );
}

const rows: Row[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

// handleProps supplies an aria-label, so each handle button's accessible name is
// `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp mục ${i + 1}` (this is also how
// Task 7's DayPanel test finds them).
const handleName = (visualIndex: number): string =>
  `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp mục ${visualIndex + 1}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDragSort — keyboard", () => {
  it("ArrowDown on row i fires onReorder(i, i+1)", async () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    screen.getByRole("button", { name: handleName(0) }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("ArrowUp on row i fires onReorder(i, i-1)", async () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    screen.getByRole("button", { name: handleName(2) }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onReorder).toHaveBeenCalledWith(2, 1);
  });

  it("guards the ends: ArrowUp on row 0 and ArrowDown on the last row fire nothing", async () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    screen.getByRole("button", { name: handleName(0) }).focus();
    await userEvent.keyboard("{ArrowUp}");
    screen.getByRole("button", { name: handleName(2) }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("handle has an aria-label", () => {
    render(<List items={rows} onReorder={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp mục 1" })).toBeInTheDocument();
  });
});

describe("useDragSort — order tracking", () => {
  it("order follows items when no drag is in progress", () => {
    const { rerender } = render(<List items={rows} onReorder={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    rerender(<List items={[rows[2], rows[0], rows[1]]} onReorder={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Gamma", "Alpha", "Beta"]);
  });
});

describe("useDragSort — pointer", () => {
  it("a drag past the next row's midpoint commits one onReorder(0, 1) on pointerup", () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    const buttons = screen.getAllByRole("button");
    // mock row rects: each <li> 40px tall, stacked from y=0
    const lis = buttons.map((b) => b.closest("li"));
    lis.forEach((li, i) => {
      if (!li) throw new Error("li");
      vi.spyOn(li, "getBoundingClientRect").mockReturnValue({
        top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}),
      });
    });
    const handle = buttons[0];
    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    });
    // move the pointer down past row 1's midpoint (y = 60)
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 65, pointerId: 1 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 65, pointerId: 1 }));
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("a drag straight down across two midpoints commits a single onReorder(0, 2)", () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    const buttons = screen.getAllByRole("button");
    // 3 rows, 40px tall, stacked from y=0 → midpoints at 20 / 60 / 100
    const lis = buttons.map((b) => b.closest("li"));
    lis.forEach((li, i) => {
      if (!li) throw new Error("li");
      vi.spyOn(li, "getBoundingClientRect").mockReturnValue({
        top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}),
      });
    });
    const handle = buttons[0];
    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    });
    // past row 1's midpoint (60)
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 65, pointerId: 1 }));
    });
    // well past row 2's midpoint (100)
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 150, pointerId: 1 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 150, pointerId: 1 }));
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  // Regression for the rect-mapping bug (whole-branch review I1): the move handler
  // must index the snapshotted row rects by VISUAL SLOT, not by original item index.
  // The two agree only while the local order is still the identity permutation, so a
  // path that reverses direction after the order has already changed is what tells
  // the correct resolver apart from the buggy one. With 4 rows (40px tall, midpoints
  // 20/60/100/140) dragging row 0 along y = 65 → 105 → 110 → 70 → 30, the slot-indexed
  // resolver settles the row at visual index 1 → onReorder(0, 1); the order-indexed
  // (buggy) resolver walks it all the way back to index 0 and fires nothing.
  it("a direction-reversing drag resolves the row by visual slot (not original index)", () => {
    const onReorder = vi.fn();
    const rows4: Row[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
      { id: "d", label: "Delta" },
    ];
    render(<List items={rows4} onReorder={onReorder} />);
    const buttons = screen.getAllByRole("button");
    const lis = buttons.map((b) => b.closest("li"));
    lis.forEach((li, i) => {
      if (!li) throw new Error("li");
      vi.spyOn(li, "getBoundingClientRect").mockReturnValue({
        top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}),
      });
    });
    act(() => {
      buttons[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    });
    for (const clientY of [65, 105, 110, 70, 30]) {
      act(() => {
        window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY, pointerId: 1 }));
      });
    }
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 30, pointerId: 1 }));
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("a pointerdown sets data-dragging on its row", () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    const handle = screen.getAllByRole("button")[0];
    const li = handle.closest("li");
    if (!li) throw new Error("li");
    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    });
    expect(li.getAttribute("data-dragging")).toBe("true");
  });

  it("a pointerdown+pointerup with no midpoint crossing fires nothing", () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    const handle = screen.getAllByRole("button")[0];
    act(() => {
      handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 12, pointerId: 1 }));
    });
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe("useDragSort — onDrop mode + guards", () => {
  function mockRects(): void {
    screen.getAllByRole("button").forEach((b, i) => {
      const li = b.closest("li");
      if (!li) throw new Error("li");
      vi.spyOn(li, "getBoundingClientRect").mockReturnValue({
        top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}),
      });
    });
  }

  it("onDrop: order does not change during pointermove; one onReorder on pointerup", () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} opts={{ mode: "onDrop" }} keyOf={(_r, i) => String(i)} />);
    mockRects();
    const handle = screen.getAllByRole("button")[0];
    act(() => { handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 })); });
    act(() => { window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 150, pointerId: 1 })); });
    // list still in original visual order mid-drag
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
    act(() => { window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 150, pointerId: 1 })); });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("M7: the list shrinking mid-drag ends the drag without throwing or reordering", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<List items={rows} onReorder={onReorder} opts={{ mode: "onDrop" }} keyOf={(_r, i) => String(i)} />);
    mockRects();
    const handle = screen.getAllByRole("button")[2];
    act(() => { handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 90, pointerId: 1 })); });
    expect(() => {
      rerender(<List items={[rows[0]]} onReorder={onReorder} opts={{ mode: "onDrop" }} keyOf={(_r, i) => String(i)} />);
      act(() => { window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 10, pointerId: 1 })); });
      act(() => { window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 10, pointerId: 1 })); });
    }).not.toThrow();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("M3: the handle label carries the arrow-key hint and the given noun", () => {
    render(<List items={rows} onReorder={vi.fn()} opts={{ itemNoun: "sản phẩm" }} />);
    expect(
      screen.getByRole("button", { name: "Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp sản phẩm 1" }),
    ).toBeInTheDocument();
  });
});
