import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type DragState = {
  pointerId: number;
  fromIndex: number;
  order: number[]; // indices into the ORIGINAL items, in current (would-be) visual order
};

export function useDragSort<T>(
  items: T[],
  keyOf: (item: T, index: number) => string,
  onReorder: (fromIndex: number, toIndex: number) => void,
  opts?: { mode?: "live" | "onDrop"; itemNoun?: string },
): {
  order: T[];
  handleProps: (index: number) => {
    onPointerDown: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    "aria-label": string;
  };
  draggingKey: string | null;
  dropTargetKey: string | null;
  dropBelow: boolean;
} {
  const mode = opts?.mode ?? "live";
  const noun = opts?.itemNoun ?? "mục";

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const rectsRef = useRef<Map<number, DOMRect>>(new Map());

  // M7: a stale index (list shrank under an in-progress drag) never dereferences.
  const dragValid = drag !== null && drag.fromIndex < items.length;

  const liveOrder: T[] =
    drag && mode === "live"
      ? drag.order.filter((i) => i < items.length).map((i) => items[i])
      : items;
  const order: T[] = liveOrder;

  const wouldLandAt = drag ? drag.order.indexOf(drag.fromIndex) : -1;
  const draggingKey = dragValid ? keyOf(items[drag.fromIndex], drag.fromIndex) : null;
  // M2: at pointerdown wouldLandAt === fromIndex, which would flag the dragged row as its
  // own drop target — suppress that so a row never gets both `dragging` and `drop-target`.
  const dropActive =
    dragValid && mode === "onDrop" && wouldLandAt >= 0 && wouldLandAt < items.length &&
    drag !== null && wouldLandAt !== drag.fromIndex;
  const dropTargetKey = dropActive ? keyOf(items[wouldLandAt], wouldLandAt) : null;
  // M1: the indicator draws on the drop-target row's top edge; on a downward drag the row
  // that occupies the landing slot sits *above* where the dragged item lands, so the caller
  // needs to move the line to that row's bottom edge instead.
  const dropBelow = dropActive && drag !== null && wouldLandAt > drag.fromIndex;

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || d.fromIndex >= items.length) return;
    const finalIndex = d.order.indexOf(d.fromIndex);
    // M11: if the list shrank mid-drag but `fromIndex` stayed valid, `finalIndex` can point
    // past the new end — range-guard here rather than leaning on moveProduct/moveStep to do it.
    if (finalIndex !== -1 && finalIndex !== d.fromIndex && finalIndex < items.length) {
      onReorder(d.fromIndex, finalIndex);
    }
  }, [onReorder, items.length]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const d = dragRef.current;
      if (!d || d.fromIndex >= items.length) {
        endDrag();
        return;
      }
      const y = e.clientY;
      const currentVisual = d.order.indexOf(d.fromIndex);
      const rects = d.order.map((_, i) => rectsRef.current.get(i));
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
  }, [drag, endDrag, items.length]);

  const handleProps = useCallback(
    (index: number) => ({
      "aria-label": `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp ${noun} ${index + 1}`,
      onPointerDown: (e: PointerEvent) => {
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
        // order is snapshotted at pointerdown; items appended mid-drag are not draggable until the gesture ends (unreachable in current UI).
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
    [items, onReorder, noun],
  );

  return { order, handleProps, draggingKey, dropTargetKey, dropBelow };
}
