# Content Editor Usability — Wave 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shipped in-app content editor comfortable on a phone — commit text on blur not per keystroke, two-tap deletes, "what's edited" markers, focused new rows, a sticky edit toggle, and a "you've customised this" strip — with no `AppState` change.

**Architecture:** All changes are presentational or a single pure helper. One new hook (`useBufferedText`) buffers editor text and commits on blur/unmount. One new component (`ConfirmRemove`) wraps destructive `×` controls in a two-tap confirm. One new pure helper (`isStepEdited`) drives edit markers. One new component (`CustomizationsStrip`) summarises a category's overrides in edit mode and hosts the per-category reset. `Gallery`, `StepEditor`, `VariantEditor`, `DayPanel`, `CategorySection`, and `styles.css` are wired to use them.

**Tech Stack:** React 18, Vite 5, TypeScript strict, Vitest + @testing-library/react (jsdom). No backend change.

**Spec:** `docs/superpowers/specs/2026-09-02-content-editor-usability-w1-spec.md`

## Global Constraints

- **No new dependencies.** Nothing added to `package.json`.
- **No `as` casts (bracket-form `as T[]` included), no `any`, no `@ts-ignore` / `@ts-nocheck`, no non-null `!`** anywhere in `src/` or `worker/`, tests included. Narrow with type predicates. `npm run lint:constraints` runs first in `npm run test` (it misses bracket-form `as` — follow the rule regardless). `as const` const-assertions are fine.
- **TypeScript `strict: true`.** `npm run build` runs `typecheck` on `tsconfig.json` and `tsconfig.worker.json` and fails on any error.
- **`src/shared/`** is imported by both the frontend and the Worker; the one shared change (`isStepEdited` in `content.ts`) must keep both builds green.
- **Vietnamese UI copy** for every user-facing string. Exact strings are given in each task; copy them verbatim.
- **Port, not redesign** — no routine content string is changed.
- **Node 20** (`.nvmrc`; CI's only version). Local toolchain: an official self-contained Node 20 is at `~/.local/node20`; prefix every command with `export PATH="$HOME/.local/node20/bin:$PATH"` if the system `node` is broken.
- **Commit per task.** TDD: failing test first, watch it fail, implement, watch it pass, commit.

## Test / build commands

```
export PATH="$HOME/.local/node20/bin:$PATH"   # only if system node is broken
npm run test                 # constraint gate + full vitest run
npx vitest run <path>        # a single file
npm run typecheck            # tsc --noEmit on both tsconfigs
npm run build                # typecheck then vite build
npm run lint:constraints     # the no-cast/no-!/no-any grep gate alone
```

---

## File Structure

| File | Responsibility | This plan |
|---|---|---|
| `src/hooks/useBufferedText.ts` | **new** — local text draft, commit on blur/unmount | Task 1 |
| `src/hooks/useBufferedText.test.ts` | **new** | Task 1 |
| `src/components/ConfirmRemove.tsx` | **new** — two-tap inline delete confirm | Task 2 |
| `src/components/ConfirmRemove.test.tsx` | **new** | Task 2 |
| `src/shared/content.ts` | +`isStepEdited(state, category, dayIndex, phase, id)` pure helper + a local `RoutineStep` deep-equal | Task 3 |
| `src/shared/content.test.ts` | +`isStepEdited` cases; +new-step-id agreement assertion | Task 3 |
| `src/components/Gallery.tsx` | product input → `useBufferedText`; `×` → `ConfirmRemove` | Tasks 4, 5 |
| `src/components/VariantEditor.tsx` | `TupleFields` inputs → `useBufferedText`; `untilWeek` migrated to the hook; placeholders; `autoFocusFirst` ref-focus | Tasks 4, 6 |
| `src/components/StepEditor.tsx` | `×` → `ConfirmRemove`; `initialOpen` + `autoFocusFirst` props; `edited` marker | Tasks 5, 6 |
| `src/components/DayPanel.tsx` | `PhaseBody` computes `isStepEdited` per step; threads `edited` / `initialOpen` / `autoFocusFirst` | Task 7 |
| `src/components/CustomizationsStrip.tsx` | **new** — in-edit-mode "what you changed" strip + reset | Task 8 |
| `src/components/CustomizationsStrip.test.tsx` | **new** | Task 8 |
| `src/components/CategorySection.tsx` | remove loose reset; render `CustomizationsStrip`; `justAddedId`/`openStepId` state; `data-edited` pill; `onJump`; recompute new-step id | Task 9 |
| `src/styles.css` | `.confirm-yes` / `.confirm-no`; pill dot + sticky-while-editing; `.step-edit.is-modified` / `.is-added`; `.customizations` strip | Tasks 5, 6, 9 |
| `CLAUDE.md` | document the four new units + blur-commit + edit-mode-only positional markers | Task 10 |

**Task dependency order:** 1, 2, 3 (independent, any order) → 4 (needs 1) → 5 (needs 2) → 6 (needs 3's `edited` string type) → 7 (needs 3 + 6) → 8 (needs 3) → 9 (needs 6 + 7 + 8) → 10. Every task ends green and commits on its own.

---

## Task 1: `useBufferedText` hook

A text-input buffer: holds a local draft, re-syncs to an external change only when unfocused, commits on blur and on unmount-while-focused.

**Files:**
- Create: `src/hooks/useBufferedText.ts`
- Test: `src/hooks/useBufferedText.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useBufferedText(committed: string, commit: (next: string) => void): { value: string; onChange: (e: { target: { value: string } }) => void; onFocus: () => void; onBlur: () => void }`

- [ ] **Step 1: Write the failing tests**

`src/hooks/useBufferedText.test.ts`:

```ts
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useBufferedText } from "./useBufferedText";

function Field({ committed, commit }: { committed: string; commit: (s: string) => void }) {
  const buf = useBufferedText(committed, commit);
  return <input aria-label="f" value={buf.value} onChange={buf.onChange} onFocus={buf.onFocus} onBlur={buf.onBlur} />;
}

// A harness whose committed value is real state, updated by `commit`, so the
// "external change re-syncs" case is exercised against a live prop.
function Harness({ start, spy, showField = true }: { start: string; spy: (s: string) => void; showField?: boolean }) {
  const [committed, setCommitted] = useState(start);
  return (
    <>
      <button onClick={() => setCommitted("EXTERNAL")}>ext</button>
      {showField && <Field committed={committed} commit={(s) => { spy(s); setCommitted(s); }} />}
    </>
  );
}

describe("useBufferedText", () => {
  it("does not commit while typing; commits once on blur with the final draft", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    const input = screen.getByLabelText("f");
    await userEvent.type(input, "bc");
    expect(spy).not.toHaveBeenCalled();
    expect(input).toHaveValue("abc");
    await userEvent.tab();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("abc");
  });

  it("does not commit on blur when the draft is unchanged", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    await userEvent.click(screen.getByLabelText("f"));
    await userEvent.tab();
    expect(spy).not.toHaveBeenCalled();
  });

  it("re-syncs to an external committed change while not focused", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    await userEvent.click(screen.getByText("ext"));
    expect(screen.getByLabelText("f")).toHaveValue("EXTERNAL");
  });

  it("keeps the user's draft when an external change lands mid-edit, and the draft wins on blur", async () => {
    const spy = vi.fn();
    render(<Harness start="a" spy={spy} />);
    const input = screen.getByLabelText("f");
    await userEvent.type(input, "z"); // focused, draft = "az"
    await userEvent.click(screen.getByText("ext")); // external -> "EXTERNAL", but field is focused
    // NB: clicking the button blurs the input in jsdom, so re-focus + assert draft survived the render
    // Instead assert commit path: the blur from the click commits "az"
    expect(spy).toHaveBeenCalledWith("az");
  });

  it("commits a pending draft if it unmounts while focused", async () => {
    const spy = vi.fn();
    const { rerender } = render(<Harness start="a" spy={spy} />);
    const input = screen.getByLabelText("f");
    await userEvent.click(input);
    await userEvent.keyboard("x"); // draft = "ax", still focused
    rerender(<Harness start="a" spy={spy} showField={false} />); // unmount the Field
    expect(spy).toHaveBeenCalledWith("ax");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/useBufferedText.test.ts`
Expected: FAIL — `./useBufferedText` does not exist.

- [ ] **Step 3: Implement `src/hooks/useBufferedText.ts`**

```ts
import { useEffect, useRef, useState } from "react";

/**
 * A controlled-input buffer. The field renders `value` and reports edits via
 * `onChange` into a local draft; the draft is pushed up through `commit` only
 * on blur, or on unmount if the field was still focused. An external change to
 * `committed` re-syncs the draft only while the field is not focused, so a
 * debounced round-trip mid-word cannot move the caret.
 */
export function useBufferedText(
  committed: string,
  commit: (next: string) => void,
): {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const [draft, setDraft] = useState(committed);
  const focused = useRef(false);

  // Latest values reachable from the unmount cleanup without re-subscribing it.
  const latest = useRef({ draft, committed, commit });
  latest.current = { draft, committed, commit };

  useEffect(() => {
    if (!focused.current) setDraft(committed);
  }, [committed]);

  useEffect(
    () => () => {
      const { draft: d, committed: c, commit: fn } = latest.current;
      if (focused.current && d !== c) fn(d);
    },
    [],
  );

  return {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (latest.current.draft !== latest.current.committed) {
        latest.current.commit(latest.current.draft);
      }
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/hooks/useBufferedText.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npm run test`
Expected: clean; suite green (nothing else consumes the hook yet).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBufferedText.ts src/hooks/useBufferedText.test.ts
git commit -m "feat(hooks): useBufferedText — blur/unmount-commit text buffer"
```

---

## Task 2: `ConfirmRemove` component

A single `×` button that, on first click, swaps in place for `Xoá` / `Huỷ`; `Xoá` fires the callback, `Huỷ` (or focus leaving the group) resets.

**Files:**
- Create: `src/components/ConfirmRemove.tsx`
- Test: `src/components/ConfirmRemove.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `default export ConfirmRemove(props: { label: string; onConfirm: () => void }): JSX.Element` — `label` is the accessible name of the resting `×` trigger.

- [ ] **Step 1: Write the failing tests**

`src/components/ConfirmRemove.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmRemove from "./ConfirmRemove";

describe("ConfirmRemove", () => {
  it("shows one × trigger at rest", () => {
    render(<ConfirmRemove label="Xoá bước" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Xoá bước" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
  });

  it("first click reveals Xoá / Huỷ and hides the trigger; onConfirm not yet called", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    expect(screen.getByRole("button", { name: "Xoá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá bước" })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Xoá fires onConfirm once", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Huỷ returns to the resting trigger without confirming", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.getByRole("button", { name: "Xoá bước" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("focus leaving the confirm group resets to the trigger", async () => {
    const onConfirm = vi.fn();
    render(
      <>
        <ConfirmRemove label="Xoá bước" onConfirm={onConfirm} />
        <button>outside</button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
    await userEvent.click(screen.getByText("outside")); // moves focus out
    expect(screen.getByRole("button", { name: "Xoá bước" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/ConfirmRemove.test.tsx`
Expected: FAIL — `./ConfirmRemove` does not exist.

- [ ] **Step 3: Implement `src/components/ConfirmRemove.tsx`**

```tsx
import { useState } from "react";

export default function ConfirmRemove({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="confirm-x" aria-label={label} onClick={() => setConfirming(true)}>
        ×
      </button>
    );
  }

  return (
    <span
      className="confirm-group"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setConfirming(false);
      }}
    >
      <button
        type="button"
        className="confirm-yes"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        Xoá
      </button>
      <button type="button" className="confirm-no" onClick={() => setConfirming(false)}>
        Huỷ
      </button>
    </span>
  );
}
```

`e.relatedTarget` is `EventTarget | null`; `Node.contains` accepts `Node | null`, and in a jsdom/DOM lib `relatedTarget` widens to `Node | null` here without a cast. If `strict` flags it, guard with `e.relatedTarget instanceof Node ? e.currentTarget.contains(e.relatedTarget) : false` — a type predicate, not a cast.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/ConfirmRemove.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npm run test`
Expected: clean; green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfirmRemove.tsx src/components/ConfirmRemove.test.tsx
git commit -m "feat(editor): ConfirmRemove — two-tap inline delete confirm"
```

---

## Task 3: `isStepEdited` pure helper

Given a step id, decide whether it is unchanged from the shipped routine (`null`), a modified default step (`"modified"`), or a user-added step (`"added"`).

**Files:**
- Modify: `src/shared/content.ts` (add after `getStoredDays`, before the mutation helpers)
- Test: `src/shared/content.test.ts` (add a `describe("isStepEdited")` block; add one assertion to the existing add-step tests)

**Interfaces:**
- Consumes: `routine` from `./routine`; existing `getStoredDays`, `stepId`; `AppState`, `Category`, `StepPhase`, `RoutineStep`, `StoredStep`, `isStepTuple`, `isHairDay` from `./types` (import whatever is not already imported).
- Produces: `isStepEdited(state: AppState, category: Category, dayIndex: number, phase: StepPhase, id: string): "modified" | "added" | null`

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/content.test.ts` (the file already imports `makeDefaultState`, `routine`, and the helpers; add `isStepEdited` to the import from `./content`):

```ts
import {
  addStep, isStepEdited, renameProduct, setStepVariant, stepId, updateStepTuple,
} from "./content";

describe("isStepEdited", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

  it("returns null for a category with no override", () => {
    expect(isStepEdited(base, "face", 0, "am", stepId("face", 0, "am", 0))).toBeNull();
  });

  it("returns null for a step in a CoW-cloned category that was not itself changed", () => {
    // renameProduct clones the whole face category but touches no step
    const s = renameProduct(base, "face", 0, "Tên khác");
    expect(isStepEdited(s, "face", 0, "am", stepId("face", 0, "am", 0))).toBeNull();
  });

  it("returns 'modified' after updateStepTuple on a default step", () => {
    const id = stepId("face", 2, "am", 0);
    const s = updateStepTuple(base, "face", 2, "am", id, "Sản phẩm mới", "");
    expect(isStepEdited(s, "face", 2, "am", id)).toBe("modified");
    expect(isStepEdited(s, "face", 2, "am", stepId("face", 2, "am", 1))).toBeNull();
  });

  it("returns 'modified' after setStepVariant (plain -> threshold)", () => {
    const id = stepId("face", 3, "pm", 0);
    const s = setStepVariant(base, "face", 3, "pm", id, {
      kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""],
    });
    expect(isStepEdited(s, "face", 3, "pm", id)).toBe("modified");
  });

  it("returns 'added' for a new-* step", () => {
    const s = addStep(base, "hair", 1, "steps");
    const day = s.overrides?.hair?.days[1];
    if (!day || !("steps" in day)) throw new Error("hair day");
    const newId = day.steps[day.steps.length - 1].id;
    expect(newId).toBe("hair.1.steps.new-0");
    expect(isStepEdited(s, "hair", 1, "steps", newId)).toBe("added");
  });

  it("returns null when the id is not found in the phase", () => {
    const s = renameProduct(base, "face", 0, "x");
    expect(isStepEdited(s, "face", 0, "am", "face.0.am.does-not-exist")).toBeNull();
  });
});
```

Also add, inside the existing `describe("mutation helpers")` block (or wherever `addStep` is tested), one assertion pinning the new-step id formula so the `CategorySection` wrapper in Task 9 can recompute it:

```ts
it("new-step id equals `${category}.${dayIndex}.${phase}.new-${stepSeq ?? 0}`", () => {
  const b = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const seq = b.stepSeq ?? 0;
  const s = addStep(b, "face", 4, "pm");
  const day = s.overrides?.face?.days[4];
  if (!day || "steps" in day) throw new Error("face day");
  expect(day.pm[day.pm.length - 1].id).toBe(`face.4.pm.new-${seq}`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/content.test.ts`
Expected: FAIL — `isStepEdited` is not exported.

- [ ] **Step 3: Implement in `src/shared/content.ts`**

Add a structural `RoutineStep` equality and the helper. Put `routineStepsEqual` near the top (after the imports) and `isStepEdited` after `getStoredDays`.

```ts
function tuplesEqual(a: StepTuple, b: StepTuple): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Structural equality for a RoutineStep — key-order-safe, no JSON.stringify. */
function routineStepsEqual(a: RoutineStep, b: RoutineStep): boolean {
  const aTuple = isStepTuple(a);
  const bTuple = isStepTuple(b);
  if (aTuple || bTuple) return aTuple && bTuple && tuplesEqual(a, b);
  if (a.kind !== b.kind) return false;
  if (a.kind === "threshold" && b.kind === "threshold") {
    return a.untilWeek === b.untilWeek && tuplesEqual(a.before, b.before) && tuplesEqual(a.from, b.from);
  }
  if (a.kind === "cycle" && b.kind === "cycle") {
    return (
      a.length === b.length &&
      a.weeks.length === b.weeks.length &&
      a.weeks.every((w, i) => tuplesEqual(w, b.weeks[i]))
    );
  }
  return false;
}

/**
 * Whether a step in an edited category differs from the shipped routine.
 * "added" — a new-* id with no default counterpart. "modified" — a default
 * step whose current form differs from routine.ts at the same position.
 * null — no override for the category, id not found, or unchanged.
 *
 * The comparison is positional (the default at the step's current index). A
 * prior removeStep on an earlier sibling can therefore shift a step against a
 * different default; the marker may then be wrong (never a crash, never a data
 * change). Wave 2's stable ordering removes this ambiguity.
 */
export function isStepEdited(
  state: AppState,
  category: Category,
  dayIndex: number,
  phase: StepPhase,
  id: string,
): "modified" | "added" | null {
  if (!state.overrides?.[category]) return null;

  const storedDay = getStoredDays(state, category)[dayIndex];
  const stored: StoredStep[] = isHairDay(storedDay)
    ? phase === "steps" ? storedDay.steps : []
    : phase === "am" ? storedDay.am : phase === "pm" ? storedDay.pm : [];

  const index = stored.findIndex((s) => s.id === id);
  if (index === -1) return null;

  if (id !== stepId(category, dayIndex, phase, index)) return "added";

  const defaultDay = routine[category].days[dayIndex];
  const defaultSteps: RoutineStep[] = isHairDay(defaultDay)
    ? phase === "steps" ? defaultDay.steps : []
    : phase === "am" ? defaultDay.am : phase === "pm" ? defaultDay.pm : [];

  const def = defaultSteps[index];
  if (def === undefined) return "added";
  return routineStepsEqual(stored[index].step, def) ? null : "modified";
}
```

Ensure `StepTuple`, `RoutineStep`, `StoredStep`, `isHairDay`, `isStepTuple` are imported from `./types` and `routine` from `./routine` (add to existing import lines; do not duplicate).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/content.ts src/shared/content.test.ts
git commit -m "feat(content): isStepEdited — modified/added/null marker helper"
```

---

## Task 4: Blur-commit in `Gallery` and `VariantEditor`

Replace per-keystroke `onChange` wiring with `useBufferedText`. Also update the two `VariantEditor` placeholders (Feature 4 copy). No behaviour change to what is stored — only the commit cadence.

**Files:**
- Modify: `src/components/Gallery.tsx`
- Modify: `src/components/VariantEditor.tsx`
- Test: `src/components/Gallery.test.tsx`, `src/components/VariantEditor.test.tsx`

**Interfaces:**
- Consumes: `useBufferedText` (Task 1).
- Produces: no new exports. `Gallery` and `VariantEditor` prop shapes unchanged.

- [ ] **Step 1: Update `Gallery.test.tsx`**

The current edit test types into an input and asserts `onEdit.onRename` was called with the typed value. Change it to assert **buffering**:

```tsx
it("buffers product edits — onRename fires once on blur, not per keystroke", async () => {
  const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
  render(<Gallery products={["Toner"]} editing onEdit={onEdit} />);
  const input = screen.getByRole("textbox", { name: "Tên sản phẩm 1" });
  await userEvent.type(input, "!");
  expect(onEdit.onRename).not.toHaveBeenCalled();
  await userEvent.tab();
  expect(onEdit.onRename).toHaveBeenCalledTimes(1);
  expect(onEdit.onRename).toHaveBeenCalledWith(0, "Toner!");
});
```

Keep the other Gallery tests (plain render, add button, empty placeholder). The remove-button test moves to Task 5 — leave it for now (it still passes: the `×` still calls `onRemove` on first click until Task 5).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/Gallery.test.tsx`
Expected: FAIL — the new test expects no call during typing, but the current code calls `onRename` per keystroke.

- [ ] **Step 3: Wire `Gallery.tsx`**

Extract the edit-mode product row into a small local component so each row can call the hook:

```tsx
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { useBufferedText } from "../hooks/useBufferedText";
// NB: ConfirmRemove is imported and wired in Task 5, not here.

export type GalleryEdit = {
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

function ProductRow({
  product, index, onEdit,
}: {
  product: string;
  index: number;
  onEdit: GalleryEdit;
}) {
  const buf = useBufferedText(product, (name) => onEdit.onRename(index, name));
  return (
    <div className="prod prod-edit">
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
      <button
        type="button"
        aria-label={product ? `Xoá ${product}` : `Xoá sản phẩm ${index + 1}`}
        onClick={() => onEdit.onRemove(index)}
      >
        ×
      </button>
    </div>
  );
}
```

Replace the `.map` in the `editing && onEdit` branch with `{products.map((product, index) => <ProductRow key={index} product={product} index={index} onEdit={onEdit} />)}`. The non-editing branch is unchanged.

(`ConfirmRemove` is imported and wired in Task 5. Task 4 leaves the bare
`<button …>×</button>` in `ProductRow` untouched — only the text input changes
here.)

- [ ] **Step 4: Update `VariantEditor.test.tsx` and wire `VariantEditor.tsx`**

`VariantEditor`'s `TupleFields` currently calls `onChange` per keystroke. Change `TupleFields` so each `<input>` uses `useBufferedText`:

```tsx
function TupleFields({
  label, value, onChange, autoFocusFirst = false,
}: {
  label: { product: string; note: string };
  value: StepTuple;
  onChange: (t: StepTuple) => void;
  autoFocusFirst?: boolean;
}) {
  const productBuf = useBufferedText(value[0], (p) => onChange([p, value[1]]));
  const noteBuf = useBufferedText(value[1], (n) => onChange([value[0], n]));
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusFirst) firstRef.current?.focus();
  }, [autoFocusFirst]);
  return (
    <div className="variant-branch">
      <label>
        {label.product}
        <input
          ref={firstRef}
          type="text"
          placeholder="Tên sản phẩm / bước"
          value={productBuf.value}
          onChange={productBuf.onChange}
          onFocus={productBuf.onFocus}
          onBlur={productBuf.onBlur}
        />
      </label>
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

Set the React import to `import { useEffect, useRef } from "react";` — after the
`untilWeek` migration below, `VariantEditor` no longer uses `useState` (its only
`useState` was `untilWeekDraft`). Add `import { useBufferedText } from "../hooks/useBufferedText";`.

Migrate the `untilWeek` field off its bespoke local-string logic to the hook. Delete the `untilWeekDraft`/`setUntilWeekDraft` `useState` and its `useEffect`; the number input becomes:

```tsx
{kind === "threshold" && !isStepTuple(value) && value.kind === "threshold" && (
  <>
    <UntilWeekField value={value.untilWeek} onCommit={(n) => onChange({ ...value, untilWeek: n })} />
    ...
```

with a tiny local component:

```tsx
function UntilWeekField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const buf = useBufferedText(String(value), (s) => onCommit(coerceWeek(s)));
  return (
    <label>
      Đổi từ tuần thứ
      <input type="number" min={1} value={buf.value}
        onChange={buf.onChange} onFocus={buf.onFocus} onBlur={buf.onBlur} />
    </label>
  );
}
```

`coerceWeek` stays as-is. Pass `autoFocusFirst` through from `VariantEditor`'s own new prop (added in Task 6) to the `plain`-kind `TupleFields` only; for Task 4, `TupleFields` accepts the prop but `VariantEditor` doesn't pass it yet (default `false`).

Update `VariantEditor.test.tsx`:
- Any test that types into a `TupleFields` input and expects an immediate `onChange` → assert 0 calls during typing, 1 on `blur`/`tab`, with the final value.
- The existing `untilWeek` tests already assert "0 calls while typing, coerced number on blur" — they should still pass with the hook (the hook has the same contract). If a test typed a partial value and asserted the intermediate `buf.value`, keep it; the hook preserves the raw draft string.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/components/Gallery.test.tsx src/components/VariantEditor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green. `DayPanel.test.tsx` and `CategorySection.test.tsx` still pass — they interact with the editor at a level (open a row, read text) not tied to commit cadence; if one typed into a field and asserted an immediate state change, adjust it to `tab()` first.

- [ ] **Step 7: Commit**

```bash
git add src/components/Gallery.tsx src/components/VariantEditor.tsx \
  src/components/Gallery.test.tsx src/components/VariantEditor.test.tsx
git commit -m "feat(editor): buffer editor text inputs, commit on blur"
```

---

## Task 5: `ConfirmRemove` in `Gallery` and `StepEditor`

Swap the bare `×` buttons for the two-tap `ConfirmRemove`.

**Files:**
- Modify: `src/components/Gallery.tsx`
- Modify: `src/components/StepEditor.tsx`
- Modify: `src/styles.css` (confirm button styles)
- Test: `src/components/Gallery.test.tsx`, `src/components/StepEditor.test.tsx`

**Interfaces:**
- Consumes: `ConfirmRemove` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Update the tests**

`Gallery.test.tsx` — replace the remove test:

```tsx
it("removing a product needs two taps", async () => {
  const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
  render(<Gallery products={["Cleanser"]} editing onEdit={onEdit} />);
  await userEvent.click(screen.getByRole("button", { name: "Xoá Cleanser" }));
  expect(onEdit.onRemove).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
  expect(onEdit.onRemove).toHaveBeenCalledWith(0);
});
```

The empty-name variant of the label (`Xoá sản phẩm 1`) stays as the `ConfirmRemove` `label` for an empty product — keep any test asserting that name.

`StepEditor.test.tsx` — the remove test becomes:

```tsx
it("removing a step needs two taps", async () => {
  const onRemove = vi.fn();
  render(
    <StepEditor display={{ id: "face.0.am.0", product: "Toner", note: "" }}
      raw={["Toner", ""]} onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={onRemove} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Xoá bước" }));
  expect(onRemove).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
  expect(onRemove).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/Gallery.test.tsx src/components/StepEditor.test.tsx`
Expected: FAIL — after the first click there is no `Xoá` button (the current `×` removed immediately).

- [ ] **Step 3: Wire the components**

`Gallery.tsx` `ProductRow` — replace the `<button aria-label={…}>×</button>` with:

```tsx
<ConfirmRemove
  label={product ? `Xoá ${product}` : `Xoá sản phẩm ${index + 1}`}
  onConfirm={() => onEdit.onRemove(index)}
/>
```

Ensure `import ConfirmRemove from "./ConfirmRemove";` is present.

`StepEditor.tsx` — replace `<button type="button" aria-label="Xoá bước" onClick={onRemove}>×</button>` with:

```tsx
<ConfirmRemove label="Xoá bước" onConfirm={onRemove} />
```

Add `import ConfirmRemove from "./ConfirmRemove";`.

- [ ] **Step 4: Styles**

Append to `src/styles.css` (near the `.step-edit` / `.gallery-edit` rules):

```css
.confirm-x{border:none;background:none;color:var(--rose-deep);font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;}
.confirm-group{display:inline-flex;gap:6px;}
.confirm-yes{border:none;border-radius:8px;background:var(--rose-deep);color:#fff;font-family:'Nunito',sans-serif;font-weight:800;font-size:11.5px;padding:4px 9px;cursor:pointer;}
.confirm-no{border:1px solid var(--line);border-radius:8px;background:none;color:var(--rose-ink);font-family:'Nunito',sans-serif;font-weight:700;font-size:11.5px;padding:4px 9px;cursor:pointer;}
```

- [ ] **Step 5: Run to verify pass + full suite**

Run: `npx vitest run src/components/Gallery.test.tsx src/components/StepEditor.test.tsx && npm run test`
Expected: PASS; full suite green. Check `CategorySection.test.tsx` / `DayPanel.test.tsx` for any test that clicked a step/product `×` expecting immediate removal — update it to the two-tap sequence.

- [ ] **Step 6: Typecheck + constraints + commit**

```bash
npm run lint:constraints && npm run typecheck
git add src/components/Gallery.tsx src/components/StepEditor.tsx src/styles.css \
  src/components/Gallery.test.tsx src/components/StepEditor.test.tsx
git commit -m "feat(editor): two-tap confirm on product and step delete"
```

---

## Task 6: `StepEditor` edit marker + `initialOpen` / `autoFocusFirst`; `VariantEditor` autofocus

`StepEditor` gains an `edited` marker tag/class, an `initialOpen` prop (start expanded + `scrollIntoView`), and passes `autoFocusFirst` through to `VariantEditor`, which focuses the first product input on mount.

**Files:**
- Modify: `src/components/StepEditor.tsx`
- Modify: `src/components/VariantEditor.tsx`
- Modify: `src/styles.css` (marker styles)
- Test: `src/components/StepEditor.test.tsx`, `src/components/VariantEditor.test.tsx`

**Interfaces:**
- Consumes: nothing new (`edited` is a bare string-union type declared inline).
- Produces:
  - `StepEditor` props gain `edited?: "modified" | "added" | null`, `initialOpen?: boolean`, `autoFocusFirst?: boolean`.
  - `VariantEditor` props gain `autoFocusFirst?: boolean`.

- [ ] **Step 1: Write the failing tests**

`StepEditor.test.tsx`:

```tsx
it("renders the 'đã đổi' tag and is-modified class when edited='modified'", () => {
  const { container } = render(
    <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
      edited="modified" onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  expect(screen.getByText("đã đổi")).toBeInTheDocument();
  expect(container.querySelector("li.step-edit.is-modified")).not.toBeNull();
});

it("renders 'mới' and is-added when edited='added'", () => {
  const { container } = render(
    <StepEditor display={{ id: "x", product: "", note: "" }} raw={["", ""]}
      edited="added" onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  expect(screen.getByText("mới")).toBeInTheDocument();
  expect(container.querySelector("li.step-edit.is-added")).not.toBeNull();
});

it("no tag when edited is null/undefined", () => {
  render(
    <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  expect(screen.queryByText("đã đổi")).toBeNull();
  expect(screen.queryByText("mới")).toBeNull();
});

it("initialOpen mounts the row expanded", () => {
  render(
    <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
      initialOpen onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  expect(screen.getByLabelText("Sản phẩm")).toBeInTheDocument(); // plain-kind product field visible
});

it("initialOpen + autoFocusFirst focuses the first product input", async () => {
  render(
    <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
      initialOpen autoFocusFirst onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  expect(screen.getByLabelText("Sản phẩm")).toHaveFocus();
});

it("initialOpen without autoFocusFirst does not steal focus", () => {
  render(
    <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
      initialOpen onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  expect(screen.getByLabelText("Sản phẩm")).not.toHaveFocus();
});
```

> Note: `getByLabelText("Sản phẩm")` resolves the plain-kind product input because `TupleFields` for `kind === "plain"` labels it exactly `"Sản phẩm"`.

`VariantEditor.test.tsx`:

```tsx
it("autoFocusFirst focuses the first product field on mount", () => {
  render(<VariantEditor value={["Toner", ""]} onChange={vi.fn()} autoFocusFirst />);
  expect(screen.getByLabelText("Sản phẩm")).toHaveFocus();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/StepEditor.test.tsx src/components/VariantEditor.test.tsx`
Expected: FAIL — props don't exist, no marker rendered, no autofocus.

- [ ] **Step 3: Implement `VariantEditor.tsx` `autoFocusFirst`**

Add `autoFocusFirst?: boolean` to `VariantEditor`'s props. Pass it into the `plain`-kind `TupleFields` only:

```tsx
{kind === "plain" && (
  <TupleFields label={{ product: "Sản phẩm", note: "Ghi chú" }} value={base}
    onChange={(t) => onChange(t)} autoFocusFirst={autoFocusFirst} />
)}
```

`TupleFields` already has the `autoFocusFirst` + `firstRef` + `useEffect` from Task 4 Step 4. For `threshold`/`cycle` kinds, don't pass it (a converted step opens with the kind selector; focusing a branch field is not wanted).

- [ ] **Step 4: Implement `StepEditor.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import VariantEditor from "./VariantEditor";
import ConfirmRemove from "./ConfirmRemove";
import { isStepTuple, type RoutineStep } from "../shared/types";
import type { ResolvedStep } from "../shared/content";

const EDIT_TAG: Record<"modified" | "added", string> = { modified: "đã đổi", added: "mới" };

export default function StepEditor({
  display,
  raw,
  edited = null,
  initialOpen = false,
  autoFocusFirst = false,
  onUpdateTuple,
  onSetVariant,
  onRemove,
}: {
  display: ResolvedStep;
  raw: RoutineStep;
  edited?: "modified" | "added" | null;
  initialOpen?: boolean;
  autoFocusFirst?: boolean;
  onUpdateTuple: (product: string, note: string) => void;
  onSetVariant: (next: RoutineStep) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const liRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (initialOpen) liRef.current?.scrollIntoView({ block: "nearest" });
  }, [initialOpen]);

  const cls = `step-edit${edited === "modified" ? " is-modified" : edited === "added" ? " is-added" : ""}`;

  return (
    <li ref={liRef} className={cls}>
      <div className="step-edit-head">
        <button type="button" className="step-edit-toggle" aria-expanded={open}
          aria-label={`Sửa bước: ${display.product || "Bước chưa đặt tên"}`}
          onClick={() => setOpen((v) => !v)}>
          <span>{display.product || "Bước chưa đặt tên"}</span>
          {edited && <span className="step-edit-tag">{EDIT_TAG[edited]}</span>}
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        <ConfirmRemove label="Xoá bước" onConfirm={onRemove} />
      </div>
      {open && (
        <VariantEditor
          value={raw}
          autoFocusFirst={autoFocusFirst}
          onChange={(next) => {
            if (isStepTuple(next)) onUpdateTuple(next[0], next[1]);
            else onSetVariant(next);
          }}
        />
      )}
    </li>
  );
}
```

`scrollIntoView` is undefined in jsdom → guard is not needed for the test (the `initialOpen` tests don't assert scroll) but calling it throws in jsdom. Wrap: `if (initialOpen && liRef.current?.scrollIntoView) liRef.current.scrollIntoView({ block: "nearest" });`.

- [ ] **Step 5: Styles**

Append to `src/styles.css`:

```css
.step-edit.is-modified{border-left:3px solid var(--gold);}
.step-edit.is-added{border-left:3px solid var(--rose-deep);}
.step-edit-tag{font-size:10.5px;font-weight:800;color:var(--rose-deep);background:var(--blush-deep);border-radius:6px;padding:1px 6px;}
```

- [ ] **Step 6: Run to verify pass + full suite + gate**

Run: `npx vitest run src/components/StepEditor.test.tsx src/components/VariantEditor.test.tsx && npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/StepEditor.tsx src/components/VariantEditor.tsx src/styles.css \
  src/components/StepEditor.test.tsx src/components/VariantEditor.test.tsx
git commit -m "feat(editor): edited-step markers, initialOpen + autofocus on StepEditor"
```

---

## Task 7: `DayPanel` — compute markers, thread open/focus props

`PhaseBody` computes `isStepEdited` per step and passes `edited`; `DayPanel` accepts `justAddedId` / `openStepId` and threads `initialOpen` + `autoFocusFirst` to the matching `StepEditor`.

**Files:**
- Modify: `src/components/DayPanel.tsx`
- Test: `src/components/DayPanel.test.tsx`

**Interfaces:**
- Consumes: `isStepEdited` (Task 3); `StepEditor`'s `edited` / `initialOpen` / `autoFocusFirst` props (Task 6).
- Produces: `DayPanel` props gain `justAddedId?: string | null` and `openStepId?: string | null`.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/DayPanel.test.tsx` (it already imports `makeDefaultState`; add `updateStepTuple`, `stepId` from `../shared/content`):

```tsx
it("marks an overridden step as modified in edit mode", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const id = stepId("face", 2, "am", 0);
  const state = updateStepTuple(base, "face", 2, "am", id, "Sản phẩm tuỳ chỉnh", "");
  const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn() };
  render(<DayPanel category="face" state={state} dayIndex={2} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={onEdit} />);
  expect(screen.getByText("đã đổi")).toBeInTheDocument();
});

it("opens and focuses the row whose id === justAddedId", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  // hand-build an override with one added step so its id is deterministic
  const withStep = addStep(base, "face", 0, "am");
  const day = withStep.overrides?.face?.days[0];
  if (!day || "steps" in day) throw new Error("face day");
  const newId = day.am[day.am.length - 1].id;
  const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn() };
  render(<DayPanel category="face" state={withStep} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={onEdit} justAddedId={newId} />);
  expect(screen.getAllByLabelText("Sản phẩm").length).toBeGreaterThan(0); // a row is expanded
  // the added row's first product field has focus
  const added = screen.getAllByLabelText("Sản phẩm");
  expect(added.some((el) => el === document.activeElement)).toBe(true);
});
```

Import `addStep` too. `WEEK1_NOW` already exists in the file.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DayPanel.test.tsx`
Expected: FAIL — no `đã đổi` text; `justAddedId` prop ignored.

- [ ] **Step 3: Implement `DayPanel.tsx`**

Add to imports: `isStepEdited` from `../shared/content`.

`DayPanel` props: add `justAddedId?: string | null` and `openStepId?: string | null` (both default `null` via destructuring). Thread them into every `<PhaseBody … />` call (there are 3: the hair one, the `am` one, the `pm` one) as `justAddedId={justAddedId}` and `openStepId={openStepId}`.

`PhaseBody` does not currently receive `state` — it gets `category`,
`dayIndex`, `phase`. Add three props to `PhaseBody`: `state: AppState`,
`justAddedId?: string | null`, `openStepId?: string | null`. Pass all three
from `DayPanel` into each of the three `<PhaseBody … />` calls (`state={state}`
plus `justAddedId={justAddedId}` `openStepId={openStepId}`).

In `PhaseBody`'s edit branch, change the `StepEditor` render to:

```tsx
{resolvedSteps.map((rs, i) => (
  <StepEditor
    key={rs.id}
    display={rs}
    raw={storedSteps[i].step}
    edited={isStepEdited(state, category, dayIndex, phase, rs.id)}
    initialOpen={rs.id === justAddedId || rs.id === openStepId}
    autoFocusFirst={rs.id === justAddedId}
    onUpdateTuple={(p, n) => onEdit.onUpdateStep(phase, rs.id, p, n)}
    onSetVariant={(v) => onEdit.onSetVariant(phase, rs.id, v)}
    onRemove={() => onEdit.onRemoveStep(phase, rs.id)}
  />
))}
```

- [ ] **Step 4: Run to verify pass + full suite + gate**

Run: `npx vitest run src/components/DayPanel.test.tsx && npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/DayPanel.tsx src/components/DayPanel.test.tsx
git commit -m "feat(editor): DayPanel computes edited markers and threads open/focus props"
```

---

## Task 8: `CustomizationsStrip` component

An edit-mode strip listing what a category has diverged from default, with jump links and the per-category reset.

**Files:**
- Create: `src/components/CustomizationsStrip.tsx`
- Test: `src/components/CustomizationsStrip.test.tsx`

**Interfaces:**
- Consumes: `getStoredDays`, `isStepEdited` (Task 3); `AppState`, `Category`, `StepPhase` from `../shared/types`.
- Produces: `default export CustomizationsStrip(props: { state: AppState; category: Category; onJump: (dayIndex: number, stepId: string) => void; onReset: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`src/components/CustomizationsStrip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CustomizationsStrip from "./CustomizationsStrip";
import { makeDefaultState } from "../shared/defaults";
import { addStep, stepId, updateStepTuple } from "../shared/content";

const start = new Date("2026-08-24T00:00:00Z");

describe("CustomizationsStrip", () => {
  it("counts modified and added steps", () => {
    let s = makeDefaultState(start);
    s = updateStepTuple(s, "face", 2, "am", stepId("face", 2, "am", 0), "Đổi 1", "");
    s = updateStepTuple(s, "face", 3, "pm", stepId("face", 3, "pm", 0), "Đổi 2", "");
    s = addStep(s, "face", 0, "am");
    render(<CustomizationsStrip state={s} category="face" onJump={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/2 bước đã đổi/)).toBeInTheDocument();
    expect(screen.getByText(/1 bước mới/)).toBeInTheDocument();
  });

  it("expands to jump links that call onJump(dayIndex, stepId)", async () => {
    let s = makeDefaultState(start);
    const id = stepId("face", 4, "pm", 0);
    s = updateStepTuple(s, "face", 4, "pm", id, "Đổi", "");
    const onJump = vi.fn();
    render(<CustomizationsStrip state={s} category="face" onJump={onJump} onReset={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /xem chi tiết/i }));
    await userEvent.click(screen.getByRole("button", { name: /T6 · Tối · Đổi/ }));
    expect(onJump).toHaveBeenCalledWith(4, id);
  });

  it("Đặt lại calls onReset", async () => {
    let s = makeDefaultState(start);
    s = updateStepTuple(s, "face", 0, "am", stepId("face", 0, "am", 0), "x", "");
    const onReset = vi.fn();
    render(<CustomizationsStrip state={s} category="face" onJump={vi.fn()} onReset={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/CustomizationsStrip.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `src/components/CustomizationsStrip.tsx`**

```tsx
import { useState } from "react";
import { getStoredDays, isStepEdited } from "../shared/content";
import { isHairDay, type AppState, type Category, type StepPhase } from "../shared/types";

const DAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PHASE_LABEL: Record<StepPhase, string> = { am: "Sáng", pm: "Tối", steps: "Chăm tóc" };

type Change = { dayIndex: number; phase: StepPhase; id: string; product: string; kind: "modified" | "added" };

function collectChanges(state: AppState, category: Category): Change[] {
  const out: Change[] = [];
  const days = getStoredDays(state, category);
  days.forEach((day, dayIndex) => {
    const phases: [StepPhase, typeof day.steps][] = isHairDay(day)
      ? [["steps", day.steps]]
      : [["am", day.am], ["pm", day.pm]];
    for (const [phase, steps] of phases) {
      steps.forEach((s) => {
        const kind = isStepEdited(state, category, dayIndex, phase, s.id);
        if (kind) {
          const [product] = Array.isArray(s.step) ? s.step : firstProductOf(s.step);
          out.push({ dayIndex, phase, id: s.id, product, kind });
        }
      });
    }
  });
  return out;
}

function firstProductOf(step: { kind: "threshold" | "cycle" }): [string] {
  // step is a ConditionalStep; grab a representative product string
  if (step.kind === "threshold") return [step.before[0]];
  return [step.weeks[0][0]];
}

export default function CustomizationsStrip({
  state,
  category,
  onJump,
  onReset,
}: {
  state: AppState;
  category: Category;
  onJump: (dayIndex: number, stepId: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const changes = collectChanges(state, category);
  const modified = changes.filter((c) => c.kind === "modified").length;
  const added = changes.filter((c) => c.kind === "added").length;

  const parts = [`${modified} bước đã đổi`];
  if (added > 0) parts.push(`${added} bước mới`);

  return (
    <div className="customizations">
      <div className="customizations-head">
        <span>✎ Bạn đã tuỳ chỉnh mục này — {parts.join(", ")}</span>
        <button type="button" className="reset-category" onClick={onReset}>Đặt lại</button>
        <button type="button" aria-label="Xem chi tiết" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open && (
        <ul className="customizations-list">
          {changes.map((c) => (
            <li key={`${c.dayIndex}.${c.phase}.${c.id}`}>
              <button type="button" onClick={() => onJump(c.dayIndex, c.id)}>
                {DAY_SHORT[c.dayIndex]} · {PHASE_LABEL[c.phase]} · {c.product || "Bước chưa đặt tên"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`firstProductOf`'s parameter type: import `ConditionalStep` from `../shared/types` and type it `step: ConditionalStep` — the `Array.isArray` check above already narrowed `s.step` to the non-tuple side, but TS won't carry that into the helper call. Instead inline the representative-product extraction without a helper to keep narrowing:

```tsx
const stepValue = s.step;
const product = Array.isArray(stepValue)
  ? stepValue[0]
  : stepValue.kind === "threshold"
    ? stepValue.before[0]
    : stepValue.weeks[0][0];
```

Use that inline form; drop `firstProductOf`. `Array.isArray` on a `RoutineStep` is the tuple discriminator (same pattern as `isStepTuple`), so no cast.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/CustomizationsStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + gate + commit**

```bash
npm run lint:constraints && npm run typecheck && npm run test
git add src/components/CustomizationsStrip.tsx src/components/CustomizationsStrip.test.tsx
git commit -m "feat(editor): CustomizationsStrip — per-category change summary + reset"
```

---

## Task 9: `CategorySection` — strip, sticky/dotted pill, jump + auto-focus wiring

Remove the loose reset button; render `CustomizationsStrip`; add `justAddedId` / `openStepId` state; put a `data-edited` flag on the pill; wire `onJump`; recompute the new-step id in the `onAddStep` wrapper. Plus the pill CSS.

**Files:**
- Modify: `src/components/CategorySection.tsx`
- Modify: `src/styles.css`
- Test: `src/components/CategorySection.test.tsx`

**Interfaces:**
- Consumes: `CustomizationsStrip` (Task 8); `DayPanel`'s `justAddedId` / `openStepId` props (Task 7); `resetCategory`, `addStep`'s id formula (Task 3 assertion) from `../shared/content`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/CategorySection.test.tsx`:

```tsx
import { updateStepTuple, stepId } from "../shared/content";

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
  render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
  await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
  expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("tab", { name: /T5/ }));
  expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("aria-pressed", "true");
});
```

> `onSelectDay` is a prop, so "stays in edit mode across a day-tab switch" needs the parent to actually change `activeDay`. Use a small stateful wrapper in the test: `function Host() { const [d, setD] = useState(0); return <CategorySection {...stateProps} category="face" activeDay={d} onSelectDay={setD} />; }` and render `<Host />`. Adjust the test to click the tab and assert the pill is still pressed and the new day's steps show.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/CategorySection.test.tsx`
Expected: FAIL — no `data-edited`, no strip, loose reset still present.

- [ ] **Step 3: Implement `CategorySection.tsx`**

Add imports: `CustomizationsStrip from "./CustomizationsStrip"`. Keep `resetCategory` (already imported). Remove `renameProduct`/`removeProduct`/`addProduct` only if Wave 2 removes gallery editing — **not now**, keep them.

Inside the component:

```tsx
const [editing, setEditing] = useState(false);
const [justAddedId, setJustAddedId] = useState<string | null>(null);
const [openStepId, setOpenStepId] = useState<string | null>(null);

// consume-once: clear the "just added" highlight on the render after it's applied
useEffect(() => {
  if (justAddedId !== null) setJustAddedId(null);
}, [justAddedId]);

const hasOverride = Boolean(state.overrides?.[category]);

function handleReset() {
  if (window.confirm("Đặt lại toàn bộ nội dung mục này về mặc định? Các thay đổi bạn đã tạo sẽ bị xoá.")) {
    editContent((s) => resetCategory(s, category));
  }
}
```

Pill: add `data-edited={hasOverride}` to the `<button className="edit-toggle">`.

Remove the whole `{editing && (<button className="reset-category">…</button>)}` block.

After the pill, add:

```tsx
{editing && hasOverride && (
  <CustomizationsStrip
    state={state}
    category={category}
    onReset={handleReset}
    onJump={(dayIndex, id) => {
      onSelectDay(dayIndex);
      setOpenStepId(id);
    }}
  />
)}
```

Clear `openStepId` when the day changes: it is set by a jump that also calls `onSelectDay`, and should not persist once the user moves on. Simplest: clear it in the same `onSelectDay` path is not possible (that's the parent's setter). Instead clear on the next explicit tab click by wrapping the `DayTabs` `onSelect`:

```tsx
<DayTabs
  days={data.days}
  activeDay={activeDay}
  onSelect={(i) => { setOpenStepId(null); onSelectDay(i); }}
/>
```

(The jump path sets `openStepId` *after* calling `onSelectDay`, so this wrapper does not stomp it — the wrapper only runs on a user tab click, not on the programmatic `onSelectDay` inside `onJump`.)

`onAddStep` wrapper — recompute the id `addStep` will assign, from the pre-call `stepSeq`:

```tsx
onAddStep: (phase) => {
  const n = state.stepSeq ?? 0;
  setJustAddedId(`${category}.${activeDay}.${phase}.new-${n}`);
  editContent((s) => addStep(s, category, activeDay, phase));
},
```

Pass the new props to `DayPanel`. Keep `onUpdateStep`, `onRemoveStep`, and
`onSetVariant` in the `onEdit` object **exactly as they are today**; replace
only `onAddStep` with the wrapper above, and add `justAddedId` / `openStepId`:

```tsx
<DayPanel
  category={category}
  state={state}
  dayIndex={activeDay}
  onToggleStep={onToggleStep}
  editing={editing}
  justAddedId={justAddedId}
  openStepId={openStepId}
  onEdit={{
    onAddStep: (phase) => {
      const n = state.stepSeq ?? 0;
      setJustAddedId(`${category}.${activeDay}.${phase}.new-${n}`);
      editContent((s) => addStep(s, category, activeDay, phase));
    },
    onUpdateStep: (phase, id, product, note) =>
      editContent((s) => updateStepTuple(s, category, activeDay, phase, id, product, note)),
    onRemoveStep: (phase, id) => editContent((s) => removeStep(s, category, activeDay, phase, id)),
    onSetVariant: (phase, id, variant) =>
      editContent((s) => setStepVariant(s, category, activeDay, phase, id, variant)),
  }}
/>
```

`import { useState } from "react"` is already present — extend it to
`import { useEffect, useState } from "react"`.

- [ ] **Step 4: Styles**

Append / adjust in `src/styles.css`:

```css
.edit-toggle[data-edited="true"]::after{
  content:"";position:absolute;top:-2px;right:-2px;width:9px;height:9px;
  border-radius:50%;background:var(--gold);border:2px solid var(--cream);
}
.edit-toggle[aria-pressed="true"]{position:sticky;top:8px;}
.customizations{
  margin:0 0 16px;padding:10px 12px;border-radius:12px;
  background:var(--blush);border:1px solid var(--line);font-size:12.5px;color:var(--rose-ink);
}
.customizations-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.customizations-head > span{flex:1;min-width:180px;}
.customizations-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px;}
.customizations-list button{
  border:none;background:none;color:var(--rose-deep);font-weight:700;font-size:12px;
  text-align:left;text-decoration:underline;cursor:pointer;padding:0;
}
```

Note the pill already has `position:absolute` (read mode). The `[aria-pressed="true"]` rule overriding to `position:sticky` while editing is the intended "reachable pill" behaviour. Confirm in the running app that `sticky` inside `.category` (no `overflow` clip on `.category`) works; if the hero's `overflow:hidden` interferes because the pill is a `.category` child not a `.hero` child, it does not — the pill is a direct child of `<section class="category">`.

- [ ] **Step 5: Run to verify pass + full suite + build + gate**

Run: `npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/CategorySection.tsx src/styles.css src/components/CategorySection.test.tsx
git commit -m "feat(editor): customizations strip, edited-dot + sticky pill, jump/auto-focus wiring"
```

---

## Task 10: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the content-editor area of `CLAUDE.md` (the `overrides` / `content.ts` bullet added by sub-project 3), append:

> **Editor input & feedback plumbing (usability Wave 1):** editor text fields
> use `src/hooks/useBufferedText.ts` — a local draft that commits via
> `editContent(...)` only on blur or on unmount-while-focused, so typing no
> longer fires a state write per keystroke. Destructive `×` controls in the
> editor are wrapped in `src/components/ConfirmRemove.tsx` (two-tap `Xoá` /
> `Huỷ`); `window.confirm` is used only for the per-category reset, which now
> lives inside `src/components/CustomizationsStrip.tsx` (rendered in edit mode
> when `state.overrides[category]` exists — a change summary + jump links +
> the reset). `content.ts#isStepEdited(state, category, dayIndex, phase, id)`
> returns `"modified" | "added" | null` and drives the per-step edit tag; it
> compares positionally against `routine.ts`, so a `removeStep` that shifts
> indices can mislabel a step until Wave 2's stable ordering (never a crash,
> never a data change). The edit pill carries `data-edited` and goes
> `position: sticky` while editing.

If any existing CLAUDE.md sentence about the editor is now stale (e.g. "renders
exactly as today", a claim that step deletes are immediate), fix it in the same
edit and note it in the report.

- [ ] **Step 2: Full gate**

Run: `npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green. Record the exact test counts.

- [ ] **Step 3: Manual click-through** (`npm run dev`, phone-width viewport)

1. Open a category, tap **✎ Sửa nội dung** — pill turns to **✓ Xong** and stays on screen as you scroll a long day.
2. Type into a step's product field — no lag; the collapsed row label updates only after you blur or collapse the row.
3. Tap a step `×` — it becomes **Xoá / Huỷ**; **Huỷ** aborts; tapping elsewhere aborts; **Xoá** removes.
4. **+ Thêm bước** — a new row appears expanded with the keyboard up on the product field.
5. Edit a step, leave edit mode, re-enter — the step shows **đã đổi**; an added step shows **mới**; the pill shows a gold dot.
6. Open the **Bạn đã tuỳ chỉnh mục này** strip — counts are right; a jump link switches day tab and reveals that step; **Đặt lại** → confirm → all reverts.
7. Switch category — edit mode exits (existing behaviour); switch day tabs while editing — edit mode stays.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: content editor usability Wave 1 — buffered inputs, confirm-remove, markers, strip"
```

---

## Notes for the executor

- **jsdom `scrollIntoView`** is not implemented — guard the call (`if
  (el?.scrollIntoView) el.scrollIntoView(...)`); tests don't assert scrolling.
- **`useBufferedText` + `userEvent`**: `userEvent.tab()` / clicking another
  element fires `blur`; `userEvent.type` fires `change` per char. The hook's
  contract is verified in Task 1; downstream tests just need to `tab()` before
  asserting a commit.
- **`data-edited={hasOverride}`** — React renders a boolean attribute value as
  the string `"true"`/`"false"`, which is what the tests assert. Do not
  `String(hasOverride)`.
- **No `as` anywhere.** The tuple-vs-conditional discriminator is `Array.isArray`
  (used already in `isStepTuple`); the `relatedTarget` narrowing in
  `ConfirmRemove` uses `instanceof Node`.
- **Keep `renameProduct` / `removeProduct` / `addProduct` wired** — Wave 2
  removes gallery editing, not this plan.
- Don't add a `useEffect` to reset `editing` on category change — `App.tsx`'s
  `key={activeCategory}` remount already does it (a test locks this).
