# Content Editor Usability — Wave 1 — Spec

Status: approved for planning
Date: 2026-09-02
Follows: [In-App Content Editor spec](./2026-09-01-content-editor-spec.md) (sub-project 3, merged — PRs #3, #4)

## Goal

Make the shipped in-app content editor comfortable to use on a phone: stop
per-keystroke saves, protect against fat-finger deletes, show at a glance what
has been customised, and smooth the add-a-step flow — all without a schema
change.

## Scope

**Wave 1 (this spec) — additive UI polish, no `AppState` change:**

1. Editor text fields commit on blur, not on every keystroke.
2. Two-tap inline confirm on every destructive control in the editor.
3. Markers showing which categories and which steps have diverged from the
   shipped routine.
4. New step rows open expanded and focused; clearer empty-field prompts.
5. The edit toggle stays on screen while editing; edit mode persists across day
   tabs (already true — locked with a test).
6. A collapsible "you've customised this category" strip, in edit mode, with the
   per-category reset relocated into it.

**Deferred to Wave 2 (separate spec):** the derived-from-steps product gallery,
drag-and-drop step reordering, editable day label / focus / type, and the
`AppState` v3→v4 migration those need. Nothing in Wave 1 blocks them.

**Out of scope entirely:** anything already out of scope for sub-project 3
(theme colours, category set, icon keyword rules, multi-device conflict
resolution, PWA/notifications).

## Global constraints (inherited)

- **No new dependencies.**
- **No `as` casts, no `any`, no `@ts-ignore`/`@ts-nocheck`, no non-null `!`** in
  `src/` or `worker/`, tests included. `npm run lint:constraints` enforces it
  (it misses bracket-form `as T[]` — follow the rule regardless).
- **TypeScript `strict: true`**; `npm run build` typechecks `tsconfig.json` and
  `tsconfig.worker.json`.
- **`src/shared/`** is imported by both the frontend and the Worker; the one new
  shared helper (`isStepEdited`) must not break either build.
- **Vietnamese UI copy** for every user-facing string.
- **Port, not redesign** — no routine content string is changed by this work.
- Node 20. Commit per task, TDD.

## Current state (what Wave 1 builds on)

- `src/components/CategorySection.tsx` — owns `const [editing, setEditing] =
  useState(false)`. `App.tsx` remounts it with `key={activeCategory}` on
  category switch (so `editing` resets on category change, persists across day
  tabs). Renders the `.edit-toggle` pill, then `{editing && <reset button>}`,
  then `Gallery`, `{!editing && <WeekProgress>}`, `DayTabs`, `DayPanel`.
- `.edit-toggle` (`src/styles.css`) — `position:absolute; top:14px; right:14px`
  rose pill, text `✎ Sửa nội dung` / `✓ Xong` (PR #4).
- `src/components/Gallery.tsx` — edit branch: per-product controlled `<input>`
  (`aria-label={`Tên sản phẩm ${i+1}`}`) calling `onEdit.onRename(i, value)` on
  every `change`; `×` button (`aria-label={product ? `Xoá ${product}` : …}`)
  calling `onEdit.onRemove(i)` on first click; `+ Thêm sản phẩm` → `onEdit.onAdd()`.
- `src/components/StepEditor.tsx` — `<li className="step-edit">`; a
  collapse/expand toggle button (local `const [open, setOpen]`); a `×` button
  (`aria-label="Xoá bước"`) calling `onRemove` on first click; when `open`,
  renders `<VariantEditor value={raw} onChange={…}>`.
- `src/components/VariantEditor.tsx` — `TupleFields` renders two controlled
  `<input>`s calling `onChange` on every keystroke. The `untilWeek` number
  field already buffers a local string and commits `coerceWeek(...)` on blur
  (sub-project 3 final-review fix).
- `src/components/DayPanel.tsx` — `PhaseBody` maps `resolvedSteps` to
  `<StepEditor key={rs.id} display={rs} raw={storedSteps[i].step} …>` in edit
  mode, with `+ Thêm bước` → `onEdit.onAddStep(phase)`.
- `src/shared/content.ts` — `getCategoryData`, `resolveDayForState`,
  `getStoredDays`, `stepId(category, dayIndex, phase, index)`, and the 8
  mutation helpers. `AppState.overrides?[category]` is present iff the user has
  edited that category (whole-category copy-on-write).

## Feature 1 — Blur-commit (`useBufferedText`)

### New unit: `src/hooks/useBufferedText.ts`

```ts
import { useEffect, useRef, useState } from "react";

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

  // Keep the latest draft/committed/commit reachable from the unmount cleanup
  // without re-subscribing it every render.
  const latest = useRef({ draft, committed, commit });
  latest.current = { draft, committed, commit };

  // Re-sync to an external change (reset-to-default, a Worker sync) only when
  // the user is not mid-edit in this field.
  useEffect(() => {
    if (!focused.current) setDraft(committed);
  }, [committed]);

  // Commit a pending edit if the field unmounts while focused (row collapse,
  // category switch, edit-mode exit) — blur does not fire in that path.
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

Design notes:

- `draft` is authoritative while `focused.current` is true — incoming
  `committed` values are held back, so a debounced round-trip mid-word can't
  yank the caret.
- `commit` is only called when `draft !== committed`, so a focus-blur with no
  edit is a no-op (no spurious `editContent`/`PUT`).
- The hook owns no debounce — the existing 500 ms `PUT` debounce in
  `useRemoteState` still coalesces. Wave 1 just changes the cadence from
  "per keystroke" to "per field edit".

### Wiring

- **`Gallery`** — the product `<input>` uses `useBufferedText(product, (name)
  => onEdit.onRename(index, name))`. Spread `{value, onChange, onFocus, onBlur}`.
  One hook call per rendered row (the list is short and stable-keyed by index).
- **`VariantEditor` `TupleFields`** — each of the two `<input>`s gets its own
  `useBufferedText`. The `product` input: `useBufferedText(value[0], (p) =>
  onChange([p, value[1]]))`; the `note` input: `useBufferedText(value[1], (n) =>
  onChange([value[0], n]))`. Because `TupleFields` is re-rendered with a fresh
  `value` after each commit, the hooks re-sync correctly when not focused.
  `TupleFields` exposes a `ref`-free imperative `flush` path is **not** needed
  here — see `StepEditor` below, which flushes via a key bump.
- **`VariantEditor` `untilWeek`** — migrate the hand-rolled local-string logic
  to `useBufferedText(String(value.untilWeek), (s) => onChange({ ...value,
  untilWeek: coerceWeek(s) }))`, deleting the bespoke `useState`/`useEffect`.
  `coerceWeek` stays.
- **`StepEditor` collapse flush** — when the row collapses (`setOpen(false)`)
  or the category switches while a field is still focused, `blur` does not fire.
  `StepEditor` renders `VariantEditor` behind `{open && …}`, so a collapse
  unmounts it and every `useBufferedText` inside it. The hook's unmount-cleanup
  effect (in the code above) commits the pending draft in that case. No extra
  prop, no explicit flush call — the cleanup is the whole mechanism.

### Consequence

`editContent` (and the debounced `PUT`) fire once per field edit instead of
once per character. No change to what is stored. `renameProduct` /
`updateStepTuple` / `setStepVariant` are unchanged.

## Feature 2 — Two-tap confirm on destructive controls

Applies to the step `×` in `StepEditor` and the product `×` in `Gallery`.

### New unit: `src/components/ConfirmRemove.tsx`

```ts
export default function ConfirmRemove({
  label,        // accessible name for the initial trigger, e.g. "Xoá bước"
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}): JSX.Element
```

- Renders one `<button aria-label={label}>×</button>` in the resting state
  (`local const [confirming, setConfirming] = useState(false)`).
- First click → `setConfirming(true)`; renders two buttons in place: `Xoá`
  (class `confirm-yes`) and `Huỷ` (class `confirm-no`).
- `Xoá` → `onConfirm()`. `Huỷ` → `setConfirming(false)`.
- A `blur` that leaves the confirm group (focus moves outside) → back to
  resting. (Use `onBlur` on the wrapping element with a
  `relatedTarget`-in-container check; no timers.)
- No `window.confirm`. The `window.confirm` stays only on the per-category
  reset (Feature 6).

### Wiring

- `Gallery` edit branch: replace the inline `<button aria-label={…}>×</button>`
  with `<ConfirmRemove label={product ? `Xoá ${product}` : `Xoá sản phẩm
  ${index + 1}`} onConfirm={() => onEdit.onRemove(index)} />`.
- `StepEditor`: replace `<button aria-label="Xoá bước">×</button>` with
  `<ConfirmRemove label="Xoá bước" onConfirm={onRemove} />`.

## Feature 3 — "What's edited" markers

### New pure helper: `content.ts` `isStepEdited`

```ts
export function isStepEdited(
  state: AppState,
  category: Category,
  dayIndex: number,
  phase: StepPhase,
  id: string,
): "modified" | "added" | null;
```

- Returns `null` when `state.overrides?.[category]` is absent (nothing edited).
- Finds the `StoredStep` with `id` in the override's `days[dayIndex]` phase
  array. If its `id` does not match the derived positional form
  `stepId(category, dayIndex, phase, <its index>)` **and** starts with the
  `new-` marker segment → `"added"`.
- Otherwise deep-equal its `.step` against the shipped default `RoutineStep` at
  the same `(category, dayIndex, phase, positional index)` from `routine.ts`
  (via `getStoredDays` on a *no-override* synthetic state, or a direct
  `routine[category].days[dayIndex]` read). Equal → `null`; differ →
  `"modified"`.
- Deep equality: a small local structural compare for `RoutineStep`
  (`StepTuple` array vs `ConditionalStep` object with `before`/`from` or
  `weeks`). No `JSON.stringify` reliance for correctness (key-order safe compare).
- Positional caveat: a step whose position shifted (Wave 2 reorder isn't here
  yet, but `removeStep` on an earlier sibling shifts indices) compares against
  whatever default now sits at its index. Acceptable for a marker; documented.

### UI

- **Category dot:** `.edit-toggle` gets a `data-edited` attribute
  (`Boolean(state.overrides?.[category])`); CSS renders a small filled dot on
  the pill when `data-edited="true"`. Read mode and edit mode both show it (so
  you can see from the closed editor that a category is customised).
- **Step marker:** `StepEditor` takes an `edited: "modified" | "added" | null`
  prop (computed in `DayPanel`/`PhaseBody` via `isStepEdited`). When non-null
  the `<li className="step-edit">` gains a modifier class (`is-modified` /
  `is-added`) → a thin left accent bar + a quiet inline tag: `đã đổi`
  (modified) or `mới` (added), placed in `.step-edit-head` after the product
  name.
- Markers appear only in edit mode (`StepEditor` only renders in edit mode).

## Feature 4 — New rows open expanded and focused; empty-field prompts

- **`StepEditor`** gains `initialOpen?: boolean` (default `false`). When `true`,
  `open` starts `true`. It threads `autoFocusFirst?: boolean` into
  `VariantEditor` (same value as `initialOpen`); `VariantEditor` holds a `ref`
  on the first product `<input>` and a `useEffect(() => { ref.current?.focus()
  }, [])` gated on `autoFocusFirst` — the `ref`+`useEffect` route (not the DOM
  `autofocus` attribute) so it works regardless of paint order and doesn't
  fight React StrictMode double-invoke.
- `initialOpen` covers both triggers: a just-added step (this feature) and a
  jumped-to step from the customisations strip (Feature 6). `autoFocusFirst` is
  true only for the just-added case (a jump should reveal, not grab the
  keyboard) — `StepEditor` gets both props and passes `autoFocusFirst` straight
  through.
- **`DayPanel` / `CategorySection`** track the just-added step id: `addStep`
  returns state whose new step id is `${category}.${dayIndex}.${phase}.new-${n}`
  where `n` was `state.stepSeq ?? 0`. `CategorySection` holds `const
  [justAddedId, setJustAddedId] = useState<string | null>(null)`, sets it in the
  `onAddStep` wrapper (compute the id the same way, from the pre-call
  `state.stepSeq ?? 0`), passes `initialOpen={rs.id === justAddedId || rs.id ===
  openStepId}` and `autoFocusFirst={rs.id === justAddedId}` down, and
  clears it (`setJustAddedId(null)`) on the next `onSelectDay` / category change
  / a `useEffect` timeout-free "clear after it's been consumed" — simplest:
  clear it in the same render it's consumed via a `useEffect([justAddedId])`
  that resets to `null` after one commit. Document this as the accepted
  one-render-latency approach.

  > Ambiguity resolved: the new-step id is recomputed in the `onAddStep`
  > wrapper from `state.stepSeq ?? 0` (the exact value `addStep` will use),
  > **before** calling `editContent`. This must stay in sync with `addStep`'s
  > own formula in `content.ts`; a test asserts the two agree.

- **Empty-field prompts:** `TupleFields` product `<input>` placeholder changes
  from `Bước chưa đặt tên` to `Tên sản phẩm / bước`. `TupleFields` note
  `<input>` gains placeholder `Ghi chú (không bắt buộc)`. `StepEditor`'s
  collapsed-label fallback stays `Bước chưa đặt tên` (there it *is* a
  "nothing here yet" label, which reads fine). `Gallery`'s product input
  placeholder stays `Sản phẩm chưa đặt tên`.

## Feature 5 — Reachable pill; edit mode across day tabs

- **Persistence:** already correct (see Current state). Wave 1 adds a
  `CategorySection` test that: enters edit mode, clicks a different `DayTab`,
  asserts the pill still reads `✓ Xong` and `aria-pressed="true"` and the day
  panel shows `StepEditor` rows for the new day. This locks the behaviour.
- **Sticky pill:** while `editing`, `.edit-toggle` switches to `position:
  sticky; top: 8px` (add an `is-editing` class or reuse the existing
  `[aria-pressed="true"]` selector for the positioning change). In read mode it
  stays `position: absolute` in the hero corner. Verify the sticky pill does
  not overlap the `.customizations` strip (Feature 6) — the strip renders below
  it in normal flow; give the strip `margin-top` clearance equal to the pill
  height.

## Feature 6 — "My customisations" strip

Rendered by `CategorySection`, in edit mode only, and only when
`state.overrides?.[category]` exists.

### New unit: `src/components/CustomizationsStrip.tsx`

```ts
export default function CustomizationsStrip({
  state,
  category,
  onJump,       // (dayIndex: number, stepId: string) => void
  onReset,      // () => void   (already window.confirm-gated by the caller)
}: {
  state: AppState;
  category: Category;
  onJump: (dayIndex: number, stepId: string) => void;
  onReset: () => void;
}): JSX.Element
```

- Walks the category's stored days (`getStoredDays(state, category)`), calling
  `isStepEdited` per step, tallying `modified` and `added` counts.
- Resting row:
  `✎ Bạn đã tuỳ chỉnh mục này — {m} bước đã đổi{, {a} bước mới}` + a `Đặt lại`
  button + a `▾`/`▸` expand toggle (local `useState`).
- Expanded: a list of the changed steps, each a button
  `{DAY_SHORT[dayIndex]} · {phaseLabel} · {product || "Bước chưa đặt tên"}`
  calling `onJump(dayIndex, stepId)`. `phaseLabel`: `Sáng` / `Tối` / `Chăm tóc`
  for `am`/`pm`/`steps`.
- `Đặt lại` calls `onReset` (the caller wraps it in the existing
  `window.confirm("Đặt lại toàn bộ nội dung mục này…")`).

### Wiring in `CategorySection`

- The standalone `{editing && <reset button>}` currently under the pill is
  **removed**; its `window.confirm` + `editContent(s => resetCategory(s,
  category))` logic moves into the `onReset` handler passed to
  `CustomizationsStrip`.
- `onJump(dayIndex, stepId)` → `onSelectDay(dayIndex)` plus set `openStepId`
  state in `CategorySection`. `DayPanel`/`PhaseBody` threads it so the matching
  `StepEditor` gets `initialOpen` true (Feature 4's prop — covering both "just
  added" and "jumped to") and, on mount, `scrollIntoView`s itself. A jump does
  not set `autoFocusFirst`, so it reveals the row without grabbing the
  keyboard. `openStepId` is cleared on the next `onSelectDay` / category change.
- If no override exists, `CustomizationsStrip` is not rendered — the category
  section in edit mode is exactly today's minus the loose reset button.

## Error handling

No new persistence or validation paths. Failure modes:

- **`useBufferedText` dropped commit** — mitigated by the unmount-cleanup
  commit; the only unrecoverable case is a hard crash mid-edit, which loses one
  field's in-progress text (same as any uncommitted form).
- **`isStepEdited` positional mismatch** after a `removeStep` shifts indices —
  produces a possibly-wrong `modified`/`null` marker, never a crash, never a
  data change. Documented; Wave 2's stable ordering removes the ambiguity.
- Everything still rides the existing `GET`/`PUT`/localStorage cycle; `overrides`
  is unchanged in shape.

## Testing

### `src/hooks/useBufferedText.test.ts` (new)

- Types into the field → `commit` not called; `blur` → `commit` called once with
  the final draft.
- `blur` with `draft === committed` → `commit` not called.
- External `committed` change while not focused → `value` updates.
- External `committed` change while focused → `value` unchanged; on `blur` the
  user's draft wins (`commit(draft)`).
- Unmount while focused with a pending draft → `commit` called in cleanup.

### `src/shared/content.test.ts` (extend)

- `isStepEdited` → `null` for a no-override state.
- After `updateStepTuple` on a default step → `"modified"` for that id, `null`
  for its untouched siblings.
- After `addStep` → `"added"` for the `new-*` id.
- After `setStepVariant` (plain→threshold) → `"modified"`.
- The recomputed new-step id in the (planned) `CategorySection` `onAddStep`
  wrapper equals the id `addStep` actually assigns — assert
  `` `${cat}.${day}.${phase}.new-${base.stepSeq ?? 0}` `` matches the id present
  after `addStep(base, cat, day, phase)`.

### `src/components/ConfirmRemove.test.tsx` (new)

- One `×` button initially; `getByRole("button", { name })` resolves it.
- Click → `Xoá` + `Huỷ` shown, `×` gone; `onConfirm` not yet called.
- `Xoá` → `onConfirm` called once.
- `Huỷ` → back to `×`, `onConfirm` never called.

### Component tests (extend existing files)

- **`Gallery.test.tsx`** — typing in a product input no longer calls
  `onEdit.onRename` per keystroke (spy: 0 calls); `blur` → 1 call with the final
  value. Remove now needs the two-tap confirm.
- **`VariantEditor.test.tsx`** — `TupleFields` inputs buffer (spy on `onChange`:
  0 during typing, 1 on blur); the `untilWeek` migration keeps its existing
  assertions (0 calls while typing, coerced number on blur).
- **`StepEditor.test.tsx`** — collapsing the row while a buffered field holds an
  uncommitted draft commits it (spy on `onUpdateTuple`/`onSetVariant`); `edited`
  prop `"modified"` renders the `đã đổi` tag and `is-modified` class; `"added"`
  renders `mới`; `initialOpen` mounts the row expanded; `initialOpen` +
  `autoFocusFirst` together put focus on the first product input
  (`document.activeElement`); `initialOpen` alone (jump case) does not steal
  focus.
- **`DayPanel.test.tsx`** — a `state` with an `overrides.face` that renamed a
  step → that `StepEditor` gets `edited="modified"`; `+ Thêm bước` → the new row
  mounts expanded with its product input focused (thread-through of
  `initialOpen` + `autoFocusFirst` from `CategorySection`'s `justAddedId`).
- **`CategorySection.test.tsx`** — pill shows the edited dot
  (`data-edited="true"`) once an override exists; edit mode + click another
  `DayTab` → still editing, pill still `✓ Xong`, new day shows `StepEditor`
  rows; the loose reset button is gone; `CustomizationsStrip` renders only with
  an override and its `Đặt lại` still goes through `window.confirm`
  (`vi.spyOn(window, "confirm")`).
- **`CustomizationsStrip.test.tsx`** (new) — counts modified vs added correctly
  for a hand-built override; expand lists the changed steps; a jump button
  fires `onJump(dayIndex, stepId)`.

### Gate

`npm run lint:constraints && npm run typecheck && npm run test && npm run build`
all green; no new deps; no `as`/`any`/`!`/`@ts-ignore`.

## File-by-file summary

| File | Change |
|---|---|
| `src/hooks/useBufferedText.ts` | **new** — blur/unmount-commit text buffer hook |
| `src/hooks/useBufferedText.test.ts` | **new** |
| `src/components/ConfirmRemove.tsx` | **new** — two-tap inline delete confirm |
| `src/components/ConfirmRemove.test.tsx` | **new** |
| `src/components/CustomizationsStrip.tsx` | **new** — in-edit-mode "what you changed" strip + reset |
| `src/components/CustomizationsStrip.test.tsx` | **new** |
| `src/shared/content.ts` | +`isStepEdited(state, category, dayIndex, phase, id)` pure helper + local `RoutineStep` deep-equal |
| `src/shared/content.test.ts` | +`isStepEdited` cases; +new-step-id-agreement assertion |
| `src/components/Gallery.tsx` | product input → `useBufferedText`; `×` → `ConfirmRemove` |
| `src/components/VariantEditor.tsx` | `TupleFields` inputs → `useBufferedText`; `untilWeek` migrated to the hook; product placeholder → `Tên sản phẩm / bước`; note placeholder → `Ghi chú (không bắt buộc)`; `autoFocusFirst?: boolean` → `ref`+`useEffect` focus on the first product input |
| `src/components/StepEditor.tsx` | `×` → `ConfirmRemove`; `initialOpen?: boolean` (mount expanded, `scrollIntoView`) + `autoFocusFirst?: boolean` passed through to `VariantEditor`; `edited?: "modified" \| "added" \| null` → accent class + `đã đổi`/`mới` tag; flush-on-collapse via `VariantEditor` unmount + hook cleanup |
| `src/components/DayPanel.tsx` | `PhaseBody` computes `isStepEdited` per step and passes `edited`; threads `initialOpen` + `autoFocusFirst` for the just-added / jumped-to id |
| `src/components/CategorySection.tsx` | remove the loose reset button; render `CustomizationsStrip` (edit mode + override only); `justAddedId` / `openStepId` state (cleared on day/category change); `data-edited` on the pill; `onJump` wiring; recompute new-step id from `state.stepSeq ?? 0` in the `onAddStep` wrapper |
| `src/styles.css` | `.confirm-yes` / `.confirm-no`; `.edit-toggle[data-edited="true"]` dot; `.edit-toggle` sticky while editing; `.step-edit.is-modified` / `.is-added` accent + tag; `.customizations` strip |
| `CLAUDE.md` | note `useBufferedText`, `ConfirmRemove`, `CustomizationsStrip`, `isStepEdited`; note editor inputs are blur-commit; note markers are edit-mode-only and positional |

## Definition of done

- All six features behave as described; `npm run test` (all suites),
  `typecheck` (both tsconfigs), `build`, and `lint:constraints` green.
- No editor text input calls `editContent` before blur/unmount (spy-verified in
  `Gallery` and `VariantEditor` tests).
- Every editor `×` requires two taps; `Huỷ` aborts.
- The pill shows a dot for a customised category and stays on screen while
  editing; edit mode survives a day-tab switch (test-locked).
- `+ Thêm bước` lands you in a focused, expanded new row.
- The customisations strip counts and jump-links are correct; the per-category
  reset lives only inside it and is still `window.confirm`-gated.
- `CLAUDE.md` updated.
