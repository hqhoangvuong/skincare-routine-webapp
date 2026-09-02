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

function List({ items, onReorder }: { items: Row[]; onReorder: (f: number, t: number) => void }) {
  const { order, handleProps, draggingKey } = useDragSort(items, (r) => r.id, onReorder);
  return (
    <ul>
      {order.map((r, i) => (
        <li key={r.id} data-dragging={draggingKey === r.id}>
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
// `Kéo để sắp xếp bước ${i + 1}` (this is also how Task 7's DayPanel test finds them).
const handleName = (visualIndex: number): string => `Kéo để sắp xếp bước ${visualIndex + 1}`;

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
    expect(screen.getByRole("button", { name: "Kéo để sắp xếp bước 1" })).toBeInTheDocument();
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
