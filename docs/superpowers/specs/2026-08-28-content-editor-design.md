# In-App Content Editor — Design

Status: approved, sub-project 3 of 5
Date: 2026-08-28
Depends on: [Foundation rebuild](./2026-08-28-foundation-rebuild-design.md), [Progress tracking](./2026-08-28-progress-tracking-design.md) (for the step/variant data model and stable `id`s)

## Goal

Let the user add/rename/remove products and steps, and add/remove
week-conditional variant branches on a step (the two condition kinds from
progress tracking: "from week N onward" and "alternates by week parity") —
all from the UI, on a phone, without asking Claude to edit code.

## Scope

In scope: per-category product gallery (add/rename/remove), per-day steps
(add/edit/remove a step's product+note, add/remove a variant branch on a
step). Out of scope: changing which categories exist, theme colors, or the
keyword-based icon set (a new product that doesn't match an existing
keyword just falls back to the default flower icon — acceptable).

## Data model: `AppState` addition

```ts
overrides: {
  face?: CategoryOverride;
  hair?: CategoryOverride;
  body?: CategoryOverride;
};

type CategoryOverride = {
  products?: string[];
  days?: DayData[]; // same shape as the shipped default, full replacement
};
```

**Copy-on-write, whole-category granularity**: the first edit to anything in
a category clones that category's shipped defaults (`products` and `days`)
into `overrides[category]`; every subsequent edit in that category mutates
the clone. This is deliberately simpler than field-level diffing — the
routine data is a few KB even in full, so copying it is cheap, and it avoids
building/maintaining a diff-and-merge algorithm for a personal app with one
editor and no concurrent edits to reconcile.

One merge point resolves content everywhere it's read:

```ts
function getCategoryData(category): CategoryData {
  return overrides[category] ?? defaultRoutineData[category];
}
```

Every component that today would import `routine.ts` data directly instead
calls this (via `useAppState`), so the editor, the renderer, and progress
tracking's `resolveDay` all see the same edited-or-default content
consistently.

**New steps get a fresh `id`** (same `category.weekday.session.n` scheme as
the foundation data, extended with a counter/timestamp suffix to guarantee
uniqueness against future edits, e.g. `"face.mon.pm.new-<n>"`). **Edited
steps keep their existing `id`** even when product/note/variants change, so
`completedSteps` history in `AppState` (from progress tracking) never
silently detaches. **Removed steps** leave behind harmless orphaned entries
under old dates in `completedSteps` — they simply have nothing left to
render against and need no explicit cleanup for a personal, single-user
app.

## UI

- Each category section gains an **Edit toggle** (a pencil affordance near
  the hero) that switches that category's gallery and day panels into an
  editable form:
  - **Gallery**: each product becomes a text field (rename) with a remove
    control; an "add product" control appends a new entry.
  - **Day steps**: each step's product/note become editable text fields
    with a remove control; an "add step" control appends a new step to that
    day/session.
  - **Variants**: a step with more than one variant shows each branch as an
    editable row (condition selector: "always" / "from week ___ onward" /
    "alternates odd–even weeks", plus that branch's product/note); an "add
    variant" control adds a branch, converting a plain step into a
    conditional one on first use.
- Toggling Edit off returns to the normal read-only view (today's checklist
  UI from progress tracking is unaffected — editing and checking-off are
  separate modes, so you're never accidentally toggling a checkbox while
  trying to rename a product, or vice versa).
- A **"Reset to default"** action per category clears its `overrides` entry
  entirely, reverting to the shipped routine — a plain confirm-and-clear,
  no partial/selective revert.

## Error handling

No new failure modes beyond the foundation's: `overrides` is more data
riding the same `GET`/`PUT`/`localStorage`-fallback cycle already built.
The only new validation is client-side and cosmetic: a product/step name
can't be saved empty (falls back to a placeholder like "Untitled step"
rather than blocking the edit), and there's no server-side validation of
the shape beyond what the Worker already does for the top-level `AppState`
blob.

## Testing

- Unit tests for the copy-on-write merge (`getCategoryData` returns default
  when no override exists, returns the override once one exists, `overrides`
  stays independent per category).
- Unit tests for id assignment (new steps get unique fresh ids; editing a
  step's product/note preserves its id; adding a variant branch to a plain
  step preserves its id).
- Manual verification of the edit UI itself (add/rename/remove
  product/step/variant, reset-to-default) — this sub-project is mostly UI,
  where manual click-through is the more useful check than unit tests.

## Out of scope

- Changing categories, theming, or the icon-matching rules.
- Any multi-device conflict resolution — single user, single active editor,
  last write wins (already true of the foundation's `PUT /state`).
- Undo/redo beyond "Reset to default" per category.
