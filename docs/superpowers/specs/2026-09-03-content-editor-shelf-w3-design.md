# Content Editor Wave 3 — Product Shelf

**Status:** design approved 2026-09-03, ready for implementation planning
**Predecessors:** Wave 1 (`2026-09-02-content-editor-usability-w1-spec.md`), Wave 2
(`2026-09-02-content-editor-usability-w2-spec.md`), both merged to `main`.
**Sub-project:** part of sub-project 3 (the in-app content editor).

## Goal

Make the per-category product list ("the shelf") a working part of the editor rather than a
decorative strip: reorderable, offered as autocomplete when naming a step's product, growable
from inside the step editor, and annotated with where each entry is actually used. Plus close
two parked Wave 2 review minors (M3, M7).

## Background

`src/shared/routine.ts` ships each category as `{ products: string[], days: DayData[] }`. The
shelf (`products`) and the product names inside steps are **largely disjoint strings today** —
the face shelf is 10 curated "hero" entries, some deliberately grouped
(`"Serum Centella / Cetaphil Cica / C22 / ANR"`), while steps name specific products verbatim,
including many never shown on the shelf (day moisturiser, sunscreen, night cream). Steps
reference a product only as free text in `StepTuple[0]`; there is no id link between a step and
a shelf entry. Icons are keyword-matched from whatever string a step or shelf entry contains
(`src/icons/pickIcon.ts`).

Wave 2 deferred "reordering products", "linking a gallery entry to the steps that name it", and
review minors M3 (drag handle doesn't hint the arrow keys) and M7 (`useDragSort` unguarded
against its list shrinking mid-drag). This wave takes all of those.

Per-user edits already live in `AppState.overrides[category]` (copy-on-write, whole-category),
resolved through `src/shared/content.ts`. `CategoryOverride` is `{ products: string[], days:
StoredDay[], focusPrefix?: string }`. `AppState` is `version: 3`.

## Non-goals

- **No schema change.** `AppState` stays `version: 3`; `CategoryOverride.products` stays
  `string[]`. No migration arm, no new frozen `isVNState` snapshot.
- **No rename propagation.** Renaming a shelf entry does not touch steps that used the old
  name; the entry's usage view simply recomputes (and may flip to "unused").
- **No fuzzy matching.** Shelf↔step matching is exact after trimming both sides.
- **No per-product metadata** — no brand, size, "running low", purchase link, or manual icon
  choice. A shelf entry is still just a name.
- **No custom autocomplete widget.** The picker is the native `<datalist>` element.
- Hair and body are not special-cased. They render the same components; their usage views are
  simply sparser.

## Global constraints (inherited, unchanged)

- No `as` casts, no `any`, no `@ts-ignore`/`@ts-nocheck`, no non-null `!` assertions anywhere
  in `src/` or `worker/`, including tests. Narrow with type predicates / `in` checks.
  `npm run lint:constraints` enforces this; the only allowed exception is the one
  `as Record<string, unknown>` inside `isAppState`.
- `src/shared/` is imported by both the frontend and the Worker builds — no frontend-only
  globals or display strings leak into it.
- Vietnamese UI strings that already exist (routine content, day copy) are never paraphrased or
  regenerated. New UI copy introduced by this wave is listed verbatim below.
- Node 20. `strict: true`. `npm run test` runs `lint:constraints` then the full Vitest suite;
  `npm run build` runs `typecheck` first.

## Design

### 1. `src/shared/content.ts` — three additions

**1a. `moveProduct`** — direct analogue of `moveStep`:

```ts
export function moveProduct(
  state: AppState, category: Category, fromIndex: number, toIndex: number,
): AppState
```

- Read the current shelf length from `state.overrides?.[category]?.products` if an override
  exists, else `routine[category].products` — **before** deciding whether to clone.
- If `fromIndex === toIndex`, or either index is `< 0` or `>= length`, return `state`
  unchanged (same reference — no copy-on-write).
- Otherwise `ensureOverride`, `const arr = [...o.products]`, `const [moved] =
  arr.splice(fromIndex, 1)`, `arr.splice(toIndex, 0, moved)`, `o.products = arr`,
  `withOverride`.

**1b. `addProduct` gains an optional name:**

```ts
export function addProduct(state: AppState, category: Category, name = ""): AppState
```

The body pushes `name` (the caller passes an already-trimmed string for "add to shelf"; the
gallery's blank-row button passes nothing). Existing call sites are unaffected. No separate
`addProductNamed`.

**1c. `productUsage`** — derived, no display strings:

```ts
export type StepUsage = { dayIndex: number; phase: StepPhase; stepId: string };

export function productUsage(
  state: AppState, category: Category, name: string,
): StepUsage[]
```

- `const target = name.trim()`. If `target === ""` return `[]`.
- Walk `getStoredDays(state, category)`. For each day, for each phase present on that day
  (`["am","pm"]` or `["steps"]`), for each `StoredStep s`: compute the set of product strings
  the step *names*:
  - plain `StepTuple` → `[step[0]]`
  - `threshold` → `[step.before[0], step.from[0]]`
  - `cycle` → `step.weeks.map((w) => w[0])`
  - (reuse the existing `isStepTuple` / `kind` checks; no new predicate needed)
- If any of those, trimmed, equals `target`, push `{ dayIndex, phase, stepId: s.id }`.
- Order: day ascending, then phase in `["am","pm","steps"]` order, then array order. One entry
  per matching step (not per matching branch).

This is week-independent by design — "is this product named anywhere in this step", not "does
the step resolve to it in the current week".

### 2. The step product picker

**2a. Native datalist.** `DayPanel` already receives `state` and `category`. It renders exactly
one `<datalist id={`shelf-${category}`}>` for the active category, whose `<option value>`s are
the category's shelf names (`getCategoryData(state, category).products`), empty strings dropped
and duplicates removed keeping first-occurrence order. It passes down through
`StepEditor → VariantEditor → TupleFields`:

- `datalistId: string` — `TupleFields`' product `<input>` sets `list={datalistId}`.
- `onAddToShelf: (name: string) => void`.
- `shelfNames: string[]` — the same de-duped non-empty list, so `TupleFields` can decide
  whether to show the add button.

The note `<input>` is unchanged (no datalist).

**2b. "Add to shelf" affordance.** In `TupleFields`, below the product field, render:

```
＋ Thêm "<trimmed text>" vào kệ
```

as a `<button type="button">` **only when** `productBuf.value.trim() !== ""` **and**
`!shelfNames.includes(productBuf.value.trim())`. On click it calls
`onAddToShelf(productBuf.value.trim())`. It does not modify the step — the step already holds
that text through the normal buffered-commit path. After the click the shelf contains the name,
so the button's condition goes false and it disappears.

`CategorySection` wires `onAddToShelf={(name) => editContent((s) => addProduct(s, category,
name))}` and passes `datalistId` / `shelfNames` into `DayPanel`.

**2c. Threading.** `datalistId`, `onAddToShelf`, `shelfNames` travel the same prop path that
already carries `onUpdateStep` etc. Every `TupleFields` instance — plain step, both threshold
branches, each cycle week — receives them and behaves identically.

### 3. The shelf usage view (`Gallery` edit mode)

`Gallery` currently takes only `products` + `editing` + `onEdit`. It gains `state` and
`category` props (passed by `CategorySection`). `GalleryEdit` gains:

```ts
onMove: (fromIndex: number, toIndex: number) => void;
onJump: (dayIndex: number, stepId: string) => void;
```

Each editable `ProductRow` renders, under its input, the result of `productUsage(state,
category, product)`:

- non-empty → a row of buttons, one per `StepUsage`, labelled
  `${DAY_SHORT[dayIndex]} ${PHASE_LABEL[phase]}` from the `StepUsage`'s own `dayIndex`/`phase`
  (`DAY_SHORT` and `PHASE_LABEL` already exist in `CustomizationsStrip.tsx`; move both into a
  small shared UI module — `src/components/dayLabels.ts` — and import from both places, rather
  than duplicating). Each button calls `onEdit.onJump(dayIndex, stepId)`.
- empty → the text `⚠ Chưa dùng ở bước nào` (a `<span>`, not a button).

**Jump plumbing.** `CustomizationsStrip` already jumps via `CategorySection` state
(`onJump(dayIndex, stepId)` → set `activeDay`, then scroll to / open the step by id, which is
phase-agnostic — `DayPanel` matches `openStepId` across every phase it renders). `Gallery`
reuses that handler unchanged; the `phase` only ever feeds the chip's label, so it never needs
to travel through `onJump`. `CustomizationsStrip`'s `onJump` signature is untouched.

### 4. `useDragSort` revision (`src/hooks/useDragSort.ts`)

One revision covers the shelf reorder, M3 and M7.

**4a. `mode` option.**

```ts
useDragSort<T>(
  items: T[],
  keyOf: (item: T, index: number) => string,
  onReorder: (fromIndex: number, toIndex: number) => void,
  opts?: { mode?: "live" | "onDrop"; itemNoun?: string },
)
```

- `mode` defaults to `"live"` — current Wave 2 behaviour (re-sorts under the finger, one
  `onReorder` on drop). Step rows keep this.
- `mode: "onDrop"` — `order` stays strictly equal to `items` for the whole gesture; the hook
  tracks an internal `dropIndex` (the slot the pointer is currently over, by the same
  midpoint math) and exposes it as `dropTargetKey: string | null` for a drop-indicator; on
  `pointerup` it fires `onReorder(fromIndex, dropIndex)` once (a no-op if equal). The shelf
  uses this — no stable item ids required, index keys are safe because the list never
  re-sorts mid-drag.
- `keyOf` gains an `index` argument so callers without natural ids (the shelf) can pass
  `(name, i) => String(i)`.

**4b. M3 — arrow-key hint in the handle label.** `itemNoun` defaults to `"mục"`. The
`handleProps(index)["aria-label"]` becomes:

```
Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp <noun> <index + 1>
```

Step call sites pass `itemNoun: "bước"`; the shelf passes `itemNoun: "sản phẩm"`. Wave 2 tests
that assert the old `Kéo để sắp xếp bước N` string are updated to the new text.

**4c. M7 — guard against the list shrinking mid-drag.**

- `draggingKey` (and `dropTargetKey`) return `null` when the tracked index is `>= items.length`.
- `order` drops any index `>= items.length`.
- The pointer-move effect, if `drag.fromIndex >= items.length`, calls `endDrag()` and returns
  without dereferencing.
- No `keyOf(undefined)` / `items[oob]` dereference is reachable.

### 5. `Gallery` reorder wiring

In edit mode `Gallery` calls `useDragSort(products, (name, i) => String(i), (from, to) =>
onEdit.onMove(from, to), { mode: "onDrop", itemNoun: "sản phẩm" })`. Each `ProductRow` gets a
`⠿` handle (`<button {...handleProps(index)}>`), a `dragging` class when
`draggingKey === String(index)`, and a drop-indicator treatment when
`dropTargetKey === String(index)`. `CategorySection` wires
`onMove={(from, to) => editContent((s) => moveProduct(s, category, from, to))}`.

Arrow keys on the handle work through the same `handleProps` path the step handles use.

### New UI copy (verbatim)

| String | Where |
|---|---|
| `＋ Thêm "<name>" vào kệ` | add-to-shelf button in `TupleFields` (the `<name>` is the trimmed field text) |
| `⚠ Chưa dùng ở bước nào` | unused-entry note under a shelf row |
| `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp bước <n>` | step drag-handle aria-label |
| `Kéo hoặc dùng phím mũi tên lên/xuống để sắp xếp sản phẩm <n>` | shelf drag-handle aria-label |

`DAY_SHORT` (`T2…CN`) and `PHASE_LABEL` (`Sáng` / `Tối` / `Chăm tóc`) are existing strings,
relocated to `src/components/dayLabels.ts`, not new.

## Data flow

1. **Reorder** — handle drag/arrow → `Gallery` `useDragSort` (`onDrop` mode) →
   `onEdit.onMove(from, to)` → `CategorySection` `editContent(moveProduct(...))` →
   `AppStateProvider` → debounced `PUT`. The category is copied-on-write on the first reorder
   if it had no override.
2. **Autocomplete** — `DayPanel` reads `getCategoryData(state, category).products`, renders the
   `<datalist>`; the browser matches the product `<input>` against it. No state change from
   using a suggestion — it's just typed text that happens to match.
3. **Add to shelf** — button → `onAddToShelf(trimmed)` → `editContent(addProduct(s, category,
   trimmed))`. The shelf array gains the entry; the step is untouched.
4. **Usage view** — pure `productUsage(state, category, name)` on every render of an editable
   `ProductRow`; no state, no memoisation needed at this list size.
5. **Jump** — usage chip → `onEdit.onJump(dayIndex, stepId)` → `CategorySection` sets
   `activeDay = dayIndex` and signals `DayPanel` to scroll to / open `stepId` (phase-agnostic,
   as `CustomizationsStrip` already does).

## Error handling / edge cases

- **Empty shelf name** — excluded from the `<datalist>` and from `shelfNames`, so the add
  button treats a blank field as "nothing to add" (its `trim() === ""` guard). `moveProduct`
  still reorders blank rows fine (index keys).
- **Duplicate shelf names** — allowed (the shipped shelves have none, but nothing forbids it);
  `<datalist>` de-dupes options, `productUsage` matches all steps regardless, `moveProduct`
  works by index. No dedup enforcement.
- **`productUsage` on a conditional step** — matches if the name appears in *any* branch;
  yields one entry for that step, keyed by the step's stable id.
- **Rename then reorder** — `moveProduct` operates on the post-rename array; usage views
  recompute. No stale state.
- **List shrinks during a drag** (e.g. a sync reconcile drops a row) — M7 guard ends the drag
  with no throw and no `onReorder`.
- **`reset` (`Đặt lại theo mặc định`)** — unchanged; `resetCategory` already drops the whole
  override including a reordered/grown shelf.
- **Deploy race / old client** — no schema change, so none of the Wave 2 deploy-race notes
  change. An old client reads a blob whose `overrides[c].products` is merely reordered or
  longer — still a valid `string[]`, `isCategoryOverride` passes.

## Testing

### `src/shared/content.test.ts`
- `moveProduct`: reorders `[a,b,c]` → `[b,c,a]` for `(0,2)`; returns the **same reference** for
  `fromIndex === toIndex` and for out-of-range indices; creates the override from
  `routine[category]` on first call; leaves other categories' overrides absent.
- `addProduct(state, c, "X")` appends `"X"`; `addProduct(state, c)` still appends `""`.
- `productUsage`: matches a plain step; matches via a `threshold` branch and via a `cycle`
  branch; trims both sides (`"  Toner Cocoon Sen "` matches `"Toner Cocoon Sen"`); empty /
  whitespace name → `[]`; after `renameProduct` changes an entry, `productUsage(old name)` is
  `[]` and `productUsage(new name)` is non-empty; ordering is day- then phase-stable.

### `src/components/Gallery.test.tsx`
- given a state whose shelf entry is used by two steps, the row renders two jump buttons with
  the expected `T<n> <phase>` labels; a click fires `onJump(dayIndex, phase, stepId)`.
- an unused entry renders `⚠ Chưa dùng ở bước nào` and no jump buttons.
- `ArrowDown` on the first product handle calls `onMove(0, 1)`; the handle's `aria-label`
  contains `phím mũi tên` (M3) and `sản phẩm`.

### `src/components/VariantEditor.test.tsx`
- the product `<input>` has `list` set to the passed `datalistId`; the note input does not.
- the add-to-shelf button is present when the field holds off-shelf text, absent when it holds
  an on-shelf name, and calls `onAddToShelf` with the trimmed value.
- shown for a threshold branch field too (not only the plain kind).

### `src/components/DayPanel.test.tsx`
- exactly one `<datalist id="shelf-face">` in the tree for a face day, its options equal to the
  de-duped non-empty shelf names.
- `onAddToShelf` and `datalistId` reach the rendered `TupleFields` (assert via the input's
  `list` attribute and a button click).

### `src/components/CategorySection.test.tsx` (integration, stateful host)
- enter edit mode, type an off-shelf product name into a step, click `Thêm "…" vào kệ`: the
  gallery gains a row with that name, and that row's usage view lists the day+phase just
  edited.
- drag (or arrow) reorder of two shelf rows persists after the host re-renders from committed
  state.
- a usage-chip click switches `activeDay` to the chip's day.

### `src/hooks/useDragSort.test.tsx`
- `mode:"onDrop"`: during `pointermove` the rendered `order` is unchanged; exactly one
  `onReorder` fires on `pointerup`, with the slot the pointer ended over.
- M7: shrink `items` (rerender with a shorter list) between `pointerdown` and `pointermove` —
  no throw, the drag ends, no `onReorder`.
- M3: `handleProps(0)["aria-label"]` equals the new hint string for the default noun and for
  an explicit `itemNoun`.
- existing Wave 2 pointer/keyboard tests still pass with their asserted aria-label strings
  updated to the new text.

## File-touch summary

| File | Change |
|---|---|
| `src/shared/content.ts` | `moveProduct`, `addProduct` optional `name`, `productUsage` + `StepUsage` |
| `src/shared/content.test.ts` | new cases above |
| `src/hooks/useDragSort.ts` | `mode` + `itemNoun` opts, `keyOf` index arg, `dropTargetKey`, M3 label, M7 guards |
| `src/hooks/useDragSort.test.tsx` | onDrop / M3 / M7 cases; update aria-label assertions |
| `src/components/dayLabels.ts` | **new** — `DAY_SHORT`, `PHASE_LABEL` (moved from `CustomizationsStrip`) |
| `src/components/CustomizationsStrip.tsx` | import `DAY_SHORT`/`PHASE_LABEL` from `dayLabels` (no signature change) |
| `src/components/Gallery.tsx` | `state`/`category` props; usage view; drag/arrow reorder; `GalleryEdit` gains `onMove`, `onJump` |
| `src/components/Gallery.test.tsx` | new cases |
| `src/components/VariantEditor.tsx` | `datalistId` / `shelfNames` / `onAddToShelf` props; `list=` on product input; add-to-shelf button in `TupleFields` |
| `src/components/VariantEditor.test.tsx` | new cases |
| `src/components/StepEditor.tsx` | pass the three new props through to `VariantEditor` |
| `src/components/DayPanel.tsx` | render the `<datalist>`; thread `datalistId`/`shelfNames`/`onAddToShelf` |
| `src/components/DayPanel.test.tsx` | datalist + threading cases; update drag-handle aria-label assertions to the M3 string |
| `src/components/CategorySection.tsx` | wire `moveProduct`, `addProduct(name)`; pass `state`/`category`/shelf props to `Gallery` and `DayPanel` |
| `src/components/CategorySection.test.tsx` | integration cases |
| `src/styles.css` | shelf handle + drop-indicator + usage-chip styling |
| `CLAUDE.md` | document `moveProduct` / `productUsage` / the datalist picker / `useDragSort` `mode`; note M3/M7 closed |

## Out of scope, and where later work attaches

- Rename propagation and a "merge two shelf entries" action would build on `productUsage` — it
  already returns the exact `stepId`s an `updateStepTuple` sweep would target.
- Shelf entry ids (a `version: 3 → 4` migration) become worthwhile only if a later feature
  needs to survive a rename or track per-product metadata; `productUsage` is the seam that
  would switch from name-matching to id-matching.
- The icon override (manual `IconKey` per product) would attach to a shelf entry once entries
  carry structure beyond a bare string.
