# In-App Content Editor — Spec

Status: approved for planning, sub-project 3 of 5
Date: 2026-09-01
Supersedes: [2026-08-28 content-editor design](./2026-08-28-content-editor-design.md) —
that doc predates the shipped foundation and progress-tracking code and assumes a
step-`id` model and a variant data model that were never built. This spec is
written against the code that actually shipped (`AppState` v2, positional
`completedSteps`, the two hardcoded swaps in `schedule.ts`).

Depends on: foundation rebuild (sub-project 1, live 2026-09-01) and progress
tracking (sub-project 2, live 2026-09-01).

## Goal

Let the one user add / rename / remove products and steps, and add / remove
week-conditional variant branches on a step, entirely from the phone UI — no
asking Claude to edit `routine.ts`.

## Scope

**In scope:** per-category product gallery (add / rename / remove); per-day steps
(add / edit product+note / remove); per-step variant editing across the two
condition kinds defined below; per-category reset-to-default.

**Out of scope:**

- **Reordering** products or steps (add / remove / edit only). Stable step ids
  are introduced here and make reordering a clean later addition, but the UI for
  it (drag on a phone) is deliberately not built now.
- Changing which categories exist, theme colors, or the keyword icon set. A new
  product name that matches no `pickIcon` keyword falls back to the `flower`
  icon — acceptable.
- Linking a gallery entry to the steps that name the same product. The gallery
  `products: string[]` and a step's product string are independent today and
  stay independent; renaming a gallery entry does not touch steps. Explicit
  non-feature.
- Multi-device conflict resolution. Single user, single active editor, last
  write wins — already true of the foundation's `PUT /state`.
- Undo/redo beyond per-category reset-to-default.
- Streaks and multi-week history (still deferred from sub-project 2).

## Global constraints (inherited)

- **Port, not redesign.** Every Vietnamese routine string is a product the user
  owns. This sub-project changes how content is *stored and edited*, never
  regenerates or paraphrases content. The two `faceDays` entries re-authored as
  conditionals (below) keep their exact existing strings.
- **No new dependencies.**
- **No `as` casts, no `any`, no `@ts-ignore`/`@ts-nocheck`, no non-null `!`** in
  `src/` or `worker/`, tests included. New boundary narrowing uses type
  predicates. `npm run lint:constraints` enforces this and runs first in
  `npm run test`.
- **TypeScript `strict: true`.** `npm run build` runs `typecheck` (both
  `tsconfig.json` and `tsconfig.worker.json`) and fails on any error.
- **Timezone.** All date arithmetic stays pinned to `Asia/Ho_Chi_Minh` via
  `src/shared/date.ts`. No bare `new Date().getDay()` etc.
- **`src/shared/` is imported by both the frontend and the Worker.** Types,
  guards, routine content, and date/label helpers that both need live there and
  are never duplicated.
- **Node 20** (CI's only version).
- Commit per task, TDD (failing test first).

## Data model

### Step shape becomes a union

`src/shared/types.ts` today:

```ts
export type StepTuple = [product: string, note: string];
```

`StepTuple` is unchanged and remains the plain-step form. Added:

```ts
export type ThresholdVariant = {
  kind: "threshold";
  /** `before` applies to program-weeks 1..untilWeek; `from` applies from untilWeek+1 on. Integer >= 1. */
  untilWeek: number;
  before: StepTuple;
  from: StepTuple;
};

export type CycleVariant = {
  kind: "cycle";
  /** Cycle length in weeks. Only 2 and 4 are offered in the UI. */
  length: 2 | 4;
  /** Exactly `length` entries. Selected by `(week - 1) % length`. */
  weeks: StepTuple[];
};

export type ConditionalStep = ThresholdVariant | CycleVariant;

/** A step as authored: either a plain [product, note] or a week-conditional step. */
export type RoutineStep = StepTuple | ConditionalStep;
```

Guards (no casts):

```ts
export function isStepTuple(value: unknown): value is StepTuple;      // array, length 2, both strings
export function isThresholdVariant(value: unknown): value is ThresholdVariant;
export function isCycleVariant(value: unknown): value is CycleVariant;
export function isConditionalStep(value: unknown): value is ConditionalStep;
export function isRoutineStep(value: unknown): value is RoutineStep;  // isStepTuple || isConditionalStep
```

`isStepTuple` must be checked before treating a value as a tuple anywhere a
`RoutineStep` is handled, because `ConditionalStep` is an object and `StepTuple`
is an array — `Array.isArray` is the discriminator.

### `routine.ts`: two entries re-authored as conditionals

`src/shared/schedule.ts` currently holds two module constants and patches them in
at resolve time:

- `WEEKS_1_2_WEDNESDAY_AM` — `faceDays[2].am[2]` (Wednesday AM serum): Vitamin C
  for weeks 1–2, Niacinamide from week 3.
- `EVEN_CYCLE_SUNDAY_PM` — `faceDays[6].pm[3]` (Sunday PM mask): Peppermint on odd
  cycle-weeks (1 & 3), Natural White on even (2 & 4), in a repeating 4-week
  cycle.

Both constants are **deleted from `schedule.ts`**. The two positions in
`faceDays` are authored directly as conditionals, using the exact strings that
appear in the code today:

```ts
// faceDays[2].am[2]  (Wednesday, AM)
{
  kind: "threshold",
  untilWeek: 2,
  before: [
    "Serum Vitamin C — Cocoon Nghệ C22",
    "Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide",
  ],
  from: [
    "Serum Niacinamide 15% — Cocoon",
    "Hỗ trợ hàng rào da trước đêm tẩy da chết",
  ],
}
```

The `from` branch is the string pair currently sitting in `faceDays[2].am[2]`
(the steady-state form). Confirm against `routine.ts` at implementation time and
copy verbatim.

```ts
// faceDays[6].pm[3]  (Sunday, PM)
{
  kind: "cycle",
  length: 2,
  weeks: [
    ["Mặt nạ Histolab Peppermint", "Mặt nạ tuần lẻ trong chu kỳ 4 tuần"],
    ["Mặt nạ Histolab Natural White", "Mặt nạ tuần chẵn trong chu kỳ 4 tuần"],
  ],
}
```

`weeks[0]` (index `(week-1) % 2 === 0` → weeks 1, 3) is Peppermint — the string
pair currently in `faceDays[6].pm[3]`. `weeks[1]` (weeks 2, 4) is Natural White —
today's `EVEN_CYCLE_SUNDAY_PM`. Copy both verbatim from the current source.

No other `routine.ts` entry changes. `faceProducts`, `hairProducts`,
`bodyProducts`, `hairDays`, `bodyDays`, and every other `faceDays` step stay
exactly as they are.

### `FaceOrBodyDay` / `HairDay`

The `am` / `pm` / `steps` arrays change element type from `StepTuple[]` to
`RoutineStep[]`:

```ts
export type FaceOrBodyDay = {
  short: string; full: string; focus: string;
  am: RoutineStep[];
  pm: RoutineStep[];
};
export type HairDay = {
  short: string; full: string; type: string;
  steps: RoutineStep[];
};
```

`isHairDay` is unchanged (`"steps" in day`). `CategoryData` is unchanged in
shape (`{ products: string[]; days: DayData[] }`), but `days` now carries
`RoutineStep[]`.

### Step identity

Every step has a stable id string.

**Default (un-overridden) content** derives ids from position:

```
stepId = `${category}.${dayIndex}.${phase}.${index}`
// dayIndex 0..6 (Mon..Sun), phase "am" | "pm" | "steps", index 0-based
// e.g. "face.2.am.2", "hair.0.steps.4"
```

`routine.ts` stays authored as arrays with no ids in the source; ids are attached
by `content.ts` when a day is resolved (below).

**Overridden content** freezes ids at first copy-on-write. `overrides[category]`
stores each step as:

```ts
export type StoredStep = { id: string; step: RoutineStep };
```

On the first edit to a category, `content.ts` clones `routine[category]` into
`overrides[category]`, wrapping every step as `{ id: <derived positional id>,
step: <the RoutineStep> }`. Subsequent edits mutate this clone; ids of untouched
steps never change. A **new** step gets:

```
stepId = `${category}.${dayIndex}.${phase}.new-${n}`   // n from AppState.stepSeq, then stepSeq += 1
```

`stepSeq` is a monotonic counter on `AppState` (absent means 0). It only ever
increments, so a `new-${n}` id is never reused even across remove-then-add or a
later reset-and-re-edit.

Editing a step's product / note / variant **keeps its existing id**. Removing a
step drops its id; any `completedSteps` entry pointing at that id becomes a
harmless orphan (nothing renders against it; no cleanup needed for a single-user
app).

### `AppState` → version 3

```ts
export type CategoryOverride = {
  products: string[];
  days: StoredDay[];   // one per weekday, same order as routine[category].days
};

// StoredDay mirrors DayData but with StoredStep[] where DayData has RoutineStep[]:
export type StoredFaceOrBodyDay = {
  short: string; full: string; focus: string;
  am: StoredStep[]; pm: StoredStep[];
};
export type StoredHairDay = {
  short: string; full: string; type: string;
  steps: StoredStep[];
};
export type StoredDay = StoredFaceOrBodyDay | StoredHairDay;

export type CompletedStep = {
  date: string;      // ISO date of the routine day this step belongs to
  category: Category;
  stepId: string;
};

export type AppState = {
  version: 3;
  updatedAt: string;
  programStartDate: string;
  completedSteps: CompletedStep[];
  /** Present only for categories the user has edited. */
  overrides?: {
    face?: CategoryOverride;
    hair?: CategoryOverride;
    body?: CategoryOverride;
  };
  /** Monotonic counter for new-step ids. Absent = 0. */
  stepSeq?: number;
  ui: {
    activeCategory: Category;
    activeDayByCategory: Record<Category, number>;
  };
};
```

`day.short` / `full` / `focus` / `type` are copied into the override at CoW time
and are **not editable** in this sub-project (editing day metadata is out of
scope). They are stored so `getCategoryData` can return a complete
`CategoryData` from the override alone without re-reading `routine.ts`.

### `isAppState` (v3)

`isAppState` validates:

- `version === 3`
- `updatedAt`, `programStartDate` strings
- `completedSteps` is an array, every element passes the new `isCompletedStep`
  (`date` string, `category` a `Category`, `stepId` string)
- `ui` shape exactly as today
- `overrides`, **if present**, `isRecord` and every present key in
  `{face, hair, body}` passes `isCategoryOverride`:
  - `products` is `string[]`
  - `days` is an array of 7, each passing `isStoredDay` (branch on `"steps" in
    day`): metadata strings present, and every `StoredStep` has a string `id`
    and a `step` passing `isRoutineStep`
- `stepSeq`, **if present**, is a number

A missing `overrides` key or a missing category within it is valid (that
category is un-edited). An `overrides` value that is present but malformed fails
the whole guard — same policy as a malformed `ui` today: the Worker `PUT`
returns 400, the localStorage mirror parse discards it.

### `migrate()`

`src/shared/types.ts` keeps one `migrate(value: unknown): AppState | null`
called on every untrusted read (localStorage mirror, `useRemoteState.fetchRemote`,
Worker `GET` — which persists the upgrade when the serialization differs).

Arms:

1. `isAppState(value)` → return as-is (already v3).
2. `isV2State(value)` → upgrade to v3:
   - `version: 3`
   - `completedSteps`: map each v2 entry `{ date, category, phase, stepIndex }`
     to `{ date, category, stepId: \`${category}.${weekdayIndexOfIso(date)}.${phase}.${stepIndex}\` }`.
     `weekdayIndexOfIso` from `src/shared/date.ts` recovers the 0–6 Mon–Sun index
     from the stored routine-day date string (no TZ path — the weekday of a
     date-only string is the same everywhere). Exact for any state that has never used
     the (not-yet-existing) content editor — i.e. every state in the wild today.
   - `overrides` omitted, `stepSeq` omitted
   - `updatedAt`, `programStartDate`, `ui` carried over unchanged
3. `isV1State(value)` → upgrade to v2 shape inline, then run the v2→v3 arm on
   the result (v1 has no `completedSteps`, so the v3 `completedSteps` is `[]`).
4. otherwise → `null`.

`isV1State` stays a frozen snapshot. Add `isV2State` as a **new frozen
snapshot** of the pre-v3 `isAppState` body (the v2 `completedSteps` shape with
`phase`/`stepIndex`). It must not track future `isAppState` changes — same
discipline as `isV1State`. Keep the v2 `CompletedStep` field names only inside
`isV2State`; the exported `CompletedStep` type is the v3 shape.

## The resolution seam

New file `src/shared/content.ts`. Every read of routine content goes through it.

```ts
/** The override for this category if the user has edited it, else the shipped default. */
export function getCategoryData(state: AppState, category: Category): CategoryData;

/**
 * The routine day for (category, dayIndex) with week-conditional steps resolved
 * to plain [product, note], plus a parallel id list. `week` is the 1-based
 * program week from programWeek().
 */
export function resolveDayForState(
  state: AppState,
  category: Category,
  dayIndex: number,
  week: number,
): ResolvedDay;

export type ResolvedStep = { id: string; product: string; note: string };
export type ResolvedDay =
  | { kind: "facebody"; short: string; full: string; focus: string; am: ResolvedStep[]; pm: ResolvedStep[] }
  | { kind: "hair"; short: string; full: string; type: string; steps: ResolvedStep[] };
```

- `getCategoryData` returns `overrides[category]` reshaped to `CategoryData`
  (`StoredStep[]` → `RoutineStep[]` by dropping ids) when the override exists,
  else `routine[category]`. Overrides are independent per category — editing
  `face` never touches `overrides.hair`.
- `resolveDayForState` builds each `ResolvedStep` by:
  - taking the id: the derived positional id for a default day, or the frozen
    `StoredStep.id` for an overridden day;
  - resolving the step: `resolveStep(routineStep, week)` from `schedule.ts`.
- Hair vs face/body is branched on `isHairDay` of the underlying day.

### `schedule.ts` after the change

```ts
/** A RoutineStep resolved to the concrete [product, note] for `week` (1-based). */
export function resolveStep(step: RoutineStep, week: number): StepTuple;
```

- `isStepTuple(step)` → return `step`.
- `step.kind === "threshold"` → `week <= step.untilWeek ? step.before : step.from`.
- `step.kind === "cycle"` → `step.weeks[(week - 1) % step.length]`.
  `week` from `programWeek()` is always `>= 1`, so the modulus index is `0..length-1`.

`resolveDay(category, dayIndex, week)` is **removed** — `resolveDayForState` in
`content.ts` replaces it (it needs `state` for overrides). `schedule.ts` no
longer imports `routine.ts`. Its only export is `resolveStep`.

### Mutation helpers (pure, in `content.ts`)

Each takes `AppState` and returns a new `AppState`. Each performs the
copy-on-write clone of `overrides[category]` on first touch (via a private
`ensureOverride(state, category)` that also snapshots derived ids into
`StoredStep`s). None stamps `updatedAt` — the caller's `update()` /
`editContent()` does that.

```ts
addProduct(state, category): AppState                         // appends ""
renameProduct(state, category, index, name): AppState
removeProduct(state, category, index): AppState

addStep(state, category, dayIndex, phase): AppState           // appends { id: new-<n>, step: ["", ""] }, bumps stepSeq
updateStepTuple(state, category, dayIndex, phase, stepId, product, note): AppState
                                                             // only valid when the step is currently plain
removeStep(state, category, dayIndex, phase, stepId): AppState

setStepVariant(state, category, dayIndex, phase, stepId, variant: RoutineStep): AppState
  // Replaces the step's `step` field wholesale with `variant` (plain tuple,
  // threshold, or cycle), keeping the same StoredStep.id. This is how the UI
  // switches a step between "plain", "threshold", and "cycle" and edits any
  // branch: the VariantEditor builds the full next RoutineStep and calls this.

resetCategory(state, category): AppState                      // deletes overrides[category]; leaves stepSeq
```

`phase` is `"am" | "pm"` for face/body, `"steps"` for hair. Calling a face/body
phase on a hair day (or vice versa) is a programming error the callers never
make; helpers may assume the phase matches the day kind.

Empty-name handling is **not** in these helpers — they store whatever string
they are given (including `""`). The placeholder is a render concern (below).

## `progress.ts` after the change

Re-keyed off `stepId`. `resolveDay` import becomes `resolveDayForState` (so it
sees overrides), which means these functions now take `state` (or at least
`state` + the pieces they need) rather than a bare `completedSteps` array:

```ts
export function toggleCompletedStep(state: AppState, target: CompletedStep): AppState;
  // unchanged in spirit; `target` now carries stepId instead of phase/stepIndex

export function isStepDone(completed: CompletedStep[], date: string, category: Category, stepId: string): boolean;
  // (date, category, stepId) tuple equality

export function phaseCompletion(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, nowIso: string,
): { done: number; total: number };
  // total = resolved steps in that phase (via resolveDayForState + programWeek(state.programStartDate, nowIso))
  // done  = of those, how many have a matching completedSteps entry for the phase's routine-day date

export function dayCompletion(
  state: AppState, category: Category, dayIndex: number, nowIso: string,
): { done: number; total: number };
```

`sameStep` compares `date`, `category`, `stepId`. `StepPhase` (`"am" | "pm" |
"steps"`) stays as a type — it is still how the UI names the three step lists and
how `phaseCompletion` is scoped — it is just no longer part of a
`completedSteps` entry's identity.

The positional-identity trade-off documented in `CLAUDE.md` for the week-2/3
boundary **goes away**: a conditional step has one id across all weeks, so a
check-off made in week 2 still reads as done in week 3. Update that CLAUDE.md
paragraph.

## State plumbing

`src/state/AppStateProvider.tsx`:

- `toggleStep` signature → `(category: Category, dayIndex: number, stepId: string)`.
  It still stamps the routine-day date via `weekdayDateIso(dayIndex, todayIso())`
  and calls `toggleCompletedStep`.
- New context member `editContent(mutate: (state: AppState) => AppState): void`
  — a thin wrapper over `update(mutate)`, exposed so components can apply the
  `content.ts` helpers. Example call site:
  `editContent((s) => addStep(s, "face", 2, "pm"))`.
- `useRemoteState` needs no change — `overrides` and `stepSeq` ride the existing
  debounced `PUT` and the localStorage mirror automatically as part of
  `AppState`.

## UI

### Entry and mode

`CategorySection` gains local `const [editing, setEditing] = useState(false)`
(not persisted — reopening the app is always read mode). A pencil
button near the hero toggles it. `editing` resets to `false` whenever
`activeCategory` changes (a category switch leaves edit mode).

While `editing` is true for a category:

- The `WeekProgress` strip is hidden.
- Step checkboxes are not rendered (the `<label className="step-check">` and its
  input). No check-off is possible in edit mode.
- `DayTabs` stays visible and functional (you edit one day at a time).

### Gallery (edit mode)

`Gallery` gains `editing?: boolean` and, when editing, an `onEdit` bundle:
`{ onRename(index, name), onRemove(index), onAdd() }`. Each product renders as a
controlled `<input type="text">` with a `×` button; a trailing "+ Thêm sản
phẩm" button calls `onAdd`. When `editing` is false, `Gallery` renders exactly
as it does today (read-only list).

An empty product string renders (in read mode, and as the input's placeholder)
as `Sản phẩm chưa đặt tên`.

### Day panel (edit mode)

`DayPanel` gains `editing?: boolean` and an `onEdit` bundle:
`{ onAddStep(phase), onUpdateStep(phase, stepId, product, note), onRemoveStep(phase, stepId), onSetVariant(phase, stepId, variant) }`.

When editing, each `Card`'s step list renders `StepEditor` rows instead of the
read-only `<li>`; the per-card `done/total` count is hidden. A "+ Thêm bước"
button under each card calls `onAddStep(phase)`.

When `editing` is false, `DayPanel` renders exactly as today (via
`resolveDayForState` instead of the removed `resolveDay` — same visual output).

**Props threading.** `resolveDayForState` and the re-keyed `progress.ts`
functions need `overrides`, which `CategorySection` / `DayPanel` / `WeekProgress`
do not receive today. Thread the whole `AppState` down to these three components
(replacing the current separate `programStartDate` / `completedSteps` props)
rather than adding an `overrides` prop alongside the existing ones — one `state`
prop is less to keep in sync as the shape grows. `App.tsx` already has `state`
from `useAppState()` to pass.

### `StepEditor.tsx` (new)

One step, collapsed by default: shows the resolved product name (or `Bước chưa
đặt tên` when empty) and a chevron; a `×` remove button. Tapping the row
expands it to:

- product `<input type="text">`
- note `<input type="text">`
- a variant `<select>` / segmented control with three options:
  `Không đổi theo tuần` (plain) · `Đổi theo mốc tuần` (threshold) ·
  `Luân phiên theo chu kỳ` (cycle)
- when the underlying step is plain: editing the product/note inputs calls
  `onUpdateStep(phase, stepId, product, note)` (debounced or on-blur — see
  "Validation").
- when the variant control is not "plain", the product/note inputs are replaced
  by `<VariantEditor>` (the plain product/note is used as the initial `before` /
  `weeks[0]` when converting from plain).

Collapsed/expanded is local `useState` in `StepEditor`, keyed by step id.

### `VariantEditor.tsx` (new)

Given the current `RoutineStep` and an `onChange(next: RoutineStep)` callback,
renders the branch editors for the selected kind and calls `onChange` with a
fully-built next `RoutineStep` on every edit. The parent (`StepEditor`) forwards
that to `onSetVariant(phase, stepId, next)`.

- **threshold**: an `untilWeek` `<input type="number" min="1">`, then two
  labelled blocks — `Tuần 1–{untilWeek}` and `Từ tuần {untilWeek}+1` — each with
  a product and a note input, bound to `before` / `from`.
- **cycle**: a length control (`2` / `4`), then `length` labelled blocks. For
  `length === 2`: `Tuần lẻ (1, 3…)` and `Tuần chẵn (2, 4…)`. For `length === 4`:
  `Tuần 1` … `Tuần 4`. Each block a product + note input, bound to `weeks[i]`.
- Switching kind:
  - plain → threshold: `before = from = ` the current plain tuple; `untilWeek = 2`.
  - plain → cycle: `length = 2`, `weeks = [tuple, tuple]`.
  - threshold → cycle / cycle → threshold: carry the first branch's tuple into
    all new branches; reset `untilWeek`/`length` to defaults.
  - any → plain: keep the first branch's tuple as the plain `[product, note]`.

### Reset

A `Đặt lại theo mặc định` button in the edit-mode header for the category. On
click, `window.confirm("Đặt lại toàn bộ nội dung <category> về mặc định? Các
thay đổi bạn đã tạo sẽ bị xoá.")`; on OK, `editContent((s) => resetCategory(s,
category))`. Check-off history (`completedSteps`) is **not** touched by reset —
entries that pointed at frozen override ids become orphans, entries that match
the (restored) derived positional ids resolve again.

## Validation & error handling

All validation is client-side and cosmetic. No blocking, no server-side shape
rules beyond `isAppState`.

- **Empty product / note / step name**: stored as `""`. Rendered — and used as
  the input `placeholder` — as `Sản phẩm chưa đặt tên` (gallery) or `Bước chưa
  đặt tên` (step). Never blocks an edit or the `PUT`.
- **`untilWeek`**: on blur, coerce to `Math.max(1, Math.round(n))`; a blank or
  `NaN` becomes `2`.
- **`cycle.length` change**: when the length control switches to `L`,
  `weeks` is truncated to `L` or padded with `["", ""]` to reach `L`, so
  `weeks.length === length` always holds before `setStepVariant` is called.
- **Removing the last step in a phase**: allowed. The card renders with an empty
  `<ul>` — visually the same as a thin hair rest-day today.
- **Removing a product referenced by a step**: allowed and inert — the step
  keeps its own product string.
- **Persistence**: `overrides` / `stepSeq` ride the existing `GET` / `PUT` /
  localStorage-fallback cycle. No new failure modes. A malformed `overrides`
  reaching the Worker `PUT` is 400'd by `isAppState` exactly as a malformed `ui`
  is today.
- **v3 blob reaching an un-migrated older client** (during the brief
  double-deploy race on a `src/shared/**` push): same transient
  `Ngoại tuyến — đang hiển thị dữ liệu đã lưu` that self-heals on reload, already
  documented for the v1→v2 rollout. The old client's repair-`PUT` of a v2 body
  is 400'd by the migrated Worker's `isAppState` before it can clobber the v3
  blob; the local mirror wins the next reconcile.

## Testing

### `src/shared/types.test.ts` (extend)

- `isStepTuple` / `isRoutineStep`: accepts `["a", "b"]`; rejects `["a"]`,
  `["a", 1]`, `{}`; accepts a well-formed threshold and cycle; rejects
  `{ kind: "threshold", untilWeek: 0, ... }` is **not** rejected by the guard
  (guard checks shape, not `>= 1` — the `>= 1` is UI coercion) — assert the
  guard accepts `untilWeek: 0` so we don't over-constrain the boundary.
- `isCycleVariant`: rejects `length: 3`; rejects `weeks.length !== length`.
- `isAppState` (v3): accepts a v3 blob with no `overrides`; accepts one with
  `overrides.face` well-formed; rejects `overrides.face.days` of length 6;
  rejects a `StoredStep` missing `id`; rejects `stepSeq: "3"`.
- `migrate`: a v2 blob with two `completedSteps` entries →
  v3 with `stepId` = `\`${category}.${weekdayIndexOfIso(date)}.${phase}.${stepIndex}\``
  for each (assert the exact strings for a Monday date and a Sunday date); a v1
  blob → v3 with `completedSteps: []`; a v3 blob returned as-is; junk → `null`.
- `isV2State` frozen: it still accepts a canonical v2 blob after the v3 changes
  (regression guard on the snapshot).

### `src/shared/schedule.test.ts` (rewrite)

- `resolveStep(["p", "n"], 5)` → `["p", "n"]` (same reference).
- threshold `untilWeek: 2`: week 1 → `before`, week 2 → `before`, week 3 →
  `from`, week 9 → `from`.
- cycle `length: 2`: weeks 1,3,5 → `weeks[0]`; weeks 2,4 → `weeks[1]`.
- cycle `length: 4`: weeks 1..5 → `weeks[0..3, 0]`.
- The two real `routine.ts` conditionals: `faceDays[2].am[2]` resolves to the
  Vitamin C pair at week 1 and the Niacinamide pair at week 3;
  `faceDays[6].pm[3]` resolves to Peppermint at week 1 / week 3 and Natural
  White at week 2 / week 4. Assert the exact Vietnamese strings.

### `src/shared/content.test.ts` (new)

- `getCategoryData`: no override → returns `routine[category]` (same reference);
  with `overrides.face` → returns the override reshaped, `products` and step
  count matching; `overrides` independence — building an override for `face`
  leaves `getCategoryData(state, "hair")` returning the default.
- `resolveDayForState`: default `face` Wednesday at week 1 → AM step index 2 is
  the Vitamin C pair, its `id` is `"face.2.am.2"`; at week 3 → Niacinamide pair,
  same `id`.
- id freezing: `addStep(state, "face", 0, "pm")` → new `StoredStep` id
  `"face.0.pm.new-0"`, `stepSeq` becomes 1; a second `addStep` → `new-1`,
  `stepSeq` 2. Untouched steps in the same day keep `"face.0.pm.0"` etc.
- `renameProduct` / `addProduct` / `removeProduct`: correct `products` array,
  CoW clone created, other categories untouched.
- `updateStepTuple`: changes product/note, keeps `id`.
- `setStepVariant`: plain → threshold (id preserved, `step.kind === "threshold"`,
  `before === from ===` old tuple, `untilWeek === 2`); threshold → cycle;
  cycle → plain (keeps `weeks[0]`).
- `removeStep`: step gone from the day, other steps' ids unchanged, `stepSeq`
  unchanged.
- `resetCategory`: `overrides[category]` deleted, other categories' overrides
  intact, `stepSeq` unchanged.

### `src/shared/progress.test.ts` (rewrite for id keys)

- `toggleCompletedStep` adds then removes an entry matched on
  `(date, category, stepId)`.
- `isStepDone` true only for the exact `(date, category, stepId)`.
- `phaseCompletion` / `dayCompletion`: `total` from the resolved day (default and
  with an override that added a step — total goes up by 1); `done` counts only
  matching-date entries in the current week.
- With a conditional step: a `completedSteps` entry made at week 2 still counts
  as done when the same day is viewed at week 3 (id is week-invariant).

### Component tests

- `CategorySection.test.tsx`: a pencil button toggles edit mode; in edit mode
  the `WeekProgress` strip and step checkboxes are absent; switching category
  exits edit mode. (Extend the existing file; keep its current assertions.)
- `Gallery.test.tsx` (new or extend): `editing` renders text inputs + a remove
  per product and an add button; typing calls `onRename` with `(index, value)`;
  `editing` false renders the plain list unchanged.
- `StepEditor.test.tsx` (new): collapsed by default showing the product name;
  tapping expands to product/note inputs; the variant `<select>` switching to
  `Đổi theo mốc tuần` renders the threshold branch inputs; `×` calls
  `onRemoveStep` with the step id.
- `VariantEditor.test.tsx` (new): given a threshold step, editing the
  `Từ tuần N+1` product input fires `onChange` with a `RoutineStep` whose
  `from[0]` is the new value and whose `before` is unchanged; switching length
  2→4 yields `weeks.length === 4`.
- `DayPanel.test.tsx` (extend): with `editing` false and an `AppState` carrying
  an `overrides.face` that renamed a step, the panel shows the overridden
  product; with `editing` true the card shows `StepEditor` rows and the
  `done/total` badge is hidden.

### Manual click-through (phone width)

Add / rename / remove a product; add / edit / remove a step; convert a plain
step to threshold and to cycle and back; edit each branch; reset a category to
default; confirm a check-off made before an edit still shows after a compatible
edit and is orphaned (not crashing) after the step is removed.

## File-by-file summary

| File | Change |
|---|---|
| `src/shared/types.ts` | `RoutineStep` union + variant types + guards; `StoredStep` / `StoredDay` / `CategoryOverride`; `AppState` → v3 (`overrides?`, `stepSeq?`, `completedSteps` re-keyed); `isAppState` v3; `isCompletedStep` v3; `migrate` v2→v3 arm; new frozen `isV2State`; `isV1State` unchanged |
| `src/shared/routine.ts` | `faceDays[2].am[2]` and `faceDays[6].pm[3]` authored as `ConditionalStep`s (verbatim strings); day array element types widen to `RoutineStep[]`; nothing else |
| `src/shared/schedule.ts` | delete `WEEKS_1_2_WEDNESDAY_AM`, `EVEN_CYCLE_SUNDAY_PM`, `withStep`, `resolveDay`; drop the `routine.ts` import; export only `resolveStep(step, week)` |
| `src/shared/content.ts` | **new** — `getCategoryData`, `resolveDayForState` (+ `ResolvedStep` / `ResolvedDay`), `ensureOverride`, and the 8 mutation helpers |
| `src/shared/progress.ts` | `sameStep` / `isStepDone` / `phaseCompletion` / `dayCompletion` re-keyed off `stepId`; import `resolveDayForState`; take `state` |
| `src/state/AppStateProvider.tsx` | `toggleStep(category, dayIndex, stepId)`; new `editContent(mutate)` member |
| `src/App.tsx` | pass `state` (not `programStartDate` / `completedSteps` separately) to `CategorySection`; wire `editContent` from `useAppState()` |
| `src/components/CategorySection.tsx` | takes `state` prop; `editing` `useState`, pencil toggle, reset-to-default button, thread `editing` + `onEdit` bundles into `Gallery` / `DayPanel` / `WeekProgress`; exit edit mode on category change; read path uses `resolveDayForState` |
| `src/components/DayPanel.tsx` | takes `state` prop (replaces `programStartDate` / `completedSteps`); `editing` prop + `onEdit` bundle; render via `ResolvedStep` (ids); edit mode → `StepEditor` rows, hide `done/total`, "+ Thêm bước" |
| `src/components/WeekProgress.tsx` | takes `state` prop (replaces `programStartDate` / `completedSteps`) so its counts see overrides; hidden by `CategorySection` in edit mode |
| `src/components/Gallery.tsx` | `editing` prop + `onEdit` bundle; edit mode → text inputs / remove / add |
| `src/components/StepEditor.tsx` | **new** — expand-on-tap step row, product/note inputs, variant selector, remove |
| `src/components/VariantEditor.tsx` | **new** — threshold / cycle branch editors, kind + length switching, builds the next `RoutineStep` |
| `worker/handlers.ts` | none (shape validation is the shared `isAppState`) |
| `CLAUDE.md` | document `overrides` / `stepSeq` / v3 migration; `content.ts` as the content read seam replacing direct `routine.ts` reads and `schedule.ts#resolveDay`; editor scope; remove the positional-identity trade-off paragraph (ids are now stable); note reorder + gallery-link non-features |

## Definition of done

- `npm run test` green (constraint gate + all vitest suites, frontend + worker).
- `npm run typecheck` clean on both tsconfigs; `npm run build` succeeds.
- `npm run lint:constraints` clean — no new `as` / `any` / `!` / `@ts-ignore`.
- Every current reader of `routine[category]` now reads through `content.ts`;
  `schedule.ts` no longer imports `routine.ts`.
- `migrate` upgrades a real v2 blob (the one the live Worker serves today) to v3
  with `completedSteps` preserved by the `weekdayIndexOfIso(date)` remap, stable
  across repeated `GET`s (no reseed loop).
- Manual click-through on a phone-width viewport passes for all edit operations
  and reset-to-default.
- `CLAUDE.md` updated.
