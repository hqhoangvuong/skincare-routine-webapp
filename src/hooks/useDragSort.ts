import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type DragState = {
  pointerId: number;
  fromIndex: number;
  order: number[]; // indices into the ORIGINAL items, in current visual order
};

export function useDragSort<T>(
  items: T[],
  keyOf: (item: T) => string,
  onReorder: (fromIndex: number, toIndex: number) => void,
): {
  order: T[];
  handleProps: (index: number) => {
    onPointerDown: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    "aria-label": string;
  };
  draggingKey: string | null;
} {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Element rects keyed by original index, refreshed at pointerdown.
  const rectsRef = useRef<Map<number, DOMRect>>(new Map());
  const listRef = useRef<(HTMLElement | null)[]>([]);

  const order: T[] = drag ? drag.order.map((i) => items[i]) : items;
  const draggingKey = drag ? keyOf(items[drag.fromIndex]) : null;

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const finalIndex = d.order.indexOf(d.fromIndex);
    if (finalIndex !== -1 && finalIndex !== d.fromIndex) {
      onReorder(d.fromIndex, finalIndex);
    }
  }, [onReorder]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const d = dragRef.current;
      if (!d) return;
      // find the visual slot whose vertical midpoint the pointer has crossed
      const y = e.clientY;
      const currentVisual = d.order.indexOf(d.fromIndex);
      const rects = d.order.map((origIdx) => rectsRef.current.get(origIdx));
      let target = currentVisual;
      for (let i = 0; i < rects.length; i += 1) {
        const r = rects[i];
        if (!r) continue;
        const mid = r.top + r.height / 2;
        if (i < currentVisual && y < mid) { target = i; break; }
        if (i > currentVisual && y > mid) { target = i; }
      }
      if (target !== currentVisual) {
        const next = [...d.order];
        const [moved] = next.splice(currentVisual, 1);
        if (moved === undefined) return;
        next.splice(target, 0, moved);
        setDrag({ ...d, order: next });
      }
    };
    const handleUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      endDrag();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [drag, endDrag]);

  const handleProps = useCallback(
    (index: number) => ({
      "aria-label": `Kéo để sắp xếp bước ${index + 1}`,
      onPointerDown: (e: PointerEvent) => {
        // snapshot every sibling <li>'s rect for the drag
        const handleEl = e.currentTarget;
        const li = handleEl.closest("li");
        const listEl = li?.parentElement;
        rectsRef.current = new Map();
        if (listEl) {
          Array.from(listEl.children).forEach((child, i) => {
            if (child instanceof HTMLElement) rectsRef.current.set(i, child.getBoundingClientRect());
          });
        }
        if (typeof handleEl.setPointerCapture === "function") {
          handleEl.setPointerCapture(e.pointerId);
        }
        setDrag({ pointerId: e.pointerId, fromIndex: index, order: items.map((_, i) => i) });
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const to = e.key === "ArrowUp" ? index - 1 : index + 1;
        if (to < 0 || to >= items.length) return;
        onReorder(index, to);
      },
    }),
    [items, onReorder],
  );

  // keep listRef length in step with items (used only defensively)
  listRef.current = items.map(() => null);

  return { order, handleProps, draggingKey };
}
