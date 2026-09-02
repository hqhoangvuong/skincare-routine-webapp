# Content Editor Usability — Wave 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop step reordering and editable day-header fields to the in-app content editor, and fix `isStepEdited` so reorder/delete never mislabels an untouched step.

**Architecture:** Three independent slices. (1) `isStepEdited` switches from comparing a step against the `routine.ts` default at its *current* array index to the default at its *original* index, parsed from the step's frozen `stepId`. (2) A pure `moveStep` helper plus a no-dependency `useDragSort` hook (native Pointer Events + `ArrowUp`/`ArrowDown`), wired into `DayPanel`'s edit-mode step list. (3) `updateDayMeta` / `setFocusPrefix` pure helpers plus a "Day header" edit block in `DayPanel`; `CategoryOverride` gains one additive optional `focusPrefix?: string` — no `AppState` version bump, no migration.

**Tech Stack:** React 18, Vite 5, TypeScript strict, Vitest + @testing-library/react (jsdom). No backend change.

**Spec:** `docs/superpowers/specs/2026-09-02-content-editor-usability-w2-spec.md`

## Global Constraints

- **No new dependencies.** The drag interaction is native Pointer Events.
- **No `as` casts (bracket-form `as T[]` included), no `any`, no `@ts-ignore` / `@ts-nocheck`, no non-null `!`** anywhere in `src/` or `worker/`, tests included. Narrow with type predicates. `npm run lint:constraints` runs first in `npm run test` (it misses bracket-form `as` — follow the rule regardless). `as const` const-assertions are fine.
- **TypeScript `strict: true`.** `npm run build` runs `typecheck` on `tsconfig.json` and `tsconfig.worker.json` and fails on any error.
- **`src/shared/`** is imported by both the frontend and the Worker; the `content.ts` / `types.ts` changes must keep both builds green.
- **Vietnamese UI copy** for every user-facing string. Exact strings are in each task; copy them verbatim.
- **Port, not redesign** — no routine content string is changed.
- **`AppState` stays `version: 3`.** No migration, no new frozen `isVNState` snapshot. `CategoryOverride.focusPrefix` is an additive optional field only.
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
| `src/shared/types.ts` | `AppState` shape + guards | `CategoryOverride` +`focusPrefix?: string`; `isCategoryOverride` +optional-string check (Task 1) |
| `src/shared/content.ts` | content read seam + pure mutation helpers | `cloneOverride` carries `focusPrefix` (Task 1); **rewrite `isStepEdited`** (Task 2); +`moveStep` (Task 3); +`updateDayMeta` / `setFocusPrefix` / `getFocusPrefix` / `DEFAULT_FOCUS_PREFIX` / `isDayMetaEdited` (Task 4) |
| `src/hooks/useDragSort.ts` | **new** — pointer + keyboard sortable, local order, one `onReorder` per drag/keypress | Task 5 |
| `src/hooks/useDragSort.test.tsx` | **new** | Task 5 |
| `src/components/StepEditor.tsx` | one editable step row | +`dragHandle?: ReactNode` slot in `.step-edit-head` (Task 6) |
| `src/components/DayPanel.tsx` | the active day's cards | edit branch: `useDragSort` around the `StepEditor` list + handles + `onReorderStep` (Task 7); the Day-header edit block + badge via `getFocusPrefix` + day-meta marker (Task 8); `DayEdit` gains `onReorderStep` / `onUpdateDayMeta` / `onSetFocusPrefix` |
| `src/components/CategorySection.tsx` | per-category hero + tabs + panel | wire the three new `DayEdit` handlers to `editContent` + the new helpers (Task 9) |
| `src/components/CustomizationsStrip.tsx` | per-category change summary | +`isDayMetaEdited` tally + the `{d} ngày đổi tiêu đề` line (Task 10) |
| `src/styles.css` | stylesheet | `.drag-handle`, `.step-edit.dragging` (Task 7); `.day-header-edit` block (Task 8) |
| `CLAUDE.md` | repo guidance | document the new helpers + `focusPrefix` + the `isStepEdited` fix (Task 11) |

**Task dependency order:** 1 → 2 → 3 → 4 (needs 1's `focusPrefix`) → 5 → 6 → 7 (needs 3, 5, 6) → 8 (needs 4, 6) → 9 (needs 7, 8) → 10 (needs 4) → 11. Every task ends green and commits on its own.

---

## Task 1: `CategoryOverride.focusPrefix` (additive optional field)

Add one optional string field to `CategoryOverride`, teach the guard and the CoW clone about it. No version bump.

**Files:**
- Modify: `src/shared/types.ts` (`CategoryOverride` type ~line 53; `isCategoryOverride` ~line 195)
- Modify: `src/shared/content.ts` (`cloneOverride` ~line 152)
- Test: `src/shared/types.test.ts`, `src/shared/content.test.ts`

**Interfaces:**
- Produces:
  - `CategoryOverride = { products: string[]; days: StoredDay[]; focusPrefix?: string }`
  - `isCategoryOverride` also requires `(v.focusPrefix === undefined || typeof v.focusPrefix === "string")`
  - `cloneOverride` copies `focusPrefix` through

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/types.test.ts` (it already imports `isCategoryOverride`; a fixture builder `goodOverride` exists — reuse it):

```ts
describe("isCategoryOverride — focusPrefix", () => {
  it("accepts an override with a string focusPrefix and one with it absent", () => {
    expect(isCategoryOverride({ ...goodOverride, focusPrefix: "Tối nay: " })).toBe(true);
    expect(isCategoryOverride({ ...goodOverride })).toBe(true);
  });
  it("rejects a non-string focusPrefix", () => {
    expect(isCategoryOverride({ ...goodOverride, focusPrefix: 3 })).toBe(false);
  });
});
```

Add to `src/shared/content.test.ts` (in the mutation-helpers area — it imports `renameProduct`, `makeDefaultState`):

```ts
it("cloneOverride carries focusPrefix through a later CoW edit", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  // seed an override that already has a focusPrefix, then trigger another CoW edit
  const seeded = { ...base, overrides: { face: {
    products: [...routine.face.products],
    days: getStoredDays(base, "face"),
    focusPrefix: "Tối nay: ",
  } } };
  const after = renameProduct(seeded, "face", 0, "X");
  expect(after.overrides?.face?.focusPrefix).toBe("Tối nay: ");
});
```

`getStoredDays` and `routine` are already imported in `content.test.ts`; if not, add them from `./content` and `./routine`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/types.test.ts src/shared/content.test.ts`
Expected: FAIL — `isCategoryOverride` doesn't check `focusPrefix` yet (the `focusPrefix: 3` case wrongly passes); `cloneOverride` drops it (the CoW test gets `undefined`).

- [ ] **Step 3: Implement**

`src/shared/types.ts` — `CategoryOverride`:

```ts
export type CategoryOverride = {
  products: string[];
  days: StoredDay[];
  /** The face "Trọng tâm tối nay: " prefix, category-level. Absent = shipped default. */
  focusPrefix?: string;
};
```

`isCategoryOverride` — add the check to the returned `&&` chain (after the `days` checks):

```ts
    value.days.every(isStoredDay) &&
    (value.focusPrefix === undefined || typeof value.focusPrefix === "string")
```

`src/shared/content.ts` — `cloneOverride` returns the `focusPrefix` too:

```ts
function cloneOverride(o: CategoryOverride): CategoryOverride {
  return {
    products: [...o.products],
    focusPrefix: o.focusPrefix,
    days: o.days.map((day) =>
      "steps" in day
        ? { ...day, steps: day.steps.map((s) => ({ ...s })) }
        : { ...day, am: day.am.map((s) => ({ ...s })), pm: day.pm.map((s) => ({ ...s })) },
    ),
  };
}
```

(`focusPrefix: undefined` is fine on the return object — an absent-vs-undefined distinction doesn't matter here; `isCategoryOverride` accepts both and JSON drops `undefined`.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/types.test.ts src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green. `ensureOverride`'s fresh-category branch (`{ products: [...], days: [...] }`) still typechecks — `focusPrefix` is optional, so omitting it is valid.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/content.ts src/shared/types.test.ts src/shared/content.test.ts
git commit -m "feat(types): CategoryOverride.focusPrefix — additive optional field"
```

---

## Task 2: `isStepEdited` — compare by original index

Rewrite the comparison to use the index encoded in the step's frozen `stepId`, not the step's current array position.

**Files:**
- Modify: `src/shared/content.ts` (`isStepEdited` ~line 99)
- Test: `src/shared/content.test.ts` (rewrite the positional-caveat cases in the `describe("isStepEdited")` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `isStepEdited(state, category, dayIndex, phase, id): "modified" | "added" | null` — unchanged signature; a pure reorder / a delete-earlier-sibling now leaves untouched steps `null`.

- [ ] **Step 1: Write the failing tests**

In `src/shared/content.test.ts`, add to the `describe("isStepEdited")` block (import `moveStep` will not exist until Task 3 — do NOT use it here; use `removeStep` to shift indices, which already exists):

```ts
it("does not mark a step as modified after an earlier sibling is removed", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  // face day 0 (Monday) AM has 5 steps; remove index 0, survivors shift to 0..3
  const s = removeStep(base, "face", 0, "am", stepId("face", 0, "am", 0));
  const day = s.overrides?.face?.days[0];
  if (!day || "steps" in day) throw new Error("expected a face day");
  for (const st of day.am) {
    expect(isStepEdited(s, "face", 0, "am", st.id)).toBeNull();
  }
});

it("still marks a genuinely edited step even after its index shifts", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const editedId = stepId("face", 0, "am", 3);
  let s = updateStepTuple(base, "face", 0, "am", editedId, "Sản phẩm đổi", "");
  s = removeStep(s, "face", 0, "am", stepId("face", 0, "am", 0)); // now editedId sits at array index 2
  expect(isStepEdited(s, "face", 0, "am", editedId)).toBe("modified");
});
```

Keep any existing `isStepEdited` test that already asserts `"modified"` after `updateStepTuple` with no shift, `"added"` for a `new-*` id, and `null` for a no-override state. If an existing test asserted the *old buggy* "shifted step reads added/modified" behaviour, delete that test — the new tests above replace it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/content.test.ts`
Expected: FAIL — under the current code, after `removeStep` of index 0 the survivor at old-index 1 (id `face.0.am.1`) is compared against `defaultSteps[currentArrayIndex 0]` → mismatch → `"modified"`, not `null`.

- [ ] **Step 3: Implement**

Replace the body of `isStepEdited` from the `const index = stored.findIndex(...)` line onward, and replace the doc comment. New full function:

```ts
/**
 * Whether a step in an edited category differs from the shipped routine.
 * "added" — a `new-*` id (no shipped counterpart). "modified" — a default step
 * whose current form differs from routine.ts. null — no override, id not found,
 * or unchanged.
 *
 * The comparison is by the step's ORIGINAL index, encoded in its frozen id
 * (`${category}.${dayIndex}.${phase}.${index}`), not its current array position
 * — so reordering or deleting a sibling never mislabels an untouched step.
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
  const stored: StoredStep[] = "steps" in storedDay
    ? phase === "steps" ? storedDay.steps : []
    : phase === "am" ? storedDay.am : phase === "pm" ? storedDay.pm : [];

  const found = stored.find((s) => s.id === id);
  if (found === undefined) return null;

  const last = id.slice(id.lastIndexOf(".") + 1);
  if (last.startsWith("new-")) return "added";
  const originalIndex = Number(last);

  const defaultDay = routine[category].days[dayIndex];
  // can't reuse phaseArrayOf: it aliases steps→am on face days
  const defaultSteps: RoutineStep[] = isHairDay(defaultDay)
    ? phase === "steps" ? defaultDay.steps : []
    : phase === "am" ? defaultDay.am : phase === "pm" ? defaultDay.pm : [];

  const def = defaultSteps[originalIndex];
  if (def === undefined) return "added";
  return routineStepsEqual(found.step, def) ? null : "modified";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green. `DayPanel.test.tsx` / `CustomizationsStrip.test.tsx` assert marker behaviour via `updateStepTuple` (no shift) — unchanged. If a Wave 1 test in either file relied on the old positional-shift behaviour, update it to the fixed behaviour (a shifted-but-unedited step now shows no tag).

- [ ] **Step 6: Commit**

```bash
git add src/shared/content.ts src/shared/content.test.ts
git commit -m "fix(content): isStepEdited compares by original id-encoded index, not array position"
```

---

## Task 3: `moveStep` pure helper

**Files:**
- Modify: `src/shared/content.ts` (add after `removeStep`)
- Test: `src/shared/content.test.ts`

**Interfaces:**
- Consumes: `ensureOverride`, `phaseArrayOf`, `setPhaseArray`, `withOverride` (all private in `content.ts`).
- Produces: `moveStep(state: AppState, category: Category, dayIndex: number, phase: StepPhase, fromIndex: number, toIndex: number): AppState`

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/content.test.ts` (add `moveStep` to the `./content` import):

```ts
describe("moveStep", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

  it("reorders a step within a phase, ids and contents riding along", () => {
    const s = moveStep(base, "face", 0, "am", 0, 2);
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    // original ids were face.0.am.0 .. face.0.am.4; after moving 0 -> 2:
    expect(day.am.map((x) => x.id)).toEqual([
      "face.0.am.1", "face.0.am.2", "face.0.am.0", "face.0.am.3", "face.0.am.4",
    ]);
  });

  it("leaves completedSteps byte-unchanged", () => {
    const withChecks = { ...base, completedSteps: [
      { date: "2026-08-24", category: "face" as const, stepId: "face.0.am.0" },
    ] };
    const s = moveStep(withChecks, "face", 0, "am", 0, 2);
    expect(s.completedSteps).toEqual(withChecks.completedSteps);
  });

  it("returns the same state reference for same-index or out-of-range", () => {
    expect(moveStep(base, "face", 0, "am", 1, 1)).toBe(base);
    expect(moveStep(base, "face", 0, "am", -1, 0)).toBe(base);
    expect(moveStep(base, "face", 0, "am", 0, 99)).toBe(base);
  });

  it("does not create an override for other categories", () => {
    const s = moveStep(base, "face", 0, "am", 0, 1);
    expect(s.overrides?.hair).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/content.test.ts`
Expected: FAIL — `moveStep` is not exported.

- [ ] **Step 3: Implement**

Add to `src/shared/content.ts` after `removeStep`:

```ts
export function moveStep(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
  fromIndex: number, toIndex: number,
): AppState {
  const o0 = state.overrides?.[category];
  const currentDay = o0 ? o0.days[dayIndex] : getStoredDays(state, category)[dayIndex];
  const len = phaseArrayOf(currentDay, phase).length;
  if (
    fromIndex === toIndex ||
    fromIndex < 0 || fromIndex >= len ||
    toIndex < 0 || toIndex >= len
  ) {
    return state;
  }

  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const arr = [...phaseArrayOf(day, phase)];
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  o.days[dayIndex] = setPhaseArray(day, phase, arr);
  return withOverride(state, category, o);
}
```

The `const [moved] = arr.splice(...)` — `moved` is `StoredStep | undefined` to TS, but the range guards above ensure `fromIndex` is in-bounds so `splice(fromIndex, 1)` yields exactly one element. `arr.splice(toIndex, 0, moved)` accepts `StoredStep | undefined` only if the array element type widens — it will not, since `phaseArrayOf` returns `StoredStep[]`. If `strict` flags `moved` as possibly-undefined at the `arr.splice(toIndex, 0, moved)` call, guard it: `if (!moved) return state;` right after the destructure (a truthiness check, not a non-null assertion).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + constraints + commit**

```bash
npm run lint:constraints && npm run typecheck && npm run test
git add src/shared/content.ts src/shared/content.test.ts
git commit -m "feat(content): moveStep — reorder a step within a phase, ids ride along"
```

---

## Task 4: Day-metadata helpers

**Files:**
- Modify: `src/shared/content.ts` (add near the other mutation helpers)
- Test: `src/shared/content.test.ts`

**Interfaces:**
- Consumes: `ensureOverride`, `withOverride`, `routine`, `isHairDay`; `Category`, `AppState`.
- Produces:
  - `updateDayMeta(state, category, dayIndex, patch: { full?: string; focus?: string; type?: string }): AppState`
  - `setFocusPrefix(state, category, prefix: string): AppState`
  - `getFocusPrefix(state, category): string`
  - `isDayMetaEdited(state, category, dayIndex): boolean`
  - `DEFAULT_FOCUS_PREFIX: Record<Category, string>` (not exported — internal to `getFocusPrefix`; or export if a test wants it)

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/content.test.ts` (import the four new names):

```ts
describe("day metadata helpers", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

  it("updateDayMeta sets full on a face day and clones the category", () => {
    const s = updateDayMeta(base, "face", 0, { full: "Thứ Hai (BHA)" });
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.full).toBe("Thứ Hai (BHA)");
    expect(s.overrides?.hair).toBeUndefined();
  });

  it("updateDayMeta applies focus to a face day and ignores a type key", () => {
    const s = updateDayMeta(base, "face", 0, { focus: "BHA nhẹ", type: "ignored" });
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.focus).toBe("BHA nhẹ");
    expect("type" in day).toBe(false);
  });

  it("updateDayMeta applies type to a hair day and ignores a focus key", () => {
    const s = updateDayMeta(base, "hair", 0, { type: "Ngày gội mới", focus: "ignored" });
    const day = s.overrides?.hair?.days[0];
    if (!day || !("steps" in day)) throw new Error("hair day");
    expect(day.type).toBe("Ngày gội mới");
  });

  it("getFocusPrefix returns the shipped default, then the override value", () => {
    expect(getFocusPrefix(base, "face")).toBe("Trọng tâm tối nay: ");
    expect(getFocusPrefix(base, "body")).toBe("");
    expect(getFocusPrefix(base, "hair")).toBe("");
    const s = setFocusPrefix(base, "face", "Tối nay: ");
    expect(getFocusPrefix(s, "face")).toBe("Tối nay: ");
    const cleared = setFocusPrefix(base, "face", "");
    expect(getFocusPrefix(cleared, "face")).toBe(""); // explicit empty, not the default
  });

  it("isDayMetaEdited: false for no override / cloned-but-unedited, true after an edit", () => {
    expect(isDayMetaEdited(base, "face", 0)).toBe(false);
    const cloned = renameProduct(base, "face", 0, "X"); // CoW clone, day meta untouched
    expect(isDayMetaEdited(cloned, "face", 0)).toBe(false);
    expect(isDayMetaEdited(updateDayMeta(base, "face", 0, { focus: "z" }), "face", 0)).toBe(true);
    expect(isDayMetaEdited(setFocusPrefix(base, "face", "z"), "face", 3)).toBe(true); // any day of that category
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/content.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

Add to `src/shared/content.ts`:

```ts
const DEFAULT_FOCUS_PREFIX: Record<Category, string> = {
  face: "Trọng tâm tối nay: ",
  body: "",
  hair: "",
};

export function updateDayMeta(
  state: AppState, category: Category, dayIndex: number,
  patch: { full?: string; focus?: string; type?: string },
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  if ("steps" in day) {
    o.days[dayIndex] = {
      ...day,
      full: patch.full ?? day.full,
      type: patch.type ?? day.type,
    };
  } else {
    o.days[dayIndex] = {
      ...day,
      full: patch.full ?? day.full,
      focus: patch.focus ?? day.focus,
    };
  }
  return withOverride(state, category, o);
}

export function setFocusPrefix(state: AppState, category: Category, prefix: string): AppState {
  const o = ensureOverride(state, category);
  o.focusPrefix = prefix;
  return withOverride(state, category, o);
}

export function getFocusPrefix(state: AppState, category: Category): string {
  const p = state.overrides?.[category]?.focusPrefix;
  return p ?? DEFAULT_FOCUS_PREFIX[category];
}

export function isDayMetaEdited(state: AppState, category: Category, dayIndex: number): boolean {
  const override = state.overrides?.[category];
  if (!override) return false;
  if (override.focusPrefix !== undefined) return true;
  const stored = override.days[dayIndex];
  const def = routine[category].days[dayIndex];
  if (stored.full !== def.full) return true;
  if ("steps" in stored && isHairDay(def)) return stored.type !== def.type;
  if (!("steps" in stored) && !isHairDay(def)) return stored.focus !== def.focus;
  return false;
}
```

Note `updateDayMeta` uses `patch.full ?? day.full` — an **empty string** `patch.full = ""` would fall through to `day.full` because `"" ?? x` is `""` (nullish coalescing only catches `null`/`undefined`), so `""` is stored. Good — that matches the spec ("empty string stored as-is"). If a reviewer worries the `??` drops `""`, confirm: `"" ?? "y"` evaluates to `""`. Correct.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + constraints + commit**

```bash
npm run lint:constraints && npm run typecheck && npm run test
git add src/shared/content.ts src/shared/content.test.ts
git commit -m "feat(content): updateDayMeta / setFocusPrefix / getFocusPrefix / isDayMetaEdited"
```

---

## Task 5: `useDragSort` hook

A no-dependency sortable-list hook: native Pointer Events (midpoint-crossing live re-sort) plus `ArrowUp` / `ArrowDown`. One `onReorder` per completed drag or per arrow press.

**Files:**
- Create: `src/hooks/useDragSort.ts`
- Test: `src/hooks/useDragSort.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  useDragSort<T>(
    items: T[],
    keyOf: (item: T) => string,
    onReorder: (fromIndex: number, toIndex: number) => void,
  ): {
    order: T[];
    handleProps: (index: number) => {
      onPointerDown: (e: React.PointerEvent) => void;
      onKeyDown: (e: React.KeyboardEvent) => void;
      "aria-label": string;
    };
    draggingKey: string | null;
  }
  ```

- [ ] **Step 1: Write the failing tests**

`src/hooks/useDragSort.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, afterEach } from "vitest";
import { useDragSort } from "./useDragSort";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDragSort — keyboard", () => {
  it("ArrowDown on row i fires onReorder(i, i+1)", async () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    screen.getByRole("button", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("ArrowUp on row i fires onReorder(i, i-1)", async () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    screen.getByRole("button", { name: "Gamma" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onReorder).toHaveBeenCalledWith(2, 1);
  });

  it("guards the ends: ArrowUp on row 0 and ArrowDown on the last row fire nothing", async () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    screen.getByRole("button", { name: "Alpha" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    screen.getByRole("button", { name: "Gamma" }).focus();
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
  it("a drag past the next row's midpoint commits one onReorder(0, 1) on pointerup", async () => {
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
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    // move the pointer down past row 1's midpoint (y = 60)
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: 65, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 65, pointerId: 1 }));
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("a pointerdown+pointerup with no midpoint crossing fires nothing", () => {
    const onReorder = vi.fn();
    render(<List items={rows} onReorder={onReorder} />);
    const handle = screen.getAllByRole("button")[0];
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientY: 10, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientY: 12, pointerId: 1 }));
    expect(onReorder).not.toHaveBeenCalled();
  });
});
```

> jsdom notes: `PointerEvent` exists in jsdom 24+ (this repo's version). `setPointerCapture` is a no-op stub in jsdom — the hook may call it but must not depend on its effect; the `pointermove`/`pointerup` listeners are added on `window`, not the captured element, so the test dispatches them on `window`. If `PointerEvent` is missing, the test may `class PointerEventPolyfill extends MouseEvent { pointerId: number; constructor(t, i) { super(t, i); this.pointerId = i?.pointerId ?? 0 } }` and `vi.stubGlobal("PointerEvent", PointerEventPolyfill)` — but check first; jsdom likely has it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/useDragSort.test.tsx`
Expected: FAIL — `./useDragSort` does not exist.

- [ ] **Step 3: Implement `src/hooks/useDragSort.ts`**

```ts
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
```

Design notes for the implementer:
- `order` is a fresh `items.map` on every render when `drag` is `null`, so it always tracks `items`. During a drag it is `drag.order` mapped through `items`.
- The `pointermove` / `pointerup` listeners live on `window` for the drag's lifetime (added in a `useEffect` keyed on `drag`), so a pointer that leaves the handle still drives the sort, and cleanup removes them on drop or unmount.
- One `onReorder` fires in `endDrag`, with `(fromIndex, finalVisualIndex)`. `moveStep` (Task 3) interprets those as splice-from / splice-to, which matches: the item started at `fromIndex` and ends at `finalIndex` in the same array.
- Arrow keys call `onReorder` directly, guarded at the ends, `preventDefault` always.
- No cast anywhere. `child instanceof HTMLElement` and `moved === undefined` are the narrowing forms.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/hooks/useDragSort.test.tsx`
Expected: PASS. If the pointer test's rect-mocking is flaky in your jsdom, fall back to asserting only: keyboard paths, `order` tracking, and that a `pointerdown` sets `data-dragging="true"` on the row — and note in the report that the midpoint-crossing math is covered by the arrow-key path plus a manual check.

- [ ] **Step 5: Full suite + typecheck + constraints + commit**

```bash
npm run lint:constraints && npm run typecheck && npm run test
git add src/hooks/useDragSort.ts src/hooks/useDragSort.test.tsx
git commit -m "feat(hooks): useDragSort — no-dependency pointer + keyboard sortable list"
```

---

## Task 6: `StepEditor` drag-handle slot

**Files:**
- Modify: `src/components/StepEditor.tsx`
- Test: `src/components/StepEditor.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StepEditor` props gain `dragHandle?: ReactNode` — rendered as the first child of `.step-edit-head`, before the collapse toggle. Absent → nothing rendered.

- [ ] **Step 1: Write the failing test**

Add to `src/components/StepEditor.test.tsx`:

```tsx
it("renders a dragHandle node before the toggle when given one", () => {
  render(
    <StepEditor
      display={{ id: "x", product: "Toner", note: "" }}
      raw={["Toner", ""]}
      dragHandle={<button aria-label="handle">::</button>}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()}
    />,
  );
  const head = document.querySelector(".step-edit-head");
  if (!(head instanceof HTMLElement)) throw new Error("no head");
  expect(head.firstElementChild).toHaveAttribute("aria-label", "handle");
});

it("renders no handle when dragHandle is omitted", () => {
  render(
    <StepEditor display={{ id: "x", product: "Toner", note: "" }} raw={["Toner", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />,
  );
  const head = document.querySelector(".step-edit-head");
  if (!(head instanceof HTMLElement)) throw new Error("no head");
  expect(head.firstElementChild?.getAttribute("aria-label")).toContain("Sửa bước");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/StepEditor.test.tsx`
Expected: FAIL — `dragHandle` prop doesn't exist; the toggle is currently `firstElementChild`.

- [ ] **Step 3: Implement**

In `src/components/StepEditor.tsx`:
- Add `dragHandle` to the props type: `dragHandle?: ReactNode;` and to the destructure (default nothing).
- Add `import type { ReactNode } from "react";` (extend the existing `react` import — the file already imports `useEffect, useRef, useState`).
- In the JSX, make `dragHandle` the first child of `.step-edit-head`:

```tsx
<div className="step-edit-head">
  {dragHandle}
  <button type="button" className="step-edit-toggle" aria-expanded={open}
    aria-label={`Sửa bước: ${display.product || "Bước chưa đặt tên"}${edited ? ` (${EDIT_TAG[edited]})` : ""}`}
    onClick={() => setOpen((v) => !v)}>
    ...
  </button>
  <ConfirmRemove label="Xoá bước" onConfirm={onRemove} />
</div>
```

- [ ] **Step 4: Run to verify pass + full suite + commit**

```bash
npx vitest run src/components/StepEditor.test.tsx && npm run lint:constraints && npm run typecheck && npm run test
git add src/components/StepEditor.tsx src/components/StepEditor.test.tsx
git commit -m "feat(editor): StepEditor dragHandle slot"
```

---

## Task 7: `DayPanel` — wire step reorder

`PhaseBody`'s edit branch drives its `StepEditor` list through `useDragSort`; each row gets a handle; a reorder calls a new `DayEdit.onReorderStep`.

**Files:**
- Modify: `src/components/DayPanel.tsx`
- Modify: `src/styles.css`
- Test: `src/components/DayPanel.test.tsx`

**Interfaces:**
- Consumes: `useDragSort` (Task 5); `StepEditor`'s `dragHandle` (Task 6).
- Produces: `DayEdit` gains `onReorderStep: (phase: StepPhase, fromIndex: number, toIndex: number) => void`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/DayPanel.test.tsx`:

```tsx
it("edit mode renders a drag handle per step; ArrowDown on the first calls onReorderStep", async () => {
  const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const onEdit = {
    onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(),
    onSetVariant: vi.fn(), onReorderStep: vi.fn(),
    onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn(),
  };
  render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={onEdit} />);
  const handles = screen.getAllByRole("button", { name: /Kéo để sắp xếp bước/ });
  expect(handles.length).toBeGreaterThan(1);
  handles[0].focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(onEdit.onReorderStep).toHaveBeenCalledWith("am", 0, 1);
});
```

> `onEdit` now needs all seven members because `DayEdit` is a required-shape object once you add the new ones. Tasks 8 adds `onUpdateDayMeta` / `onSetFocusPrefix`; include them here as `vi.fn()` so this test compiles after Task 8 too. If Task 7 runs before Task 8's type change, drop the two day-meta mocks and add them in Task 8's test edit.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DayPanel.test.tsx`
Expected: FAIL — no drag handles rendered; `onReorderStep` not a `DayEdit` member.

- [ ] **Step 3: Implement**

`src/components/DayPanel.tsx`:

- `import { useDragSort } from "../hooks/useDragSort";`
- `DayEdit` type — add `onReorderStep: (phase: StepPhase, fromIndex: number, toIndex: number) => void;`
- In `PhaseBody`'s `editing && onEdit` branch, replace the `<ul>` + `.map` with a `useDragSort`-driven list. Because `useDragSort` is a hook, it must be called at the top of `PhaseBody` (not inside the `if`). Restructure:

```tsx
function PhaseBody({ phase, resolvedSteps, storedSteps, state, category, dayIndex,
  completedSteps, nowIso, onToggleStep, editing, onEdit, justAddedId = null, openStepId = null,
}: { /* …existing prop types… + nothing new */ }) {
  const { order, handleProps, draggingKey } = useDragSort(
    resolvedSteps,
    (rs) => rs.id,
    (from, to) => onEdit?.onReorderStep(phase, from, to),
  );

  if (editing && onEdit) {
    const storedById = new Map(storedSteps.map((s) => [s.id, s]));
    return (
      <>
        <ul className="steps steps-edit">
          {order.map((rs) => {
            const stored = storedById.get(rs.id);
            if (!stored) return null;
            const originalIndex = storedSteps.indexOf(stored);
            return (
              <StepEditor
                key={rs.id}
                display={rs}
                raw={stored.step}
                edited={isStepEdited(state, category, dayIndex, phase, rs.id)}
                initialOpen={rs.id === justAddedId || rs.id === openStepId}
                autoFocusFirst={rs.id === justAddedId}
                dragHandle={
                  <button
                    type="button"
                    className={`drag-handle${draggingKey === rs.id ? " is-dragging" : ""}`}
                    {...handleProps(originalIndex)}
                  >
                    ⠿
                  </button>
                }
                onUpdateTuple={(p, n) => onEdit.onUpdateStep(phase, rs.id, p, n)}
                onSetVariant={(v) => onEdit.onSetVariant(phase, rs.id, v)}
                onRemove={() => onEdit.onRemoveStep(phase, rs.id)}
              />
            );
          })}
        </ul>
        <button type="button" className="add-step" onClick={() => onEdit.onAddStep(phase)}>
          + Thêm bước
        </button>
      </>
    );
  }
  return (
    <Steps steps={resolvedSteps} category={category} dayIndex={dayIndex}
      completedSteps={completedSteps} nowIso={nowIso} onToggleStep={onToggleStep} />
  );
}
```

Notes:
- `handleProps(originalIndex)` is passed the step's index in the **prop** array (`storedSteps`), which matches `resolvedSteps` order, which is what `useDragSort` was initialised with. `useDragSort`'s `onReorder(from, to)` then reports indices into that same array — exactly what `moveStep` wants.
- `draggingKey === rs.id` toggles `.is-dragging` on the **handle** button (via the `className` template above). The spec mentions a `.step-edit.dragging` class on the `<li>`; this plan deliberately keeps it simpler — the lifted state is shown on the handle only (`cursor: grabbing; opacity: .5`), no `<li>` class, no extra `StepEditor` prop. That is the intended Wave 2 scope for the drag affordance.
- `useDragSort` is called unconditionally at the top of `PhaseBody` even in read mode; `order` just equals `resolvedSteps` and `handleProps` is never rendered — harmless. `onEdit?.onReorderStep` is optional-chained for the read-mode call site that never fires.

- [ ] **Step 4: Styles**

Append to `src/styles.css`:

```css
.drag-handle{
  border:none;background:none;color:var(--rose-deep);font-size:16px;line-height:1;
  padding:2px 4px;cursor:grab;touch-action:none;
}
.drag-handle.is-dragging{cursor:grabbing;opacity:.5;}
```

- [ ] **Step 5: Run to verify pass + full suite + build**

Run: `npx vitest run src/components/DayPanel.test.tsx && npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/DayPanel.tsx src/styles.css src/components/DayPanel.test.tsx
git commit -m "feat(editor): drag + arrow-key step reorder in DayPanel"
```

---

## Task 8: `DayPanel` — Day-header edit block

A block above the cards, in edit mode only, with buffered inputs for `full`, `focus`/`type`, and (face) `focusPrefix`; a marker; the badge reads `getFocusPrefix`.

**Files:**
- Modify: `src/components/DayPanel.tsx`
- Modify: `src/styles.css`
- Test: `src/components/DayPanel.test.tsx`

**Interfaces:**
- Consumes: `updateDayMeta` isn't called here (the callbacks are wired in Task 9) — `DayPanel` only calls the `onEdit` members. `getFocusPrefix`, `isDayMetaEdited` from `content.ts` (Task 4); `useBufferedText` from `src/hooks/useBufferedText.ts`.
- Produces: `DayEdit` gains
  `onUpdateDayMeta: (patch: { full?: string; focus?: string; type?: string }) => void` and
  `onSetFocusPrefix: (prefix: string) => void`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/DayPanel.test.tsx`:

```tsx
it("edit mode shows the day-header block; blurring the name input calls onUpdateDayMeta", async () => {
  const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const onEdit = {
    onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn(),
    onReorderStep: vi.fn(), onUpdateDayMeta: vi.fn(), onSetFocusPrefix: vi.fn(),
  };
  render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={onEdit} />);
  const nameInput = screen.getByLabelText("Tên ngày");
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, "Thứ Hai BHA");
  expect(onEdit.onUpdateDayMeta).not.toHaveBeenCalled(); // buffered
  await userEvent.tab();
  expect(onEdit.onUpdateDayMeta).toHaveBeenCalledWith({ full: "Thứ Hai BHA" });
});

it("the face badge uses getFocusPrefix from the override", () => {
  const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const state = { ...base, overrides: { face: {
    products: [...routine.face.products],
    days: getStoredDays(base, "face"),
    focusPrefix: "Tối nay xoáy vào: ",
  } } };
  render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW} />);
  expect(screen.getByText(/Tối nay xoáy vào:/)).toBeInTheDocument();
});

it("read mode shows no day-header inputs", () => {
  const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW} />);
  expect(screen.queryByLabelText("Tên ngày")).toBeNull();
});
```

`routine` and `getStoredDays` need importing in the test file if not already.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/DayPanel.test.tsx`
Expected: FAIL — no `Tên ngày` input; badge still uses `copy.badgePrefix`.

- [ ] **Step 3: Implement**

`src/components/DayPanel.tsx`:

- `import { getFocusPrefix, isDayMetaEdited } from "../shared/content";` (extend the existing content import); `import { useBufferedText } from "../hooks/useBufferedText";`
- `DayEdit` type — add the two members above.
- New local component `DayHeaderEdit` (in `DayPanel.tsx`, above the `DayPanel` function):

```tsx
function DayHeaderEdit({
  state, category, dayIndex, day, onEdit,
}: {
  state: AppState;
  category: Category;
  dayIndex: number;
  day: ResolvedDay;
  onEdit: DayEdit;
}) {
  const nameBuf = useBufferedText(day.full, (v) => onEdit.onUpdateDayMeta({ full: v }));
  const isHair = day.kind === "hair";
  const focusVal = isHair ? day.type : day.focus;
  const focusBuf = useBufferedText(focusVal, (v) =>
    onEdit.onUpdateDayMeta(isHair ? { type: v } : { focus: v }),
  );
  const prefixBuf = useBufferedText(getFocusPrefix(state, category), (v) => onEdit.onSetFocusPrefix(v));
  const edited = isDayMetaEdited(state, category, dayIndex);

  return (
    <div className="day-header-edit">
      <div className="day-header-edit-row">
        <span>Tiêu đề ngày</span>
        {edited && <span className="step-edit-tag">đã đổi</span>}
      </div>
      <label>
        Tên ngày
        <input type="text" value={nameBuf.value} onChange={nameBuf.onChange}
          onFocus={nameBuf.onFocus} onBlur={nameBuf.onBlur} />
      </label>
      <label>
        {isHair ? "Loại ngày" : "Trọng tâm"}
        <input type="text" value={focusBuf.value} onChange={focusBuf.onChange}
          onFocus={focusBuf.onFocus} onBlur={focusBuf.onBlur} />
      </label>
      {category === "face" && (
        <label>
          Tiền tố nhãn (áp dụng cả mục)
          <input type="text" value={prefixBuf.value} onChange={prefixBuf.onChange}
            onFocus={prefixBuf.onFocus} onBlur={prefixBuf.onBlur} />
        </label>
      )}
    </div>
  );
}
```

- In `DayPanel`'s render, in **both** the hair branch and the face/body branch, insert `{editing && onEdit && <DayHeaderEdit state={state} category={category} dayIndex={dayIndex} day={day} onEdit={onEdit} />}` immediately inside `<div className="panel active">`, before `<div className="badge-row">`.
- Replace the face/body badge `{copy.badgePrefix}` with `{getFocusPrefix(state, category)}`:

```tsx
<span className="badge">
  {getFocusPrefix(state, category)}
  {day.focus}
</span>
```

`copy.badgePrefix` is no longer read; `copy.am` / `copy.pm` still are. Leave `PANEL_COPY`'s `badgePrefix` key in place (harmless) or delete it and the `badgePrefix` from the `Record<...>` type — either is fine; deleting is cleaner.

- [ ] **Step 4: Styles**

Append to `src/styles.css`:

```css
.day-header-edit{
  margin:0 0 14px;padding:12px;border:1px solid var(--line);border-radius:12px;
  background:var(--blush);display:grid;gap:8px;
}
.day-header-edit-row{display:flex;align-items:center;gap:8px;font-weight:800;font-size:12px;color:var(--rose-ink);}
.day-header-edit label{display:grid;gap:3px;font-size:11.5px;font-weight:700;color:var(--rose-ink);}
.day-header-edit input{border:1px solid var(--line);border-radius:8px;padding:7px 9px;font:inherit;font-size:12px;color:var(--rose-ink);background:#fff;}
```

- [ ] **Step 5: Run to verify pass + full suite + build + commit**

```bash
npx vitest run src/components/DayPanel.test.tsx && npm run lint:constraints && npm run typecheck && npm run test && npm run build
git add src/components/DayPanel.tsx src/styles.css src/components/DayPanel.test.tsx
git commit -m "feat(editor): editable day header (name / focus / type / prefix) in DayPanel"
```

---

## Task 9: `CategorySection` — wire the three new handlers

**Files:**
- Modify: `src/components/CategorySection.tsx` (the `<DayPanel onEdit={{ … }}>` object, ~line 374)
- Test: `src/components/CategorySection.test.tsx`

**Interfaces:**
- Consumes: `moveStep`, `updateDayMeta`, `setFocusPrefix` from `content.ts` (Tasks 3, 4); `DayEdit`'s three new members (Tasks 7, 8).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Add to `src/components/CategorySection.test.tsx` (import `stepId` from `../shared/content`; the file already imports `makeDefaultState`, `userEvent`, a stateful pattern):

```tsx
it("a keyboard step reorder in edit mode changes the rendered order", async () => {
  render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
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
  render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
  await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
  const nameInput = screen.getByLabelText("Tên ngày");
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, "Ngày BHA");
  await userEvent.tab();
  expect(screen.getByLabelText("Tên ngày")).toHaveValue("Ngày BHA");
});
```

`stateProps` is the Wave 1 fixture (`{ state: makeDefaultState(...), onToggleStep: () => {}, editContent: () => {} }`). **These tests need a real `editContent`** — replace the fixture's no-op with a stateful wrapper for these two tests, e.g. a local `Host` component that holds `state` in `useState` and passes `editContent={(mut) => setState(mut)}`, mirroring how the Wave 1 "day-tab persistence" test was structured. If a `Host` helper already exists in the file, reuse it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/CategorySection.test.tsx`
Expected: FAIL — `onReorderStep` / `onUpdateDayMeta` / `onSetFocusPrefix` aren't in the `onEdit` object, so `DayPanel`'s `onEdit` prop is missing required members (type error) and no reorder/name-edit happens.

- [ ] **Step 3: Implement**

In `src/components/CategorySection.tsx`, add to the `<DayPanel onEdit={{ … }}>` object (extend the existing import from `../shared/content` with `moveStep, updateDayMeta, setFocusPrefix`):

```tsx
        onEdit={{
          onAddStep: (phase) => {
            const n = state.stepSeq ?? 0;
            // keep this id template in sync with content.ts#addStep
            setJustAddedId(`${category}.${activeDay}.${phase}.new-${n}`);
            editContent((s) => addStep(s, category, activeDay, phase));
          },
          onUpdateStep: (phase, id, product, note) =>
            editContent((s) => updateStepTuple(s, category, activeDay, phase, id, product, note)),
          onRemoveStep: (phase, id) => editContent((s) => removeStep(s, category, activeDay, phase, id)),
          onSetVariant: (phase, id, variant) =>
            editContent((s) => setStepVariant(s, category, activeDay, phase, id, variant)),
          onReorderStep: (phase, from, to) =>
            editContent((s) => moveStep(s, category, activeDay, phase, from, to)),
          onUpdateDayMeta: (patch) =>
            editContent((s) => updateDayMeta(s, category, activeDay, patch)),
          onSetFocusPrefix: (prefix) =>
            editContent((s) => setFocusPrefix(s, category, prefix)),
        }}
```

- [ ] **Step 4: Run to verify pass + full suite + build + commit**

```bash
npx vitest run src/components/CategorySection.test.tsx && npm run lint:constraints && npm run typecheck && npm run test && npm run build
git add src/components/CategorySection.tsx src/components/CategorySection.test.tsx
git commit -m "feat(editor): wire reorder + day-meta handlers through CategorySection"
```

---

## Task 10: `CustomizationsStrip` — day-meta count line

**Files:**
- Modify: `src/components/CustomizationsStrip.tsx`
- Test: `src/components/CustomizationsStrip.test.tsx`

**Interfaces:**
- Consumes: `isDayMetaEdited` from `content.ts` (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Add to `src/components/CustomizationsStrip.test.tsx` (import `updateDayMeta` from `../shared/content`):

```tsx
it("shows a day-meta count line when a day's header was edited", () => {
  let s = makeDefaultState(start);
  s = updateDayMeta(s, "face", 2, { focus: "BHA nhẹ" });
  render(<CustomizationsStrip state={s} category="face" onJump={vi.fn()} onReset={vi.fn()} />);
  expect(screen.getByText(/1 ngày đổi tiêu đề/)).toBeInTheDocument();
});

it("no day-meta line when only steps changed", () => {
  let s = makeDefaultState(start);
  s = updateStepTuple(s, "face", 0, "am", stepId("face", 0, "am", 0), "x", "");
  render(<CustomizationsStrip state={s} category="face" onJump={vi.fn()} onReset={vi.fn()} />);
  expect(screen.queryByText(/ngày đổi tiêu đề/)).toBeNull();
});
```

`start`, `updateStepTuple`, `stepId` are already imported in this test file (Wave 1).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/CustomizationsStrip.test.tsx`
Expected: FAIL — no such text.

- [ ] **Step 3: Implement**

In `src/components/CustomizationsStrip.tsx`:
- Imports: extend the `../shared/content` import — you do **not** need `isDayMetaEdited` here (calling it per day would count every day once `focusPrefix` is set). Add `import { routine } from "../shared/routine";`.
- Compute the day-meta count in the component body, after `const changes = collectChanges(...)` — count a day only if its own `full` / `focus` / `type` differs from the shipped default, then add `focusPrefix` as **one** extra:

```tsx
const daysWithMeta = getStoredDays(state, category).filter((day, dayIndex) => {
  const def = routine[category].days[dayIndex];
  if (day.full !== def.full) return true;
  if ("steps" in day && "steps" in def) return day.type !== def.type;
  if (!("steps" in day) && !("steps" in def)) return day.focus !== def.focus;
  return false;
}).length;
const prefixChanged = state.overrides?.[category]?.focusPrefix !== undefined;
const dayMetaCount = daysWithMeta + (prefixChanged ? 1 : 0);
```

  The label reads "ngày đổi tiêu đề"; a prefix-only change counting as "1" is acceptable copy-wise.

- Extend the summary line. Currently:

```tsx
const parts = [`${modified} bước đã đổi`];
if (added > 0) parts.push(`${added} bước mới`);
```

  add:

```tsx
if (dayMetaCount > 0) parts.push(`${dayMetaCount} ngày đổi tiêu đề`);
```

  and the render condition `modified === 0 && added === 0` that hides the ` — …` clause must also account for `dayMetaCount`:

```tsx
✎ Bạn đã tuỳ chỉnh mục này{modified === 0 && added === 0 && dayMetaCount === 0 ? "" : ` — ${parts.join(", ")}`}
```

  Also: `parts` starts with `` `${modified} bước đã đổi` `` unconditionally — so a day-meta-only change shows "0 bước đã đổi, 1 ngày đổi tiêu đề". Make the first part conditional too:

```tsx
const parts: string[] = [];
if (modified > 0) parts.push(`${modified} bước đã đổi`);
if (added > 0) parts.push(`${added} bước mới`);
if (dayMetaCount > 0) parts.push(`${dayMetaCount} ngày đổi tiêu đề`);
```

  (This also fixes a latent Wave 1 wart where an added-only change showed "0 bước đã đổi, N bước mới".)

- [ ] **Step 4: Run to verify pass + full suite + commit**

```bash
npx vitest run src/components/CustomizationsStrip.test.tsx && npm run lint:constraints && npm run typecheck && npm run test
git add src/components/CustomizationsStrip.tsx src/components/CustomizationsStrip.test.tsx
git commit -m "feat(editor): CustomizationsStrip counts day-header edits"
```

---

## Task 11: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the content-editor area (the Wave 1 "Editor input & feedback plumbing" block), append a "Wave 2" note:

> **Reorder & day-header editing (usability Wave 2):** `content.ts#moveStep(state,
> category, dayIndex, phase, fromIndex, toIndex)` reorders a step within a phase
> (ids ride along on the `StoredStep`, so `completedSteps` and `isStepEdited`
> stay correct); a no-dependency `src/hooks/useDragSort.ts` drives it from a
> `.drag-handle` per row (native Pointer Events, plus `ArrowUp`/`ArrowDown` on
> the handle). `content.ts#updateDayMeta` / `setFocusPrefix` / `getFocusPrefix`
> edit a day's `full` name and its `focus` (face/body) or `type` (hair), plus
> the face-only category-level `focusPrefix` (`CategoryOverride.focusPrefix?:
> string` — an additive optional field; `AppState` is still `version: 3`, no
> migration). `isStepEdited` now compares each step against the shipped default
> at its **original** (id-encoded) index, not its current array position — so a
> reorder or a sibling delete never mislabels an untouched step.

Then **find and fix** the Wave 1 sentence that still says `isStepEdited`
"compares positionally against `routine.ts`, so a `removeStep` that shifts
indices can mislabel a step until Wave 2's stable ordering" — replace it with:
"compares each step against the shipped default at its original id-encoded
index, so reorder and sibling-delete leave untouched steps unmarked".

- [ ] **Step 2: Full gate**

Run: `npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green. Record the exact test counts.

- [ ] **Step 3: Manual click-through** (`npm run dev`, phone-width viewport)

1. Enter edit mode. Each step row shows a `⠿` handle on the left.
2. Drag a handle down past the next row — the list re-sorts under your finger; drop → order sticks. Drag back up → sticks.
3. Focus a handle, press `ArrowDown` / `ArrowUp` — the row moves one slot; at the ends nothing happens and the page doesn't scroll.
4. The day-header block sits above the AM card: edit "Tên ngày" and "Trọng tâm" — blur → the badge above the steps updates. Edit "Tiền tố nhãn" → the badge prefix changes on every day of that category.
5. A changed day-header shows "đã đổi"; the customisations strip gains "N ngày đổi tiêu đề".
6. Reorder a step, then leave edit mode and re-enter — no step shows "đã đổi" from the move alone; a genuinely edited step still does.
7. `Đặt lại` reverts order, day-header fields, and prefix together.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: content editor usability Wave 2 — reorder, day-header editing, isStepEdited fix"
```

---

## Notes for the executor

- **`useDragSort` is a hook** — call it unconditionally at the top of `PhaseBody`, never inside the `if (editing && onEdit)`. In read mode its `order` just equals `resolvedSteps` and its `handleProps` is never used.
- **`handleProps(index)` gets the ORIGINAL array index** (position in `storedSteps` / `resolvedSteps` as passed to `useDragSort`), not the visual `order` index. `useDragSort` maps between them internally and reports original-array indices to `onReorder`, which is what `moveStep` consumes.
- **jsdom `PointerEvent` / `setPointerCapture`**: jsdom 24 has `PointerEvent`; `setPointerCapture` is a stub. The hook guards `typeof el.setPointerCapture === "function"`. The pointer test dispatches `pointermove`/`pointerup` on `window` because that's where the hook listens.
- **`useBufferedText`** (Wave 1) is `useBufferedText(committed, commit)` → `{ value, onChange, onFocus, onBlur }`, commit on blur / unmount-while-focused. The day-header inputs use it exactly like `VariantEditor`'s `TupleFields`.
- **No `as` anywhere.** `child instanceof HTMLElement`, `moved === undefined`, `!(x instanceof HTMLElement)` in tests — all predicates.
- **`""` vs `undefined` for `focusPrefix`**: `setFocusPrefix(s, c, "")` stores `""` (meaning "no prefix"); a category with no override at all → `getFocusPrefix` returns the shipped default. `"" ?? default` is `""` (nullish coalescing only catches null/undefined), so an explicit empty prefix wins — this is intended.
- Don't touch `PANEL_COPY`'s `am`/`pm` copy — only the `badgePrefix` is externalised to `getFocusPrefix`.
