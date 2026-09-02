# Content Editor Usability — Wave 2 — Spec

Status: approved for planning
Date: 2026-09-02
Follows: [Wave 1 spec](./2026-09-02-content-editor-usability-w1-spec.md) (merged — PR #5)

## Goal

Add drag-and-drop step reordering, editable day header fields, and fix the
`isStepEdited` positional-comparison bug that reordering would otherwise make
permanent.

## Scope

**Wave 2 (this spec):**

1. **`isStepEdited` fix** — compare each stored step against the shipped default
   it *originally was* (index parsed from its frozen `stepId`), not the default
   at its current array position. Makes edit markers correct through reorder and
   through `removeStep`.
2. **Step reorder** — drag-and-drop (pointer) plus an arrow-key fallback, within
   one phase (AM / PM / hair `steps`) only. A pure `moveStep` helper; a small
   no-dependency `useDragSort` hook.
3. **Editable day header** — a day's `full` name, its `focus` (face/body) or
   `type` (hair) badge, and the face-only category-level `focusPrefix`
   ("Trọng tâm tối nay: "). Buffered inputs, an edit marker, a
   `CustomizationsStrip` line.

**Deferred to Wave 3:** the "real product shelf" — a maintained product list,
step-product autocomplete from it, add-to-shelf on a new name, a per-product
usage index. The current editable gallery and `CategoryOverride.products` are
untouched by Wave 2.

**Out of scope:** cross-phase (AM↔PM) step moves; reordering the AM/PM cards or
the day tabs; editing `PANEL_COPY`'s card titles/subtitles; the `short` day
label (it is the tab text and a weekday key); anything already out of scope for
Wave 1.

## Global constraints (inherited)

- **No new dependencies.** The drag interaction is native Pointer Events.
- **No `as` casts (bracket-form `as T[]` included), no `any`, no `@ts-ignore` /
  `@ts-nocheck`, no non-null `!`** in `src/` or `worker/`, tests included.
  `npm run lint:constraints` enforces it (it misses bracket-form `as` — follow
  the rule anyway). `as const` is fine.
- **TypeScript `strict: true`**; `npm run build` typechecks `tsconfig.json` and
  `tsconfig.worker.json`.
- **`src/shared/`** is imported by both the frontend and the Worker; the
  `content.ts` / `types.ts` changes must keep both builds green.
- **Vietnamese UI copy** for every user-facing string.
- **Port, not redesign** — no routine content string is changed.
- Node 20. Commit per task, TDD.

## Current state (what Wave 2 builds on)

- `src/shared/types.ts`: `AppState` is `version: 3`. `CategoryOverride = {
  products: string[]; days: StoredDay[] }`. `StoredDay` (`StoredFaceOrBodyDay` /
  `StoredHairDay`) already carries `full`, `focus` (face/body) or `type` (hair),
  and `short`. `isCategoryOverride` validates `products` + a 7-element `days`.
  Frozen `isV1State` / `isV2State` snapshots exist; `migrate` has v2→v3 and
  v1→v3 arms.
- `src/shared/content.ts`: `stepId(category, dayIndex, phase, index)` →
  `` `${category}.${dayIndex}.${phase}.${index}` `` for defaults,
  `` `…​.new-${n}` `` for added steps (from `addStep`, `n` from `stepSeq`).
  `getStoredDays` returns the override's frozen `days` or the shipped defaults
  wrapped with derived ids. `isStepEdited(state, category, dayIndex, phase, id)`
  → `"modified" | "added" | null`, currently comparing `stored[index].step`
  against `routine[category].days[dayIndex]`'s phase array **at the step's
  current array index** — with a doc comment admitting a `removeStep` shift can
  mislabel. The mutation helpers `ensureOverride` (CoW clone), `withOverride`,
  `phaseArrayOf`, `setPhaseArray`, `addStep`, `updateStepTuple`, `removeStep`,
  `setStepVariant`, `resetCategory`, plus `renameProduct` / `addProduct` /
  `removeProduct`.
- `src/components/DayPanel.tsx`: `PhaseBody` in its `editing && onEdit` branch
  renders `<ul className="steps steps-edit">` of `<StepEditor>` rows +
  `+ Thêm bước`. `DayEdit` = `{ onAddStep, onUpdateStep, onRemoveStep,
  onSetVariant }`. The day badge renders `{day.full}` and (face/body)
  `{copy.badgePrefix}{day.focus}` where `copy = PANEL_COPY[face|body]`, or
  (hair) `{day.full}` + `{day.type}`. `day` is a `ResolvedDay` from
  `resolveDayForState`, whose `full`/`focus`/`type` already reflect an
  override's edited values.
- `src/components/StepEditor.tsx`: `<li className={cls}>` → `.step-edit-head`
  holding the collapse-toggle button and `<ConfirmRemove label="Xoá bước" …>`,
  then `{open && <VariantEditor …>}`. Props include `edited`, `initialOpen`,
  `autoFocusFirst`.
- `src/hooks/useBufferedText.ts`: `useBufferedText(committed, commit)` →
  `{ value, onChange, onFocus, onBlur }`, commit on blur / unmount-while-focused.
- `src/components/CustomizationsStrip.tsx`: `collectChanges(state, category)`
  walks `getStoredDays` + `isStepEdited` per step; renders `{m} bước đã đổi` and
  (when `> 0`) `, {a} bước mới`, plus a `Đặt lại` and an expand toggle with a
  jump list.

## Feature 1 — `isStepEdited` fix

### Change

In `src/shared/content.ts`, `isStepEdited`:

- Find the `StoredStep` by `id` in the phase array (unchanged). `id` not found →
  `null` (unchanged).
- Parse the last dot-segment of `id`: `` const last = id.slice(id.lastIndexOf(".") + 1); ``
  - `last.startsWith("new-")` → `"added"` (unchanged intent, same as today's
    `id.startsWith(\`${…}.new-\`)`).
  - else `const originalIndex = Number(last)` — the index the step's id was
    minted at.
- Compare `stored.step` against `defaultSteps[originalIndex]` (the `routine.ts`
  default at the **original** index), not `defaultSteps[currentArrayIndex]`.
  `defaultSteps[originalIndex] === undefined` → `"added"` (a step whose original
  slot no longer exists in a future shipped routine). Otherwise
  `routineStepsEqual(stored.step, def) ? null : "modified"`.
- `defaultSteps` derivation (the "can't reuse `phaseArrayOf`" branch) is
  unchanged.
- **Delete** the positional-caveat doc comment ("A prior removeStep on an
  earlier sibling can therefore shift a step against a different default … Wave
  2's stable ordering removes this ambiguity"). Replace with a one-line note
  that the comparison is by original (id-encoded) index, so reorder and delete
  leave untouched steps unmarked.

### Effect

- A pure reorder → every moved step keeps its id → compares against its own
  original default → `null` (no marker). Correct.
- `removeStep` on an earlier sibling → survivors keep their ids → still compare
  against their own originals → `null`. Fixes the Wave 1 final-review Critical's
  residue.
- A real product/note/variant change → `"modified"` (unchanged).
- A `new-*` step → `"added"` (unchanged).

### Note

`isStepEdited` no longer needs the step's current array position at all — it
locates the step by id and reads the original index from the id. The
`stored: StoredStep[]` lookup still uses `findIndex` to get the step object;
that index is no longer used for the comparison.

## Feature 2 — Step reorder

### Pure helper (`content.ts`)

```ts
export function moveStep(
  state: AppState,
  category: Category,
  dayIndex: number,
  phase: StepPhase,
  fromIndex: number,
  toIndex: number,
): AppState;
```

- `fromIndex === toIndex`, or either index `< 0` or `>= phase length` → return
  `state` unchanged (no CoW clone).
- Otherwise `ensureOverride` the category, take the phase array via
  `phaseArrayOf`, splice the element out at `fromIndex`, insert it at `toIndex`,
  write back via `setPhaseArray` + `withOverride`. Ids ride along on the
  `StoredStep` objects, so `completedSteps` (id-keyed) and `isStepEdited`
  (id-keyed, post-fix) stay correct. Does not stamp `updatedAt` (caller's
  `update()` does).

### Hook: `src/hooks/useDragSort.ts`

```ts
export function useDragSort<T>(
  items: T[],
  keyOf: (item: T) => string,
  onReorder: (fromIndex: number, toIndex: number) => void,
): {
  order: T[];                       // items in the current (possibly mid-drag) visual order
  handleProps: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    "aria-label": string;
  };
  draggingKey: string | null;       // key of the lifted row, or null
};
```

Behaviour:

- **`order`** is derived from `items` on every render *unless* a drag is in
  progress, in which case it is the locally-tracked order. A `useEffect` /
  render-time reset keeps it synced to `items` when `draggingKey === null`.
- **Pointer drag:** `onPointerDown` on a handle → `e.currentTarget.setPointerCapture(e.pointerId)`,
  record the lifted index and the pointer's start `clientY`, set `draggingKey`.
  A `pointermove` listener (added on the captured element for the drag's
  lifetime) → find which row the pointer Y is currently over by measuring row
  bounding rects; when it crosses an adjacent row's vertical midpoint, swap the
  two entries in the local `order` (live re-sort; no floating clone, no gap
  math). `pointerup` / `pointercancel` → release capture, remove the listener,
  clear `draggingKey`; if the final order differs from `items`, call
  `onReorder(originalIndex, finalIndex)` **once**.
- **Keyboard:** `onKeyDown` — `ArrowUp` → `onReorder(index, index - 1)` unless
  `index === 0`; `ArrowDown` → `onReorder(index, index + 1)` unless
  `index === items.length - 1`. The hook guards the ends itself (no `onReorder`
  call there); `preventDefault` is called on every `ArrowUp` / `ArrowDown`
  regardless, so the page never scrolls. `Home` / `End` are not implemented.
- **`handleProps(index)["aria-label"]`** → `` `Kéo để sắp xếp bước ${index + 1}` ``.
- One `onReorder` per completed drag or per arrow press → one `editContent` →
  one debounced `PUT`. No commit during `pointermove`.
- **`touch-action: none`** is applied by the consumer to the handle element (via
  `.drag-handle` CSS), so a vertical drag on the handle doesn't scroll the page.

### Wiring

- `DayPanel` `PhaseBody`, edit branch: pass the phase's `resolvedSteps` (or
  their ids) through `useDragSort`, render `order` instead of `resolvedSteps`,
  and give each `StepEditor` a `dragHandle` built from `handleProps(i)`.
  `onReorder={(from, to) => onEdit.onReorderStep(phase, from, to)}`.
- `DayEdit` gains `onReorderStep: (phase: StepPhase, fromIndex: number,
  toIndex: number) => void`.
- `CategorySection`'s `DayPanel` `onEdit` object gains
  `onReorderStep: (phase, from, to) => editContent(s => moveStep(s, category,
  activeDay, phase, from, to))`.
- `StepEditor` gains `dragHandle?: ReactNode`, rendered as the first child of
  `.step-edit-head` (before the collapse toggle). Absent (read mode, or if a
  consumer doesn't pass it) → nothing rendered, layout unchanged.
- The lifted row gets `.step-edit.dragging` (via `draggingKey === keyOf(row)`).

### Constraints

Within one phase only. A `pointerup` outside the list still commits the local
order (the local order only ever changed by midpoint crossings *within* the
list, so it is always a valid permutation). A drag that never crossed a
midpoint commits nothing.

## Feature 3 — Editable day header

### Schema

`CategoryOverride` gains one **additive optional** field — no version bump, no
migration:

```ts
export type CategoryOverride = {
  products: string[];
  days: StoredDay[];
  /** The face "Trọng tâm tối nay: " prefix, category-level. Absent = shipped default. */
  focusPrefix?: string;
};
```

`isCategoryOverride` gains `(value.focusPrefix === undefined || typeof
value.focusPrefix === "string")`. An old v3 blob (no `focusPrefix`) passes the
new guard; a new blob passes the old guard (unchecked field). `AppState` stays
`version: 3`; `isV1State` / `isV2State` / `migrate` are untouched. A v3 blob
carrying `focusPrefix` round-trips through `migrate` (which returns
`isAppState(value) ? value : …`) unchanged.

### Pure helpers (`content.ts`)

```ts
updateDayMeta(state, category, dayIndex, patch: { full?: string; focus?: string; type?: string }): AppState
setFocusPrefix(state, category, prefix: string): AppState
getFocusPrefix(state, category): string
isDayMetaEdited(state, category, dayIndex): boolean
```

- `updateDayMeta` — CoW-clone, apply present keys to the stored day. `focus` is
  applied only on a `StoredFaceOrBodyDay` (`!("steps" in day)`), `type` only on
  a `StoredHairDay`; a key that doesn't match the day kind is ignored. `full`
  applies to both. An empty string is stored as-is.
- `setFocusPrefix` — CoW-clone, set `override.focusPrefix = prefix` (empty
  string kept as-is, meaning "no prefix"; distinct from `undefined`).
- `getFocusPrefix` — `state.overrides?.[category]?.focusPrefix ??
  DEFAULT_FOCUS_PREFIX[category] ?? ""`, where `DEFAULT_FOCUS_PREFIX` is a small
  lookup mirroring today's `PANEL_COPY` (`face: "Trọng tâm tối nay: "`,
  `body: ""`, `hair: ""`). Exported so `DayPanel` uses it in place of the
  hardcoded `copy.badgePrefix`. `PANEL_COPY` keeps its `am`/`pm` copy; only the
  prefix is externalised.
- `isDayMetaEdited` — `false` if no override. Else compare the stored day's
  `full` / (`focus` or `type`) against `routine[category].days[dayIndex]`'s; or
  `state.overrides[category].focusPrefix !== undefined`. Any difference → `true`.

### Read seam in `DayPanel`

Replace `{copy.badgePrefix}` with `{getFocusPrefix(state, category)}` for the
face/body badge. Hair has no prefix. `day.full` / `day.focus` / `day.type`
already carry edited values via `resolveDayForState`, so the badge text updates
with no further change.

### UI — the "Day header" edit block

Rendered by `DayPanel` **only in edit mode**, above the AM card (face/body) or
above the single hair card:

- `full` → `<input>` (label `Tên ngày`), `useBufferedText(day.full, v =>
  onEdit.onUpdateDayMeta({ full: v }))`.
- face/body: `focus` → `<input>` (label `Trọng tâm`), `updateDayMeta({ focus })`.
  hair: `type` → `<input>` (label `Loại ngày`), `updateDayMeta({ type })`.
- face only: `focusPrefix` → `<input>` (label `Tiền tố nhãn (áp dụng cả mục)`),
  `useBufferedText(getFocusPrefix(state, category), v =>
  onEdit.onSetFocusPrefix(v))`.
- When `isDayMetaEdited(state, category, dayIndex)` → a `<span
  className="step-edit-tag">đã đổi</span>` in the block header.
- New `DayEdit` members:
  `onUpdateDayMeta: (patch: { full?: string; focus?: string; type?: string }) => void`
  and `onSetFocusPrefix: (prefix: string) => void`.
  `CategorySection` wires them to `editContent(s => updateDayMeta(s, category,
  activeDay, patch))` and `editContent(s => setFocusPrefix(s, category, prefix))`.

### `CustomizationsStrip`

`collectChanges` (or a sibling tally) counts days where `isDayMetaEdited` is
true. The summary line gains `, {d} ngày đổi tiêu đề` when `d > 0`, after the
step counts. The expand list is not required to include day-meta rows (steps
only) — keep it steps-only for Wave 2.

## Error handling

No new persistence or validation paths. `focusPrefix` rides the existing
`overrides` blob and the same `GET` / `PUT` / localStorage cycle.

- `moveStep` out-of-range / same-index → no-op, no clone.
- A drag interrupted by unmount (category switch mid-drag) — the browser
  releases pointer capture on element removal; `useDragSort`'s cleanup removes
  the `pointermove` listener; nothing commits.
- `useDragSort`'s local `order` desyncing from `items` after an external change
  during a drag is prevented by only tracking locally while `draggingKey !==
  null` and resetting from `items` otherwise.
- An old client reading a blob with `focusPrefix` during a deploy race ignores
  the field; its repair-`PUT` drops it (a cosmetic string), self-heals on the
  next reconcile — the same transient already documented.

## Testing

### `src/shared/content.test.ts`

- **`isStepEdited` (rewrite the positional-caveat cases):** after `moveStep`
  reorders a face `am` phase, every moved-but-unchanged step reads `null`; after
  `removeStep` of an early sibling, every survivor reads `null`; a step that was
  `updateStepTuple`-d still reads `"modified"` after a subsequent `moveStep`; a
  `new-*` step reads `"added"` regardless of position.
- **`moveStep`:** reorders within a phase (assert the id sequence); ids and
  `.step` contents ride along; `completedSteps` array is byte-unchanged;
  `fromIndex === toIndex` and out-of-range return the same `state` reference
  (no clone); moving in `face` leaves `overrides.hair` absent.
- **`updateDayMeta`:** sets `full` on a face day; sets `focus` on a face day and
  ignores a `type` key; sets `type` on a hair day and ignores `focus`; CoW
  clone created, other categories untouched; empty string stored.
- **`setFocusPrefix` / `getFocusPrefix`:** `getFocusPrefix` returns
  `"Trọng tâm tối nay: "` for a no-override face state, `""` for body/hair;
  after `setFocusPrefix(s, "face", "Tối nay: ")` it returns the new value;
  `setFocusPrefix(s, "face", "")` returns `""` (not the default).
- **`isDayMetaEdited`:** `false` with no override; `false` for a CoW-cloned but
  unedited day; `true` after `updateDayMeta`; `true` after `setFocusPrefix`
  (any day of that category).

### `src/shared/types.test.ts`

- `isCategoryOverride` accepts an override with `focusPrefix: "x"` and one with
  it absent; rejects `focusPrefix: 3`.
- `migrate` returns a v3 blob carrying `overrides.face.focusPrefix` unchanged
  (round-trip via `isAppState`).

### `src/hooks/useDragSort.test.tsx`

- Keyboard: `ArrowDown` on handle `i` fires `onReorder(i, i + 1)`; `ArrowUp` on
  handle `i` fires `onReorder(i, i - 1)`. The hook guards the ends — `ArrowUp` on
  handle `0` and `ArrowDown` on the last handle fire **nothing**. `preventDefault`
  is called on every `ArrowUp` / `ArrowDown` (so the page never scrolls),
  including at the guarded ends.
- `order` tracks `items` when not dragging (rerender with a new `items` array →
  `order` follows).
- Pointer: a synthetic `pointerdown` on a handle sets `draggingKey`; a
  `pointermove` whose `clientY` crosses the next row's mocked midpoint swaps the
  local `order`; `pointerup` fires `onReorder` once with the net
  `(from, to)`; a `pointerup` with no midpoint crossing fires nothing.
  (Row rects are mocked via `Element.prototype.getBoundingClientRect` in the
  test.)

### Component tests

- **`DayPanel.test.tsx`:** edit mode renders a `.drag-handle` per step and the
  Day-header block; read mode renders neither. `ArrowDown` on the first handle
  calls `onEdit.onReorderStep(phase, 0, 1)`. Typing in the `Tên ngày` input and
  blurring calls `onEdit.onUpdateDayMeta({ full: "…" })`. The face badge shows
  `getFocusPrefix` (set an `overrides.face.focusPrefix` and assert the badge
  text). `isDayMetaEdited` true → the `đã đổi` tag renders in the block.
- **`CategorySection.test.tsx`:** the `onReorderStep` / `onUpdateDayMeta` /
  `onSetFocusPrefix` handlers are wired (a keyboard reorder in edit mode
  produces a state change — assert via a stateful host + the reordered step
  label).
- **`CustomizationsStrip.test.tsx`:** with an `overrides.face` that has one
  `updateDayMeta`-d day, the strip shows `1 ngày đổi tiêu đề`.

### Gate

`npm run lint:constraints && npm run typecheck && npm run test && npm run build`
all green; no new deps; no `as`/`any`/`!`/`@ts-ignore`.

## File-by-file summary

| File | Change |
|---|---|
| `src/shared/types.ts` | `CategoryOverride` +`focusPrefix?: string`; `isCategoryOverride` +optional-string check. No version bump, no new frozen snapshot. |
| `src/shared/content.ts` | **rewrite `isStepEdited`** (original-index comparison, drop the caveat comment); +`moveStep`, `updateDayMeta`, `setFocusPrefix`, `getFocusPrefix` (+ `DEFAULT_FOCUS_PREFIX`), `isDayMetaEdited` |
| `src/hooks/useDragSort.ts` | **new** — pointer + keyboard sortable; local order; one `onReorder` per drag/keypress |
| `src/hooks/useDragSort.test.tsx` | **new** |
| `src/components/StepEditor.tsx` | +`dragHandle?: ReactNode` slot, first child of `.step-edit-head` |
| `src/components/DayPanel.tsx` | edit branch: `useDragSort` around the `StepEditor` list, handles, `onReorderStep`; the Day-header edit block; badge prefix via `getFocusPrefix`; `DayEdit` +`onReorderStep` / `onUpdateDayMeta` / `onSetFocusPrefix` |
| `src/components/CategorySection.tsx` | wire the three new `DayEdit` handlers to `editContent` + the new `content.ts` helpers |
| `src/components/CustomizationsStrip.tsx` | +`isDayMetaEdited` tally + the `{d} ngày đổi tiêu đề` line |
| `src/styles.css` | `.drag-handle` (`touch-action:none`, grab cursor), `.step-edit.dragging` (raised/opaque), `.day-header-edit` block |
| `CLAUDE.md` | document `moveStep` / `updateDayMeta` / `setFocusPrefix` / `getFocusPrefix` / `focusPrefix`; note the `isStepEdited` fix and delete the positional-caveat sentence |

## Definition of done

- All three features behave as described; `npm run test`, `typecheck` (both
  tsconfigs), `build`, `lint:constraints` green.
- A reordered step and a delete-earlier-sibling survivor both read no edit
  marker; a real edit still reads `đã đổi`; an added step still `mới`.
- `moveStep` is a no-op (same `state` reference) for same-index / out-of-range.
- Drag works by pointer (midpoint-crossing live re-sort, one commit on
  `pointerup`) and by `ArrowUp`/`ArrowDown` on the handle.
- Day `full` / `focus` / `type` and the face `focusPrefix` are editable in edit
  mode, buffered on blur, marked when changed, and reflected in the badge.
- `AppState` is still `version: 3`; no migration added.
- `CLAUDE.md` updated.
