# Progress Tracking — Design

Status: approved, sub-project 2 of 5
Date: 2026-08-28
Depends on: [Foundation rebuild](./2026-08-28-foundation-rebuild-design.md)

## Goal

Let the user mark individual routine steps done each day, see streaks and a
completion history, and have the app automatically compute which
week-conditional variant of a step applies today — instead of relying on
manually-read text notes like today's "weeks 1–2 use Vitamin C, week 3+
switch to Niacinamide."

## Shared foundation: step-level variant rules

This piece is introduced here because progress tracking is what first needs
it (to know exactly which step is "today's" step to check off), but it's
shared by later sub-projects too — the editor (sub-project 3) builds UI on
top of it, and push notifications (sub-project 5) uses the same resolver to
build tonight's message.

### Data model: `routine.ts`

Every step gets an explicit, stable `id`, assigned once and never reused —
e.g. `"face.mon.pm.2"` (category, weekday, session, position at time of
creation). Ids stay fixed across future edits (sub-project 3) even if a
step's product/note changes, so historical completion data never silently
detaches from the wrong step.

A step is either plain or variant-based:

```ts
type PlainStep = { id: string; product: string; note?: string };

type Condition =
  | { type: "weekGte"; value: number }   // true from week `value` onward
  | { type: "weekParity"; value: "odd" | "even" };

type ConditionalStep = {
  id: string;
  variants: Array<{ condition?: Condition; product: string; note?: string }>;
  // variants are checked in order; the first with a matching condition wins;
  // a variant with no `condition` is the fallback and must be last.
};

type Step = PlainStep | ConditionalStep;
```

### Resolver

```ts
function resolveStep(step: Step, weekNumber: number): { id: string; product: string; note?: string } { ... }
function resolveDay(day: DayData, weekNumber: number): ResolvedDay { ... } // maps every step through resolveStep
```

Pure functions, no dependency on `AppState` beyond the `weekNumber` passed
in — easy to unit test directly against the two known real rules (the
Niacinamide/Vitamin C switch-over at week 3, the mask alternating by week
parity).

### Week number

```ts
weekNumber = Math.floor(daysBetween(programStartDate, todayIso) / 7) + 1
```

Computed from `AppState.programStartDate` (already in the foundation's data
model). Displayed as a small "Week N" label in each category's hero.

## Completion tracking

### Data model: `AppState` addition

```ts
completedSteps: {
  [isoDate: string]: {
    [category in "face" | "hair" | "body"]?: {
      [stepId: string]: true; // presence = done; absence = not done
    };
  };
};
```

Keyed by the step's stable `id` (not by weekday or array index), so it
survives edits to the underlying routine content. No cap on history — kept
"forever" per the earlier decision; a personal checklist's total data stays
in the tens of KB even after years of daily use, well within Cloudflare KV's
per-value limits.

### Derived values (computed client-side, never stored)

- **Today's checklist** — `resolveDay(day, weekNumber)` for today's weekday
  gives the concrete steps to render with checkboxes; each checkbox reflects
  `completedSteps[todayIso]?.[category]?.[stepId]`.
- **Streak** — walk backward day-by-day from today; a day "counts" if every
  step in that day's resolved list (for that category) is checked; the
  streak is the number of consecutive counting days including today (today
  before it's finished doesn't break a streak — it just isn't counted yet
  until you complete it, so the displayed streak is "as of the last fully
  completed day").
- **Heatmap / history view** — for the last N weeks (a fixed window, e.g. 8,
  chosen for UI size not data retention — the underlying data still keeps
  everything), per-day completion ratio (`checked / total` steps that day)
  drives a color intensity, one small view per category reachable from the
  hero.

## UI changes

- `DayPanel` steps each render as a checkbox row (was a plain list item);
  toggling writes/removes the `stepId` key under today's date in
  `AppState.completedSteps` through the existing `useAppState` /
  `useRemoteState` plumbing (same debounced `PUT`, same offline fallback —
  no new persistence code, no new failure modes).
- The hero for each category gains a small streak badge and a "Week N"
  label.
- A new lightweight heatmap view, opened from the hero, shows the last ~8
  weeks per category. This is the one genuinely new UI surface in this
  sub-project; everything else is additive to existing components.
- The app opens directly on today's actual weekday tab (derived from the
  real calendar date), rather than always defaulting to Monday as it does
  today — a natural side effect of now having real date awareness, independent
  of any notification mechanism.

## Error handling

No new failure modes beyond the foundation's: `completedSteps` is just more
data riding the same `GET`/`PUT` cycle, with the same `localStorage`
fallback when the Worker is unreachable.

## Testing

- Unit tests for `resolveStep`/`resolveDay` against the two real rules
  (week-3 threshold switch, odd/even mask alternation) plus edge cases
  (week 1 vs week 3 boundary, a step with no conditional variants at all).
- Unit tests for the streak calculation (empty history, broken streak,
  in-progress today, exactly-one-day streak).
- Manual check of the heatmap view rendering against a small seeded history.

## Out of scope

- Editing routine content or variant rules from the UI → sub-project 3
  (this sub-project only adds the data model + resolver those edits will
  target).
- Notifications built from `resolveDay` → sub-project 5.
