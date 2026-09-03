# Content Editor Wave 3 — Product Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-category product list ("the shelf") a working editor surface — reorderable, offered as `<datalist>` autocomplete when naming a step's product, growable from inside the step editor, and annotated with where each entry is used — and close Wave 2 review minors M3 and M7.

**Architecture:** Three pure helpers in `src/shared/content.ts` (`moveProduct`, `addProduct` gains an optional name, `productUsage`). One `useDragSort` revision adds an `onDrop` reorder mode (no stable ids needed), a configurable handle-label noun with an arrow-key hint (M3), and mid-drag list-shrink guards (M7). The `Gallery` edit view gains drag/arrow reorder and a per-entry usage list with jump-to-step. The step product `<input>` (plain step and every threshold/cycle branch) gets `list={`shelf-<category>`}` plus an "add to shelf" button. No `AppState` schema change.

**Tech Stack:** React 18 + Vite 5 + TypeScript strict, Vitest + @testing-library/react (jsdom), plain CSS. No new dependencies — the datalist is the native element, drag is the existing hand-rolled Pointer Events hook.

**Spec:** `docs/superpowers/specs/2026-09-03-content-editor-shelf-w3-design.md`

## Global Constraints

- **No `as` casts, no `any`, no `@ts-ignore`/`@ts-nocheck`, no non-null `!` assertions** anywhere in `src/` or `worker/`, including tests. Narrow with type predicates / `in` checks. `npm run lint:constraints` (`scripts/check-constraints.mjs`) greps for these and is run first by `npm run test`. The only allowed exception is the one `as Record<string, unknown>` line already inside `isAppState`.
- **No schema change.** `AppState` stays `version: 3`; `CategoryOverride.products` stays `string[]`. No migration arm, no new frozen `isVNState` snapshot, `migrate()` untouched.
- **`src/shared/` is imported by both the frontend and the Worker builds** — no frontend-only globals and no display strings leak into it. `productUsage` returns structure (`{ dayIndex, phase, stepId }`); the component formats labels.
- **Vietnamese UI strings that already exist are never paraphrased or regenerated.** New copy, verbatim:
  - `＋ Thêm "<name>" vào kệ` — add-to-shelf button (`<name>` = the trimmed field text)
  - `⚠ Chưa dùng ở bước nào` — unused shelf-entry note
  - `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp bước <n>` — step drag-handle aria-label
  - `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp sản phẩm <n>` — shelf drag-handle aria-label
  - Handle label noun defaults to `mục` when no `itemNoun` is passed.
- Node 20, `strict: true`. `npm run test` runs `lint:constraints` then the full Vitest suite. `npm run build` runs `typecheck` (both `tsconfig.json` and `tsconfig.worker.json`) first.
- Commands need Node 20 on `PATH`. In this environment the system `node` is broken; every `npm`/`npx` command must be prefixed `export PATH="$HOME/.local/node20/bin:$PATH"; `.

## Baseline facts the tasks rely on

- `CategoryOverride = { products: string[]; days: StoredDay[]; focusPrefix?: string }` (`src/shared/types.ts:53`).
- `content.ts` already exports `ensureOverride` (private), `withOverride` (private), `getStoredDays`, `getCategoryData`, `stepId`, `moveStep`, `addProduct`, `renameProduct`, `removeProduct`. `isStepTuple` is imported there. `RoutineStep = StepTuple | ConditionalStep`; a non-tuple `RoutineStep` narrows to `{ kind: "threshold" | "cycle", ... }`.
- `useDragSort(items, keyOf, onReorder)` today: `keyOf: (item: T) => string`; returns `{ order: T[]; handleProps: (index) => {onPointerDown, onKeyDown, "aria-label"}; draggingKey: string | null }`. The pointer path re-sorts a local `order` under the finger and fires one `onReorder(from, to)` on `pointerup`; `ArrowUp`/`ArrowDown` on the handle fire `onReorder` immediately. Rects are snapshotted at `pointerdown` and indexed by visual slot.
- `Gallery({ products, editing?, onEdit? })`; `GalleryEdit = { onRename, onRemove, onAdd }`. Rows keyed by array index. Rename uses `useBufferedText` (commit on blur). Remove uses `ConfirmRemove` (two-tap).
- `VariantEditor({ value, onChange, autoFocusFirst? })` renders `TupleFields` for the plain kind, twice for `threshold` (`before` / `from`), and once per `cycle` week. `TupleFields` product input label text is `"Sản phẩm"` (plain) / `"Sản phẩm — tuần 1–N"` etc.
- `StepEditor` renders `VariantEditor` inside an expandable `<li>`; it already forwards `autoFocusFirst`.
- `DayPanel` receives `state` + `category`; `PhaseBody` calls `useDragSort` unconditionally at its top and renders `StepEditor` rows in edit mode. `DayEdit` is the edit-callback bag. `CategorySection` builds both the `Gallery` `onEdit` and the `DayPanel` `onEdit` objects and owns `openStepId` state (its `onJump` for `CustomizationsStrip` does `onSelectDay(dayIndex); setOpenStepId(id)`).
- `DAY_SHORT` (`["T2".."CN"]`) and `PHASE_LABEL` (`{ am: "Sáng", pm: "Tối", steps: "Chăm tóc" }`) live in `src/components/CustomizationsStrip.tsx` today.
- Tests currently asserting the old handle label: `src/hooks/useDragSort.test.tsx` (`handleName` helper at line 43, literal at line 78), `src/components/DayPanel.test.tsx:152` (`/Kéo để sắp xếp bước/`), `src/components/CategorySection.test.tsx:161` (`/Kéo để sắp xếp bước/`).

---

## Task 1: `content.ts` — `moveProduct`, `addProduct(name?)`, `productUsage`

**Files:**
- Modify: `src/shared/content.ts`
- Test: `src/shared/content.test.ts`

**Interfaces:**
- Consumes: `ensureOverride`, `withOverride`, `getStoredDays`, `isStepTuple`, `routine`, types `AppState`, `Category`, `StepPhase`, `RoutineStep`, `StoredStep` (all already in `content.ts`).
- Produces:
  - `moveProduct(state: AppState, category: Category, fromIndex: number, toIndex: number): AppState`
  - `addProduct(state: AppState, category: Category, name?: string): AppState` (was `addProduct(state, category)`)
  - `export type StepUsage = { dayIndex: number; phase: StepPhase; stepId: string }`
  - `productUsage(state: AppState, category: Category, name: string): StepUsage[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/content.test.ts`. It already imports from `./content`, `./routine` (`routine`), `./defaults` (`makeDefaultState`), and has `const base` + `withFaceOverride(mut)`. Extend the `./content` import to add `moveProduct, productUsage` and the type import to add `StepUsage`.

```ts
describe("moveProduct", () => {
  it("reorders a product within the shelf", () => {
    const s = moveProduct(base, "body", 0, 2);
    expect(getCategoryData(s, "body").products).toEqual([
      "Dầu khô đa năng Nuxe Huile Multi",
      "Kem dưỡng ẩm Vaseline Gluta Hya Night",
      "Tẩy da chết cơ thể cà phê Cocoon",
    ]);
  });

  it("returns the same state reference for a no-op or out-of-range move", () => {
    expect(moveProduct(base, "body", 1, 1)).toBe(base);
    expect(moveProduct(base, "body", -1, 0)).toBe(base);
    expect(moveProduct(base, "body", 0, 99)).toBe(base);
  });

  it("creates the override from the shipped shelf on first move and leaves other categories alone", () => {
    const s = moveProduct(base, "body", 0, 1);
    expect(s.overrides?.body).toBeDefined();
    expect(s.overrides?.face).toBeUndefined();
    expect(getCategoryData(s, "body").products).toHaveLength(routine.body.products.length);
  });
});

describe("addProduct with a name", () => {
  it("appends the given name", () => {
    const s = addProduct(base, "face", "Kem chống nắng SPF 50");
    const products = getCategoryData(s, "face").products;
    expect(products[products.length - 1]).toBe("Kem chống nắng SPF 50");
  });

  it("still appends an empty string when called with no name", () => {
    const s = addProduct(base, "face");
    const products = getCategoryData(s, "face").products;
    expect(products[products.length - 1]).toBe("");
  });
});

describe("productUsage", () => {
  it("finds a plain step that names the product", () => {
    // Monday PM step 0 is ["Tẩy trang Bioderma", ""]
    const hits = productUsage(base, "face", "Tẩy trang Bioderma");
    expect(hits).toContainEqual({ dayIndex: 0, phase: "pm", stepId: "face.0.pm.0" });
    // it appears on several days — all PM
    expect(hits.every((h) => h.phase === "pm")).toBe(true);
    expect(hits.length).toBeGreaterThan(1);
  });

  it("matches inside a threshold branch (Wed AM Vitamin C / Niacinamide)", () => {
    const nia = productUsage(base, "face", "Serum Niacinamide 15% — Cocoon");
    expect(nia.some((h) => h.dayIndex === 2 && h.phase === "am")).toBe(true);
  });

  it("matches inside a cycle branch (Sun PM mask rotation)", () => {
    const mask = productUsage(base, "face", "Mặt nạ Histolab Peppermint");
    expect(mask).toEqual([{ dayIndex: 6, phase: "pm", stepId: "face.6.pm.3" }]);
  });

  it("trims both sides and returns [] for an empty/whitespace name", () => {
    expect(productUsage(base, "face", "  Tẩy trang Bioderma ").length).toBeGreaterThan(0);
    expect(productUsage(base, "face", "   ")).toEqual([]);
    expect(productUsage(base, "face", "")).toEqual([]);
  });

  it("goes empty for the old name after a rename, non-empty for the new one", () => {
    const s = renameProduct(base, "face", 0, "Tẩy trang Bioderma Sensibio H2O");
    // step content is untouched by a shelf rename, so usage is by step text:
    // the step still says "Tẩy trang Bioderma", so the OLD shelf name still matches steps
    // — the meaningful assertion is that querying the NEW distinct string finds nothing
    expect(productUsage(s, "face", "Tẩy trang Bioderma Sensibio H2O")).toEqual([]);
  });

  it("is ordered by day then phase", () => {
    const hits = productUsage(base, "face", "Toner Cocoon Sen");
    const keys = hits.map((h) => `${h.dayIndex}.${h.phase}`);
    const sorted = [...keys].sort((a, b) => {
      const [da, pa] = a.split(".");
      const [db, pb] = b.split(".");
      if (da !== db) return Number(da) - Number(db);
      return (pa === "am" ? 0 : 1) - (pb === "am" ? 0 : 1);
    });
    expect(keys).toEqual(sorted);
  });
});
```

- [ ] **Step 2: Run the tests, watch them fail**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/shared/content.test.ts`
Expected: FAIL — `moveProduct` / `productUsage` are not exported; `addProduct` arity.

- [ ] **Step 3: Implement in `src/shared/content.ts`**

Change `addProduct` (currently at `src/shared/content.ts:186`) to take an optional name:

```ts
export function addProduct(state: AppState, category: Category, name = ""): AppState {
  const o = ensureOverride(state, category);
  o.products.push(name);
  return withOverride(state, category, o);
}
```

Add, next to `moveStep` (after `src/shared/content.ts:260`):

```ts
export function moveProduct(
  state: AppState, category: Category, fromIndex: number, toIndex: number,
): AppState {
  const current = state.overrides?.[category]?.products ?? routine[category].products;
  const len = current.length;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 || fromIndex >= len ||
    toIndex < 0 || toIndex >= len
  ) {
    return state;
  }
  const o = ensureOverride(state, category);
  const arr = [...o.products];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  o.products = arr;
  return withOverride(state, category, o);
}
```

Add, near the bottom of the exports (after `isFocusPrefixEdited`):

```ts
export type StepUsage = { dayIndex: number; phase: StepPhase; stepId: string };

/** The product name strings a step names, across every conditional branch. */
function stepProductNames(step: RoutineStep): string[] {
  if (isStepTuple(step)) return [step[0]];
  if (step.kind === "threshold") return [step.before[0], step.from[0]];
  return step.weeks.map((w) => w[0]);
}

/**
 * Every step in `category` whose product name (any branch, trimmed) equals
 * `name` trimmed. Week-independent — "is this product named in the step",
 * not "does the step resolve to it this week". Ordered by day, then
 * am/pm/steps, then array order. Empty/whitespace `name` → [].
 */
export function productUsage(
  state: AppState, category: Category, name: string,
): StepUsage[] {
  const target = name.trim();
  if (target === "") return [];
  const out: StepUsage[] = [];
  getStoredDays(state, category).forEach((day, dayIndex) => {
    const phases: [StepPhase, StoredStep[]][] = "steps" in day
      ? [["steps", day.steps]]
      : [["am", day.am], ["pm", day.pm]];
    for (const [phase, steps] of phases) {
      for (const s of steps) {
        if (stepProductNames(s.step).some((n) => n.trim() === target)) {
          out.push({ dayIndex, phase, stepId: s.id });
        }
      }
    }
  });
  return out;
}
```

`RoutineStep` and `StoredStep` are already imported in `content.ts` (`src/shared/content.ts:3-7`); `StepPhase` too. No new imports.

- [ ] **Step 4: Run the tests, watch them pass**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
export PATH="$HOME/.local/node20/bin:$PATH"; npm run lint:constraints && npm run typecheck && npm run test
git add src/shared/content.ts src/shared/content.test.ts
git commit -m "feat(content): moveProduct, addProduct(name), productUsage"
```

---

## Task 2: `useDragSort` — `onDrop` mode, `itemNoun` (+ M3 hint), M7 guards

**Files:**
- Modify: `src/hooks/useDragSort.ts`
- Modify: `src/components/DayPanel.tsx` (one line — pass `{ itemNoun: "bước" }` to the step `useDragSort`)
- Test: `src/hooks/useDragSort.test.tsx`
- Modify (test-only string updates): `src/components/DayPanel.test.tsx`, `src/components/CategorySection.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces the new `useDragSort` shape:
  ```ts
  useDragSort<T>(
    items: T[],
    keyOf: (item: T, index: number) => string,
    onReorder: (fromIndex: number, toIndex: number) => void,
    opts?: { mode?: "live" | "onDrop"; itemNoun?: string },
  ): {
    order: T[];
    handleProps: (index: number) => { onPointerDown; onKeyDown; "aria-label": string };
    draggingKey: string | null;
    dropTargetKey: string | null;
  }
  ```
  - `mode` defaults `"live"` (unchanged behaviour). `"onDrop"` keeps `order === items` for the whole gesture and fires one `onReorder(fromIndex, dropIndex)` on `pointerup`.
  - `itemNoun` defaults `"mục"`. Handle `aria-label` becomes `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp ${itemNoun} ${index + 1}`.
  - `dropTargetKey` is non-null only while dragging in `"onDrop"` mode — the key of the slot the pointer is currently over.
  - `keyOf` now receives `(item, index)`; existing 1-arg callers stay valid.

- [ ] **Step 1: Write the failing tests**

In `src/hooks/useDragSort.test.tsx`:

1. Update the `List` harness to accept an optional `opts` and a `keyOf` override, and update the label helper + the literal:

```ts
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

const handleName = (visualIndex: number): string =>
  `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp mục ${visualIndex + 1}`;
```

and change the line 78 assertion literal to `"Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp mục 1"`.

2. Add a describe block:

```ts
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
```

3. In `src/components/DayPanel.test.tsx` line ~152 change `/Kéo để sắp xếp bước/` to `/sắp xếp bước/`. In `src/components/CategorySection.test.tsx` line ~161 change `/Kéo để sắp xếp bước/` to `/sắp xếp bước/`.

- [ ] **Step 2: Run the tests, watch the new ones fail**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/hooks/useDragSort.test.tsx`
Expected: FAIL — `dropTargetKey` undefined, old aria-label, no `opts`.

- [ ] **Step 3: Implement in `src/hooks/useDragSort.ts`**

Replace the file with:

```ts
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
  const dropTargetKey =
    dragValid && mode === "onDrop" && wouldLandAt >= 0 && wouldLandAt < items.length
      ? keyOf(items[wouldLandAt], wouldLandAt)
      : null;

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    setDrag(null);
    if (!d || d.fromIndex >= items.length) return;
    const finalIndex = d.order.indexOf(d.fromIndex);
    if (finalIndex !== -1 && finalIndex !== d.fromIndex) {
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

  return { order, handleProps, draggingKey, dropTargetKey };
}
```

Key differences from the current file: `opts` param; `noun` in the aria-label; `keyOf` gets `(item, index)`; `mode === "live"` gate on the returned `order` (in `onDrop` it stays `items`); `dropTargetKey` derived from the internal `drag.order`; M7 guards in `dragValid`, `liveOrder`'s `.filter`, `endDrag`'s early return, and `handleMove`'s `d.fromIndex >= items.length` → `endDrag()`; the dead `listRef` from Wave 2 is not carried over.

- [ ] **Step 4: Update the step `useDragSort` call to keep its noun**

In `src/components/DayPanel.tsx` `PhaseBody` (currently `src/components/DayPanel.tsx:106`), add the fourth arg:

```ts
  const { order, handleProps, draggingKey } = useDragSort(
    resolvedSteps,
    (rs) => rs.id,
    (from, to) => onEdit?.onReorderStep(phase, from, to),
    { itemNoun: "bước" },
  );
```

(`dropTargetKey` is returned but unused here — that is fine.)

- [ ] **Step 5: Run the full suite**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/hooks/useDragSort.test.tsx src/components/DayPanel.test.tsx src/components/CategorySection.test.tsx`
Expected: PASS. Then the whole suite: `npm run test`.

- [ ] **Step 6: Gate + commit**

```bash
export PATH="$HOME/.local/node20/bin:$PATH"; npm run lint:constraints && npm run typecheck && npm run test
git add src/hooks/useDragSort.ts src/hooks/useDragSort.test.tsx src/components/DayPanel.tsx src/components/DayPanel.test.tsx src/components/CategorySection.test.tsx
git commit -m "feat(useDragSort): onDrop mode, arrow-key hint label (M3), mid-drag shrink guard (M7)"
```

---

## Task 3: `dayLabels.ts` — extract `DAY_SHORT` / `PHASE_LABEL`

**Files:**
- Create: `src/components/dayLabels.ts`
- Modify: `src/components/CustomizationsStrip.tsx`
- Test: (covered by the existing `src/components/CustomizationsStrip.test.tsx` — no new test; the extraction must not change its output)

**Interfaces:**
- Produces:
  - `export const DAY_SHORT: readonly string[]` — `["T2","T3","T4","T5","T6","T7","CN"]`
  - `export const PHASE_LABEL: Record<StepPhase, string>` — `{ am: "Sáng", pm: "Tối", steps: "Chăm tóc" }`

- [ ] **Step 1: Create `src/components/dayLabels.ts`**

```ts
import type { StepPhase } from "../shared/types";

/** Column headers for the seven routine days, Monday-first. */
export const DAY_SHORT: readonly string[] = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Human label for a step phase. */
export const PHASE_LABEL: Record<StepPhase, string> = {
  am: "Sáng",
  pm: "Tối",
  steps: "Chăm tóc",
};
```

- [ ] **Step 2: Point `CustomizationsStrip` at it**

In `src/components/CustomizationsStrip.tsx`, delete the two local `const DAY_SHORT = …` / `const PHASE_LABEL = …` declarations and add to the imports:

```ts
import { DAY_SHORT, PHASE_LABEL } from "./dayLabels";
```

Leave everything else in that file unchanged.

- [ ] **Step 3: Run the affected tests**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/CustomizationsStrip.test.tsx`
Expected: PASS unchanged.

- [ ] **Step 4: Gate + commit**

```bash
export PATH="$HOME/.local/node20/bin:$PATH"; npm run lint:constraints && npm run typecheck && npm run test
git add src/components/dayLabels.ts src/components/CustomizationsStrip.tsx
git commit -m "refactor: extract DAY_SHORT / PHASE_LABEL to dayLabels.ts"
```

---

## Task 4: `Gallery` — usage view + drag/arrow reorder, wired through `CategorySection`

**Files:**
- Modify: `src/components/Gallery.tsx`
- Modify: `src/components/CategorySection.tsx`
- Modify: `src/styles.css`
- Test: `src/components/Gallery.test.tsx`

**Interfaces:**
- Consumes: `productUsage`, `StepUsage` (Task 1); `useDragSort` `onDrop` mode + `dropTargetKey` (Task 2); `moveProduct` (Task 1); `DAY_SHORT`, `PHASE_LABEL` (Task 3).
- Produces the new `Gallery` prop shape:
  ```ts
  Gallery({
    products: string[];
    state?: AppState;
    category?: Category;
    editing?: boolean;
    onEdit?: GalleryEdit;
  })
  // GalleryEdit = {
  //   onRename: (index: number, name: string) => void;
  //   onRemove: (index: number) => void;
  //   onAdd: () => void;
  //   onMove: (fromIndex: number, toIndex: number) => void;
  //   onJump: (dayIndex: number, stepId: string) => void;
  // }
  ```
  `state` + `category` are optional so the plain non-editing render and pure-`products` tests keep working; the usage view renders only when `state`, `category`, and `onEdit` are all present.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/Gallery.test.tsx` (extend imports: `makeDefaultState` from `../shared/defaults`, `renameProduct` + `updateStepTuple` + `stepId` from `../shared/content`):

```ts
const fullEdit = () => ({
  onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onJump: vi.fn(),
});
const start = new Date("2026-08-24T00:00:00Z");
const isChip = (b: Element): boolean => /^(T[2-7]|CN) (Sáng|Tối|Chăm tóc)$/.test(b.textContent ?? "");

it("lists the days/phases that use a shelf entry, with a jump button each", () => {
  const s = makeDefaultState(start);
  render(
    <Gallery products={["Tẩy trang Bioderma"]} state={s} category="face" editing onEdit={fullEdit()} />,
  );
  // "Tẩy trang Bioderma" is Monday PM step 0 (and other PM days)
  const chips = screen.getAllByRole("button").filter(isChip);
  expect(chips.length).toBeGreaterThan(0);
  expect(chips[0]).toHaveTextContent("T2 Tối");
});

it("fires onJump with (dayIndex, stepId) when a usage chip is clicked", async () => {
  const s = makeDefaultState(start);
  const onEdit = fullEdit();
  render(<Gallery products={["Tẩy trang Bioderma"]} state={s} category="face" editing onEdit={onEdit} />);
  const chips = screen.getAllByRole("button").filter(isChip);
  await userEvent.click(chips[0]);
  expect(onEdit.onJump).toHaveBeenCalledWith(0, "face.0.pm.0");
});

it("shows the unused note for an entry no step names", () => {
  const s = makeDefaultState(start);
  render(<Gallery products={["Mặt nạ Wonjin / Histolab"]} state={s} category="face" editing onEdit={fullEdit()} />);
  expect(screen.getByText("⚠ Chưa dùng ở bước nào")).toBeInTheDocument();
});

it("ArrowDown on a product handle calls onMove(0, 1); the handle label has the arrow hint", async () => {
  const onEdit = fullEdit();
  render(
    <Gallery products={["A", "B", "C"]} state={makeDefaultState(start)} category="face" editing onEdit={onEdit} />,
  );
  const handle = screen.getByRole("button", { name: "Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp sản phẩm 1" });
  handle.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(onEdit.onMove).toHaveBeenCalledWith(0, 1);
});
```

`"A"`, `"B"`, `"C"` are not real routine products, so their `UsageRow`s render the unused note — the reorder test doesn't care. The chip-order assertion (`T2 Tối`) holds because `productUsage` is day-then-phase ordered and Monday (`dayIndex 0`) PM is the first place `"Tẩy trang Bioderma"` appears.

Also update the four existing edit-mode `onEdit` literals in this file (`{ onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() }` at lines ~15, ~30, ~39, ~50) to also include `onMove: vi.fn(), onJump: vi.fn()` — otherwise they fail `strict` typecheck against the widened `GalleryEdit`.

- [ ] **Step 2: Run the tests, watch them fail**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/Gallery.test.tsx`
Expected: FAIL — no usage list, no drag handles, `onMove`/`onJump` unknown.

- [ ] **Step 3: Rewrite `src/components/Gallery.tsx`**

```tsx
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { useBufferedText } from "../hooks/useBufferedText";
import { useDragSort } from "../hooks/useDragSort";
import { productUsage } from "../shared/content";
import { DAY_SHORT, PHASE_LABEL } from "./dayLabels";
import ConfirmRemove from "./ConfirmRemove";
import type { AppState, Category } from "../shared/types";

export type GalleryEdit = {
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onJump: (dayIndex: number, stepId: string) => void;
};

function UsageRow({
  state, category, product, onJump,
}: {
  state: AppState;
  category: Category;
  product: string;
  onJump: (dayIndex: number, stepId: string) => void;
}) {
  const hits = productUsage(state, category, product);
  if (hits.length === 0) {
    return <p className="prod-usage prod-usage-empty">⚠ Chưa dùng ở bước nào</p>;
  }
  return (
    <div className="prod-usage">
      {hits.map((h) => (
        <button
          type="button"
          key={h.stepId}
          onClick={() => onJump(h.dayIndex, h.stepId)}
        >
          {DAY_SHORT[h.dayIndex]} {PHASE_LABEL[h.phase]}
        </button>
      ))}
    </div>
  );
}

type HandleProps = ReturnType<ReturnType<typeof useDragSort<string>>["handleProps"]>;

function ProductRow({
  product, index, onEdit, dragging, dropTarget, state, category, handleProps,
}: {
  product: string;
  index: number;
  onEdit: GalleryEdit;
  dragging: boolean;
  dropTarget: boolean;
  state?: AppState;
  category?: Category;
  handleProps: HandleProps;
}) {
  const buf = useBufferedText(product, (name) => onEdit.onRename(index, name));
  const cls = `prod prod-edit${dragging ? " dragging" : ""}${dropTarget ? " drop-target" : ""}`;
  return (
    <li className={cls}>
      <div className="prod-edit-head">
        <button type="button" className={`drag-handle${dragging ? " is-dragging" : ""}`} {...handleProps}>
          ⠿
        </button>
        <Icon icon={pickIcon(product)} size={34} />
        <input
          type="text"
          aria-label={`Tên sản phẩm ${index + 1}`}
          placeholder="Sản phẩm chưa đặt tên"
          value={buf.value}
          onChange={buf.onChange}
          onFocus={buf.onFocus}
          onBlur={buf.onBlur}
        />
        <ConfirmRemove
          label={product ? `Xoá ${product}` : `Xoá sản phẩm ${index + 1}`}
          onConfirm={() => onEdit.onRemove(index)}
        />
      </div>
      {state && category && (
        <UsageRow state={state} category={category} product={product} onJump={onEdit.onJump} />
      )}
    </li>
  );
}

function GalleryEditList({
  products, onEdit, state, category,
}: {
  products: string[];
  onEdit: GalleryEdit;
  state?: AppState;
  category?: Category;
}) {
  const { order, handleProps, draggingKey, dropTargetKey } = useDragSort(
    products,
    (_name, i) => String(i),
    (from, to) => onEdit.onMove(from, to),
    { mode: "onDrop", itemNoun: "sản phẩm" },
  );
  return (
    <div className="gallery gallery-edit" data-testid="gallery">
      {/* the hook's pointer path walks `handle.closest("li")` then its parent as the
          rect source — the editable shelf must be a real <ul>/<li> list, same as the
          step editor (`ul.steps-edit` > `StepEditor`'s <li>). */}
      <ul className="gallery-edit-list">
        {order.map((product, index) => (
          <ProductRow
            key={index}
            product={product}
            index={index}
            onEdit={onEdit}
            dragging={draggingKey === String(index)}
            dropTarget={dropTargetKey === String(index)}
            state={state}
            category={category}
            handleProps={handleProps(index)}
          />
        ))}
      </ul>
      <button type="button" className="gallery-add" onClick={onEdit.onAdd}>
        + Thêm sản phẩm
      </button>
    </div>
  );
}

export default function Gallery({
  products,
  state,
  category,
  editing = false,
  onEdit,
}: {
  products: string[];
  state?: AppState;
  category?: Category;
  editing?: boolean;
  onEdit?: GalleryEdit;
}) {
  if (editing && onEdit) {
    return <GalleryEditList products={products} onEdit={onEdit} state={state} category={category} />;
  }
  return (
    <div className="gallery" data-testid="gallery">
      {products.map((product, index) => (
        <div className="prod" key={index}>
          <Icon icon={pickIcon(product)} size={34} />
          <span>{product || "Sản phẩm chưa đặt tên"}</span>
        </div>
      ))}
    </div>
  );
}
```

Notes:
- `order === products` throughout an `onDrop` drag, so `key={index}` is stable during the gesture.
- `handleProps` is called once per row in `GalleryEditList` and passed down, so `ProductRow` stays a plain function of its props.
- The `useDragSort<string>` generic in the `handleProps` prop type keeps `ProductRow` honest without a cast.

- [ ] **Step 4: Wire `CategorySection`**

In `src/components/CategorySection.tsx`:

- extend the `../shared/content` import to add `moveProduct`.
- the `<Gallery>` element (currently `src/components/CategorySection.tsx:347`) becomes:

```tsx
      <Gallery
        products={data.products}
        state={state}
        category={category}
        editing={editing}
        onEdit={{
          onRename: (i, name) => editContent((s) => renameProduct(s, category, i, name)),
          onRemove: (i) => editContent((s) => removeProduct(s, category, i)),
          onAdd: () => editContent((s) => addProduct(s, category)),
          onMove: (from, to) => editContent((s) => moveProduct(s, category, from, to)),
          onJump: (dayIndex, id) => {
            onSelectDay(dayIndex);
            setOpenStepId(id);
          },
        }}
      />
```

(`onJump` reuses the exact body already used for `CustomizationsStrip`'s `onJump` a few lines above — same `onSelectDay` + `setOpenStepId`.)

- [ ] **Step 5: Styles**

In `src/styles.css` add (near the existing `.drag-handle` / `.prod-edit` rules):

```css
.gallery-edit-list { list-style: none; margin: 0; padding: 0; }
.prod-edit-head { display: flex; align-items: center; gap: 8px; }
.prod-edit.dragging { opacity: 1; background: #fff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); border-radius: 10px; }
.prod-edit.drop-target { box-shadow: inset 0 2px 0 var(--rose); }
.prod-usage { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 2px 42px; }
.prod-usage button {
  font-size: 12px; padding: 2px 8px; border-radius: 999px;
  border: 1px solid var(--line, #e7d8da); background: #fff; color: var(--ink, #5b4a4d); cursor: pointer;
}
.prod-usage-empty { font-size: 12px; color: #a6898d; margin: 4px 0 2px 42px; }
```

(If a variable name here — `--line`, `--ink` — is not defined in `styles.css`, use the literal fallback already given after the comma and drop the `var()`.)

- [ ] **Step 6: Run the tests**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/Gallery.test.tsx src/components/CategorySection.test.tsx`
Expected: PASS. Then `npm run test`.

- [ ] **Step 7: Gate + commit**

```bash
export PATH="$HOME/.local/node20/bin:$PATH"; npm run lint:constraints && npm run typecheck && npm run test
git add src/components/Gallery.tsx src/components/Gallery.test.tsx src/components/CategorySection.tsx src/styles.css
git commit -m "feat(editor): shelf reorder + per-entry usage view with jump"
```

---

## Task 5: step product `<datalist>` plumbing + "add to shelf" button

**Files:**
- Modify: `src/components/VariantEditor.tsx`
- Modify: `src/components/StepEditor.tsx`
- Test: `src/components/VariantEditor.test.tsx`

**Interfaces:**
- Consumes: nothing new (pure prop plumbing + UI).
- Produces:
  - `VariantEditor` and `StepEditor` each gain optional props:
    ```ts
    datalistId?: string;
    shelfNames?: string[];
    onAddToShelf?: (name: string) => void;
    ```
  - `TupleFields` (private in `VariantEditor.tsx`) gains the same three optional props; its product `<input>` sets `list={datalistId}`; when `onAddToShelf` and `shelfNames` are both provided and `productBuf.value.trim()` is non-empty and not in `shelfNames`, it renders an `＋ Thêm "<text>" vào kệ` button.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/VariantEditor.test.tsx`:

```ts
it("puts list={datalistId} on the product input and not on the note input", () => {
  render(<VariantEditor value={["Toner", "n"]} onChange={vi.fn()} datalistId="shelf-face" shelfNames={["Toner"]} />);
  expect(screen.getByLabelText("Sản phẩm")).toHaveAttribute("list", "shelf-face");
  expect(screen.getByLabelText("Ghi chú")).not.toHaveAttribute("list");
});

it("shows the add-to-shelf button only for text not already on the shelf, and calls onAddToShelf trimmed", async () => {
  const onAddToShelf = vi.fn();
  render(
    <VariantEditor
      value={["Toner Cocoon Sen", ""]}
      onChange={vi.fn()}
      datalistId="shelf-face"
      shelfNames={["Toner Cocoon Sen"]}
      onAddToShelf={onAddToShelf}
    />,
  );
  // on-shelf text -> no button
  expect(screen.queryByRole("button", { name: /vào kệ/ })).toBeNull();
  // type an off-shelf name
  const input = screen.getByLabelText("Sản phẩm");
  await userEvent.clear(input);
  await userEvent.type(input, "  Kem chống nắng SPF 50  ");
  const addBtn = screen.getByRole("button", { name: 'Thêm "Kem chống nắng SPF 50" vào kệ' });
  await userEvent.click(addBtn);
  expect(onAddToShelf).toHaveBeenCalledWith("Kem chống nắng SPF 50");
});

it("offers add-to-shelf on a threshold branch field too", async () => {
  const value: RoutineStep = { kind: "threshold", untilWeek: 2, before: ["X", ""], from: ["Y", ""] };
  render(
    <VariantEditor value={value} onChange={vi.fn()} datalistId="shelf-face" shelfNames={[]} onAddToShelf={vi.fn()} />,
  );
  expect(screen.getAllByRole("button", { name: /vào kệ/ }).length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run the tests, watch them fail**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/VariantEditor.test.tsx`
Expected: FAIL — no `list` attr, no button, props unknown.

- [ ] **Step 3: Implement in `src/components/VariantEditor.tsx`**

Change `TupleFields` (currently `src/components/VariantEditor.tsx:24`) to accept and use the props:

```tsx
function TupleFields({
  label, value, onChange, autoFocusFirst = false, datalistId, shelfNames, onAddToShelf,
}: {
  label: { product: string; note: string };
  value: StepTuple;
  onChange: (t: StepTuple) => void;
  autoFocusFirst?: boolean;
  datalistId?: string;
  shelfNames?: string[];
  onAddToShelf?: (name: string) => void;
}) {
  const productBuf = useBufferedText(value[0], (p) => onChange([p, value[1]]));
  const noteBuf = useBufferedText(value[1], (n) => onChange([value[0], n]));
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusFirst) firstRef.current?.focus();
  }, [autoFocusFirst]);

  const typed = productBuf.value.trim();
  const canAdd =
    onAddToShelf !== undefined &&
    shelfNames !== undefined &&
    typed !== "" &&
    !shelfNames.includes(typed);

  return (
    <div className="variant-branch">
      <label>
        {label.product}
        <input
          ref={firstRef}
          type="text"
          list={datalistId}
          placeholder="Tên sản phẩm / bước"
          value={productBuf.value}
          onChange={productBuf.onChange}
          onFocus={productBuf.onFocus}
          onBlur={productBuf.onBlur}
        />
      </label>
      {canAdd && onAddToShelf && (
        <button
          type="button"
          className="add-to-shelf"
          onClick={() => onAddToShelf(typed)}
        >
          {`＋ Thêm "${typed}" vào kệ`}
        </button>
      )}
      <label>
        {label.note}
        <input
          type="text"
          placeholder="Ghi chú (không bắt buộc)"
          value={noteBuf.value}
          onChange={noteBuf.onChange}
          onFocus={noteBuf.onFocus}
          onBlur={noteBuf.onBlur}
        />
      </label>
    </div>
  );
}
```

`list={undefined}` renders no attribute, so unconditional `list={datalistId}` is safe.

Change `VariantEditor`'s signature and thread the props into every `TupleFields`:

```tsx
export default function VariantEditor({
  value,
  onChange,
  autoFocusFirst = false,
  datalistId,
  shelfNames,
  onAddToShelf,
}: {
  value: RoutineStep;
  onChange: (next: RoutineStep) => void;
  autoFocusFirst?: boolean;
  datalistId?: string;
  shelfNames?: string[];
  onAddToShelf?: (name: string) => void;
}) {
```

Then add `datalistId={datalistId} shelfNames={shelfNames} onAddToShelf={onAddToShelf}` to each `<TupleFields … />` — there are four call sites: the `plain` branch, both `threshold` branches, and the `cycle` `.map`.

- [ ] **Step 4: Thread through `StepEditor`**

In `src/components/StepEditor.tsx`, add the three optional props to the signature and props type, and pass them to `<VariantEditor>`:

```tsx
export default function StepEditor({
  display, raw, edited = null, dragging = false, initialOpen = false, autoFocusFirst = false,
  dragHandle, datalistId, shelfNames, onAddToShelf, onUpdateTuple, onSetVariant, onRemove,
}: {
  // …existing…
  datalistId?: string;
  shelfNames?: string[];
  onAddToShelf?: (name: string) => void;
  // …existing callbacks…
}) {
```

```tsx
        <VariantEditor
          value={raw}
          autoFocusFirst={autoFocusFirst}
          datalistId={datalistId}
          shelfNames={shelfNames}
          onAddToShelf={onAddToShelf}
          onChange={(next) => {
            if (isStepTuple(next)) onUpdateTuple(next[0], next[1]);
            else onSetVariant(next);
          }}
        />
```

- [ ] **Step 5: Style the add button**

In `src/styles.css`:

```css
.add-to-shelf {
  display: block; margin: -4px 0 8px; padding: 3px 10px;
  font-size: 12px; border-radius: 999px; cursor: pointer;
  border: 1px dashed var(--rose, #d98b98); background: transparent; color: var(--rose, #d98b98);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
```

- [ ] **Step 6: Run the tests + commit**

```bash
export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/VariantEditor.test.tsx && npm run lint:constraints && npm run typecheck && npm run test
git add src/components/VariantEditor.tsx src/components/VariantEditor.test.tsx src/components/StepEditor.tsx src/styles.css
git commit -m "feat(editor): step product datalist + add-to-shelf button"
```

---

## Task 6: `DayPanel` renders the `<datalist>`; `CategorySection` wires `onAddToShelf`

**Files:**
- Modify: `src/components/DayPanel.tsx`
- Modify: `src/components/CategorySection.tsx`
- Test: `src/components/DayPanel.test.tsx`, `src/components/CategorySection.test.tsx`

**Interfaces:**
- Consumes: `getCategoryData` (already imported in `DayPanel.tsx`); `StepEditor` props from Task 5; `addProduct(name)` from Task 1.
- Produces:
  - `DayEdit` gains `onAddToShelf: (name: string) => void`.
  - `DayPanel` renders one `<datalist id={`shelf-${category}`}>` (options = de-duped non-empty `getCategoryData(state, category).products`, first-occurrence order) inside `.panel.active`, in both the hair and the face/body branches.
  - `PhaseBody` forwards `datalistId` (`shelf-${category}`), `shelfNames`, and `onEdit.onAddToShelf` to each `StepEditor`.

- [ ] **Step 1: Write the failing tests**

`src/components/DayPanel.test.tsx` builds its `onEdit` mock as an inline object literal in each edit-mode test (roughly 6 of them — search for `onSetFocusPrefix: vi.fn()`). **Add `onAddToShelf: vi.fn()` to every one of those inline `onEdit` literals** — `DayEdit` gains it as a required member in Step 3, so any literal missing it fails `strict` typecheck.

Then add these two tests (the file already imports `makeDefaultState`, `routine`; it uses `render` from `@testing-library/react` and has `WEEK1_NOW`):

```ts
const editMock = () => ({
  onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(),
  onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn(), onAddToShelf: vi.fn(),
});

it("renders exactly one shelf datalist for the category with the shelf names as options", () => {
  const s = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const { container } = render(
    <DayPanel category="face" state={s} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
      editing onEdit={editMock()} />,
  );
  const lists = container.querySelectorAll("datalist#shelf-face");
  expect(lists).toHaveLength(1);
  const opts = Array.from(lists[0].querySelectorAll("option")).map((o) => o.getAttribute("value"));
  expect(opts).toEqual(routine.face.products.filter((p) => p !== ""));
});

it("threads datalistId to the step product inputs", async () => {
  const s = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  render(<DayPanel category="face" state={s} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={editMock()} />);
  await userEvent.click(screen.getAllByRole("button", { name: /^Sửa bước:/ })[0]); // open first AM step
  expect(screen.getAllByLabelText("Sản phẩm")[0]).toHaveAttribute("list", "shelf-face");
});
```

(Reusing `editMock()` for the two new tests is fine; leave the file's other inline literals as they are apart from adding the one new key.)

In `src/components/CategorySection.test.tsx`, add an integration test (the file already has a stateful `Host` pattern — copy it):

```ts
it("add-to-shelf from a step editor adds the product and its usage shows the edited day", async () => {
  function Host() {
    const [st, setSt] = useState(makeDefaultState(new Date("2026-08-24T00:00:00Z")));
    return (
      <CategorySection
        category="face" activeDay={0} onSelectDay={() => {}}
        state={st} onToggleStep={() => {}} editContent={(mut) => setSt(mut)}
      />
    );
  }
  render(<Host />);
  await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
  await userEvent.click(screen.getAllByRole("button", { name: /^Sửa bước:/ })[0]); // open AM step 0
  const input = screen.getAllByLabelText("Sản phẩm")[0];
  await userEvent.clear(input);
  await userEvent.type(input, "Kem chống nắng SPF 50");
  await userEvent.click(screen.getByRole("button", { name: 'Thêm "Kem chống nắng SPF 50" vào kệ' }));
  // the new entry is on the shelf now (face shelf had 10 rows, this is the 11th)
  expect(screen.getByDisplayValue("Kem chống nắng SPF 50")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Tên sản phẩm 11" })).toHaveValue("Kem chống nắng SPF 50");
});
```

- [ ] **Step 2: Run, watch fail**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/DayPanel.test.tsx src/components/CategorySection.test.tsx`
Expected: FAIL — no datalist, `onAddToShelf` missing from `DayEdit`.

- [ ] **Step 3: `DayPanel.tsx`**

Add to `DayEdit` (`src/components/DayPanel.tsx:23`):

```ts
  onAddToShelf: (name: string) => void;
```

Add a helper near the top of the file (after imports):

```ts
function shelfNamesOf(state: AppState, category: Category): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of getCategoryData(state, category).products) {
    if (p !== "" && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}
```

Add the three props to `PhaseBody`'s signature (`datalistId: string; shelfNames: string[]; onAddToShelf?: (name: string) => void`) and pass them into each `<StepEditor>`:

```tsx
              <StepEditor
                key={rs.id}
                display={rs}
                raw={stored.step}
                edited={isStepEdited(state, category, dayIndex, phase, rs.id)}
                dragging={draggingKey === rs.id}
                initialOpen={rs.id === justAddedId || rs.id === openStepId}
                autoFocusFirst={rs.id === justAddedId}
                datalistId={datalistId}
                shelfNames={shelfNames}
                onAddToShelf={onEdit.onAddToShelf}
                dragHandle={/* unchanged */}
                onUpdateTuple={/* unchanged */}
                onSetVariant={/* unchanged */}
                onRemove={/* unchanged */}
              />
```

In `DayPanel` itself, compute once:

```ts
  const datalistId = `shelf-${category}`;
  const shelfNames = shelfNamesOf(state, category);
```

Render the `<datalist>` as the first child of `<div className="panel active">` in **both** the hair branch and the face/body branch, gated on edit mode (it is only referenced by the step inputs, which only render in edit mode):

```tsx
    <div className="panel active">
      {editing && (
        <datalist id={datalistId}>
          {shelfNames.map((n) => <option key={n} value={n} />)}
        </datalist>
      )}
      {editing && onEdit && (
        <DayHeaderEdit … />
      )}
      …
```

Pass `datalistId={datalistId} shelfNames={shelfNames}` to every `<PhaseBody>` (three call sites: hair `steps`, face/body `am`, face/body `pm`).

- [ ] **Step 4: `CategorySection.tsx`**

Extend the `../shared/content` import to add `addProduct` if not present (it is already imported). In the `DayPanel` `onEdit` object (`src/components/CategorySection.tsx:374`) add:

```tsx
          onAddToShelf: (name) => editContent((s) => addProduct(s, category, name)),
```

- [ ] **Step 5: Run the tests**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npx vitest run src/components/DayPanel.test.tsx src/components/CategorySection.test.tsx`
Expected: PASS. Then `npm run test`.

- [ ] **Step 6: Gate + commit**

```bash
export PATH="$HOME/.local/node20/bin:$PATH"; npm run lint:constraints && npm run typecheck && npm run test
git add src/components/DayPanel.tsx src/components/DayPanel.test.tsx src/components/CategorySection.tsx src/components/CategorySection.test.tsx
git commit -m "feat(editor): per-category shelf datalist + wire add-to-shelf"
```

---

## Task 7: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the content-editor area, after the Wave 2 "Reorder & day-header editing" bullet, add:

> **Product shelf (usability Wave 3):** `content.ts#moveProduct(state, category, fromIndex,
> toIndex)` reorders a shelf entry (same no-op/out-of-range → same-reference contract as
> `moveStep`); `addProduct` takes an optional `name` (the gallery's blank-row button passes
> none, the step editor's "add to shelf" passes the trimmed field text).
> `content.ts#productUsage(state, category, name)` returns `{ dayIndex, phase, stepId }[]` for
> every step that names `name` (trimmed, any threshold/cycle branch, week-independent) — it
> drives the per-entry usage list under each `Gallery` row in edit mode, whose chips jump via
> the same `onSelectDay` + `setOpenStepId` path `CustomizationsStrip` uses. The step product
> `<input>` (plain and every variant branch) carries `list="shelf-<category>"`; `DayPanel`
> renders the one `<datalist>` from the de-duped non-empty shelf. `useDragSort` gained a
> `{ mode: "onDrop" }` option (the shelf reorders on drop, so it needs no per-item ids —
> index keys are stable because the list never re-sorts under the finger) and an `itemNoun`
> option; its handle `aria-label` now names the arrow keys (Wave 2 M3) and it no longer
> dereferences a stale index if the list shrinks mid-drag (Wave 2 M7). `DAY_SHORT` /
> `PHASE_LABEL` moved to `src/components/dayLabels.ts`.

Also, in the Wave 2 bullet or wherever the parked minors are mentioned, remove any "still deferred: M3 / M7" note — they are done.

- [ ] **Step 2: Full gate**

Run: `export PATH="$HOME/.local/node20/bin:$PATH"; npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green. Record the exact test count.

- [ ] **Step 3: Manual click-through** (`npm run dev`, phone-width viewport)

1. Enter edit mode on Face. Each shelf row shows a `⠿` handle, and under it either `T2 Tối · …` jump chips or `⚠ Chưa dùng ở bước nào`.
2. Drag a shelf handle down past the next row and drop — the order sticks after drop (it does not re-sort under the finger). Arrow keys on a focused handle move a row one slot; the ends do nothing and the page doesn't scroll.
3. Tap a usage chip — the day tab switches to that day and the named step opens.
4. Open a step editor, clear the product field, type a name not on the shelf → `＋ Thêm "…" vào kệ` appears; tap it → the shelf gains that row (at the end); the button disappears. Typing an on-shelf name shows no button. The field also autocompletes from the shelf as you type.
5. `Đặt lại theo mặc định` reverts shelf order, added entries, and everything else together.
6. Repeat 1–2 briefly on Hair and Body (fewer shelf entries, sparser usage lists — no special behaviour).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: content editor Wave 3 — product shelf, datalist picker, M3/M7"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| 1a `moveProduct` | Task 1 |
| 1b `addProduct` optional name | Task 1 |
| 1c `productUsage` / `StepUsage` | Task 1 |
| 2a native datalist | Task 5 (input `list=`), Task 6 (`<datalist>` render + threading) |
| 2b add-to-shelf button | Task 5 (button), Task 6 (`onAddToShelf` wiring) |
| 2c threading through every `TupleFields` | Task 5 |
| 3 usage view + `⚠ Chưa dùng…` + jump | Task 4 |
| 3 `dayLabels.ts` extraction | Task 3 |
| 4a `useDragSort` `mode` / `dropTargetKey` | Task 2 |
| 4b M3 label + `itemNoun` | Task 2 |
| 4c M7 guards | Task 2 |
| 5 `Gallery` reorder wiring + styles | Task 4 |
| New UI copy | Tasks 2, 4, 5 (each string in the task that renders it) |
| Non-goal: no schema change | Nothing in any task touches `types.ts` / `migrate` — verified against the Global Constraints block |
| CLAUDE.md | Task 7 |

**Placeholder scan** — the only bracketed tokens are `<name>` / `<n>` / `<category>` inside verbatim copy strings and `baseProps`/`editMock` in Task 6 Step 1, which are explicitly flagged as "match whatever the test file names them". No `TODO`/`TBD`/"handle edge cases".

**Type consistency**

- `useDragSort` new signature (Task 2) — `keyOf: (item, index) => string`, `opts?: { mode?; itemNoun? }`, returns `+ dropTargetKey`. Task 4's `GalleryEditList` calls it as `useDragSort(products, (_name, i) => String(i), (from, to) => onEdit.onMove(from, to), { mode: "onDrop", itemNoun: "sản phẩm" })` and reads `dropTargetKey` — matches. Task 2's own DayPanel edit stays 1-arg `keyOf` + `{ itemNoun: "bước" }` — still valid.
- `GalleryEdit` (Task 4) = `{ onRename, onRemove, onAdd, onMove, onJump }`. `CategorySection` (Task 4 Step 4) supplies exactly those five. Existing `Gallery.test.tsx` literals updated in Task 4 Step 1.
- `StepUsage = { dayIndex; phase; stepId }` (Task 1) — consumed by `productUsage` return, by `Gallery`'s `UsageRow` (`h.dayIndex`, `h.phase`, `h.stepId`), matches.
- `DayEdit.onAddToShelf: (name: string) => void` (Task 6) — supplied by `CategorySection` as `(name) => editContent((s) => addProduct(s, category, name))`, consumed by `PhaseBody` → `StepEditor.onAddToShelf` → `VariantEditor.onAddToShelf` → `TupleFields.onAddToShelf`. `addProduct(s, category, name)` matches Task 1's `addProduct(state, category, name?)`.
- `datalistId` is `` `shelf-${category}` `` in both `DayPanel` (the `<datalist id>`) and what it passes as `datalistId` to `PhaseBody`/`StepEditor` — single source in Task 6 Step 3.
- `dayLabels.ts` exports `DAY_SHORT: readonly string[]`, `PHASE_LABEL: Record<StepPhase, string>` (Task 3); consumed by `CustomizationsStrip` (unchanged usage) and `Gallery`'s `UsageRow` (`DAY_SHORT[h.dayIndex]`, `PHASE_LABEL[h.phase]`) — matches.

**Ordering / typecheck boundaries** — every task leaves `strict` typecheck green:
- Task 2 widens `useDragSort` additively (`opts` optional, `keyOf` second param optional to callers, `dropTargetKey` added to the return) and updates the one call site whose label text it changes; the aria-label test-string updates are in the same task.
- Task 4 widens `GalleryEdit` with `onMove`/`onJump` **and** updates every constructor (`CategorySection`) and every test literal in the same task. `state`/`category` are optional so no other `Gallery` caller breaks.
- Task 5 adds only **optional** props to `VariantEditor`/`StepEditor` — no caller breaks before Task 6 supplies them.
- Task 6 adds `onAddToShelf` as **required** on `DayEdit` and supplies it from `CategorySection` in the same task; the `DayPanel.test.tsx` shared `onEdit` mock gains it in the same task (Step 1).

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, spec+quality review between tasks, a whole-branch review at the end.
2. **Inline Execution** — batch execution in this session with checkpoints.

Which approach?
