# Progress Tracking — Spec

Status: ready to plan, sub-project 2 of 5
Date: 2026-09-01
Design: [Progress tracking design](./2026-08-28-progress-tracking-design.md)

This spec resolves the implementation decisions the design left open, and
**revises the design in five deliberate ways** (agreed during the 2026-09-01
brainstorm). Where this spec and the 2026-08-28 design disagree, this spec
wins. Anything not mentioned here follows the design unchanged.

## Revisions to the 2026-08-28 design

1. **Step identity is positional, not an explicit `id`.** The design gave
   every step a stable string `id` in `routine.ts` and restructured steps
   into a `PlainStep | ConditionalStep` union. This spec keeps `routine.ts`
   as the literal ported `StepTuple[]` data it is today and identifies a
   step by `{ category, phase, stepIndex }` plus the calendar date of the
   routine day. Rationale: one real user, rare and deliberate content edits,
   and the no-cast constraint is easier to hold against a small flat shape.
   Trade-off accepted: reordering steps in `routine.ts` later would
   misalign existing completion entries for the affected day. A future
   sub-project can add ids if content editing (sub-project 3) makes
   reordering common.
2. **`completedSteps` is a flat array, not a nested date→category→id map.**
   See "Data model" below.
3. **Scope is trimmed to the weekly view.** Streak badge and the multi-week
   heatmap view are **deferred** to a later sub-project. The dated history
   is still recorded now (so that later view has data to draw), but the only
   new UI surface here is the week-progress strip.
4. **The app still opens on the persisted tab, not today's weekday.** The
   design's "open on today's actual weekday" is out of scope; `weekdayIndex()`
   stays unused by the app (as CLAUDE.md already states). The week strip
   marks today's column but does not change which tab is active on load.
5. **`AppState` gains a `version` bump and a `migrate()` seam.** The design
   did not address the already-seeded v1 blob in KV. This spec introduces
   versioning now because sub-projects 3–5 will keep extending `AppState`.

## Prerequisites

None. No manual setup, no new secrets, no `wrangler.toml` change. All work is
code plus the automatic KV blob upgrade performed by `GET /state` on first
deploy of this sub-project.

## Data model

### `src/shared/types.ts`

```ts
export type StepPhase = "am" | "pm" | "steps";

export type CompletedStep = {
  date: string;        // ISO date "YYYY-MM-DD" of the routine day the step belongs to
  category: Category;
  phase: StepPhase;
  stepIndex: number;   // index into the resolved day's am[] / pm[] / steps[]
};

export type AppState = {
  version: 2;                        // was: 1
  updatedAt: string;
  programStartDate: string;
  completedSteps: CompletedStep[];   // new; unordered, treated as a set; no cap
  ui: {
    activeCategory: Category;
    activeDayByCategory: Record<Category, number>;
  };
};
```

- Uniqueness of a `CompletedStep` is the tuple of all four fields. "Checked"
  means an equal entry is present; "uncheck" removes it.
- `date` is the date of the routine weekday within the program week the user
  is viewing — always the current Mon–Sun week in this sub-project, since no
  historic week is navigable. Computed as `weekdayDateIso(dayIndex, todayIso())`.
- No history cap. Worst case ~15 entries/day (face ~10, hair ~3, body ~2) →
  ~330 KB/year of JSON, far under Cloudflare KV's 25 MB per-value limit.
  Pruning is a later concern.

### `src/shared/defaults.ts`

`makeDefaultState()` returns `version: 2` and `completedSteps: []`.

### Validation and migration (`src/shared/types.ts`)

- `isCompletedStep(value: unknown): value is CompletedStep` — record with
  `date` a string, `category` passing `isCategory`, `phase` one of the three
  literals, `stepIndex` a number.
- `isAppState()` gains: `v.version === 2`, and `Array.isArray(v.completedSteps)
  && v.completedSteps.every(isCompletedStep)`. The single permitted
  `as Record<string, unknown>` line inside `isAppState` is unchanged; no new
  cast is introduced (add `isCompletedStep`'s own narrowing via `isRecord`).
- `migrate(value: unknown): AppState | null`:
  - `isAppState(value)` → return `value` (already v2).
  - Else if `value` matches the **v1 shape** (the current `isAppState` checks
    minus `version`/`completedSteps`, i.e. `version === 1` + the rest) →
    return `{ ...v1, version: 2, completedSteps: [] }`.
  - Else → `null`.
  - Implemented with a private `isV1State()` predicate beside `migrate` so
    the v1 shape is checked, not cast.

`migrate()` replaces the bare `isAppState()` call at two read sites
(`storage.readMirror`, `useRemoteState.fetchRemote`) and is added to the
Worker's `GET`. `isAppState()` remains the validator for the Worker's `PUT`
body (a client that just loaded through `migrate()` always sends v2).

## Date and week helpers (`src/shared/date.ts`)

Added, all pure; a date-only ISO string has an unambiguous weekday so these
need no `Intl` / timezone handling:

```ts
weekdayIndexOfIso(iso: string): number
  // 0 = Mon .. 6 = Sun. Via Date.UTC(y, m-1, d).getUTCDay(), remapped so Mon = 0.

mondayIsoOf(iso: string): string
  // iso shifted back by weekdayIndexOfIso(iso) days.

addDaysIso(iso: string, days: number): string
  // UTC-based; returns "YYYY-MM-DD".

programWeek(startIso: string, nowIso: string): number
  // Math.floor((mondayIsoOf(nowIso) - mondayIsoOf(startIso)) / 7 days) + 1, minimum 1.
  // Difference computed on Date.UTC millis of the two Monday strings.

weekCyclePosition(startIso: string, nowIso: string): 1 | 2 | 3 | 4
  // ((programWeek(startIso, nowIso) - 1) % 4) + 1

weekdayDateIso(dayIndex: number, nowIso: string): string
  // addDaysIso(mondayIsoOf(nowIso), dayIndex)
```

Existing `todayIso(now)` and `weekdayIndex(now)` are unchanged. App code
passes `todayIso()` as `nowIso`.

Edge cases fixed by spec:
- `nowIso` before `startIso` → `programWeek` returns `1` (clamped).
- `programStartDate` mid-week → week 1 is the Mon–Sun week *containing* the
  start date; the week number flips on Mondays.

## Week-conditional content (`src/shared/schedule.ts` — new)

```ts
export function resolveDay(
  category: Category,
  dayIndex: number,
  programWeek: number,
): DayData
```

- Returns the `routine[category].days[dayIndex]` entry unchanged for every
  case except the two overrides below. When no override applies it returns
  the exact same object reference (so `DayPanel` memoisation and identity
  checks stay cheap).
- Overrides are a small module-level table, face-only:

| Slot | Condition | Replacement `StepTuple` |
| --- | --- | --- |
| `faceDays[2]` (Thứ Tư) `am[2]` | `programWeek <= 2` | `["Serum Vitamin C — Cocoon Nghệ C22", "Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide"]` |
| `faceDays[6]` (Chủ Nhật) `pm[3]` | `weekCyclePosition ∈ {2, 4}` | `["Mặt nạ Histolab Natural White", "Mặt nạ tuần chẵn trong chu kỳ 4 tuần"]` |

- `resolveDay` takes `programWeek` (already 1-based); it derives cycle
  position internally as `((programWeek - 1) % 4) + 1` for the mask rule.
- Override application: shallow-clone the day, replace `am`/`pm` with a new
  array that swaps the one index. No mutation of the imported routine data.
- Both overrides are 1-for-1 swaps at a fixed index — neither changes an
  array's length — so `stepIndex` identity is stable across the week-1/2 ↔
  week-3 boundary and across the mask cycle.

### `src/shared/routine.ts` content changes (steady-state = week 3+)

Exactly two `StepTuple`s change; nothing else in `routine.ts` is touched.

- `faceDays[2].am[2]`
  from `["Serum Niacinamide 15% — Cocoon", "Hỗ trợ hàng rào da trước đêm tẩy da chết — áp dụng từ Tuần 3 (Tuần 1–2 vẫn dùng Vitamin C)"]`
  to   `["Serum Niacinamide 15% — Cocoon", "Hỗ trợ hàng rào da trước đêm tẩy da chết"]`
- `faceDays[6].pm[3]`
  from `["Mặt nạ luân phiên theo tuần", "Tuần 1&3: Histolab Peppermint · Tuần 2&4: Histolab Natural White"]`
  to   `["Mặt nạ Histolab Peppermint", "Mặt nạ tuần lẻ trong chu kỳ 4 tuần"]`

The `FaceExtras` note-box in `CategorySection.tsx` (the "🆕 Giai đoạn làm
quen (Tuần 1–2)" paragraph) is **left as-is** — it explains the rationale,
which the logic cannot convey.

`pickIcon()` must be re-checked for the two new product strings
("Serum Vitamin C — Cocoon Nghệ C22" already occurs elsewhere and is fine;
"Mặt nạ Histolab Peppermint" / "Mặt nạ Histolab Natural White" both start
with "Mặt nạ" and must land on the mask icon — confirm the branch, no new
branch expected).

## Progress helpers (`src/shared/progress.ts` — new, pure)

```ts
toggleCompletedStep(state: AppState, target: CompletedStep): AppState
  // Returns a new state with `target` removed if an equal entry exists, else added.
  // Does not touch updatedAt — the caller's update() stamps it.

isStepDone(state, category, dayIndex, phase, stepIndex, nowIso): boolean

phaseCompletion(state, category, dayIndex, phase, nowIso): { done: number; total: number }
  // total = length of the resolved day's am/pm/steps for that phase.

dayCompletion(state, category, dayIndex, nowIso): { done: number; total: number }
  // total = all steps of the resolved day (am + pm, or steps for hair).
```

All four call `resolveDay(...)` with `programWeek(state.programStartDate,
nowIso)` so counts and identity track the week's actual steps. `nowIso` is
always passed in (deterministic tests); app code passes `todayIso()`.

## Provider and persistence wiring

### `src/state/AppStateProvider.tsx`

Add to the context value:

```ts
toggleStep: (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void
```

Implementation:

```ts
toggleStep: (category, dayIndex, phase, stepIndex) =>
  update((prev) =>
    toggleCompletedStep(prev, {
      date: weekdayDateIso(dayIndex, todayIso()),
      category,
      phase,
      stepIndex,
    }),
  ),
```

`update()` already stamps `updatedAt`, writes the mirror, and schedules the
debounced `PUT`. No change to `useRemoteState`'s persistence effect.

### `src/state/useRemoteState.ts` and `src/state/storage.ts`

- `storage.readMirror`: `isAppState(parsed) ? parsed : null` →
  `migrate(parsed)`.
- `useRemoteState.fetchRemote`: `isAppState(body) ? { ok: true, state: body }
  : { ok: "invalid" }` → `const migrated = migrate(body); return migrated ?
  { ok: true, state: migrated } : { ok: "invalid" }`. Update the adjacent
  comment: a v1 body is now upgraded, not treated as invalid; only an
  unrecognisable body is `"invalid"`.
- `reconcile` is unchanged (whole-blob newest-wins by `updatedAt`).

## Worker (`worker/handlers.ts`)

`GET /state`, when `stored` is non-null:

```ts
const parsed: unknown = JSON.parse(stored);  // wrap in try/catch → treat as corrupt
const migrated = migrate(parsed);
if (!migrated) {
  // corrupt: fall through to seed + persist (existing behaviour, extracted)
} else {
  if (JSON.stringify(migrated) !== stored) {
    await env.STATE.put(STATE_KEY, JSON.stringify(migrated));
  }
  return json(migrated, 200, env);
}
```

`PUT /state` is unchanged: `isAppState()` now requires `version === 2`, so a
stray v1 body is a 400 (acceptable — every real client loads through
`migrate()` first).

Import `migrate` from `../src/shared/types`.

## Components

### `src/components/DayPanel.tsx`

- `Steps` gains a per-row control: a native `<input type="checkbox">` wrapped
  in a `<label>` (keeps keyboard + screen-reader behaviour for free), styled
  as a round tick. Props flow in: `category`, `dayIndex`, `phase`, and the
  `toggleStep` / `isStepDone` from `useAppState()`.
- `Card` renders a `done/total` count in `card-head` from `phaseCompletion`.
- `DayPanel`'s props become `{ category, dayIndex }` (was `{ day, category }`).
  It reads `state` from `useAppState()`, computes
  `programWeek(state.programStartDate, todayIso())`, and renders from
  `resolveDay(category, dayIndex, programWeek)`.
- Hair days: `phase = "steps"`, one card, one count.

### `src/components/WeekProgress.tsx` — new

- Props: `category`, `dayIndex` (active, to mark the current column),
  reads `state` from `useAppState()`.
- Renders `Tuần {programWeek(state.programStartDate, todayIso())}` and 7
  markers for `dayIndex` 0..6. Each marker's state from
  `dayCompletion(...)`: `done === 0` empty, `0 < done < total` partial,
  `done === total && total > 0` full. Today's real weekday
  (`weekdayIndex()`) gets a subtle dot; the active tab column is not
  specially marked here (DayTabs already shows that).
- Display-only. No click handlers.

### `src/components/CategorySection.tsx`

- Render `<WeekProgress category={category} dayIndex={activeDay} />` directly
  above `<DayTabs>`.
- Call `<DayPanel category={category} dayIndex={activeDay} />` (was
  `day={data.days[activeDay]}`). `CategorySection` stays thin — it does not
  compute `programWeek` or call `resolveDay` itself.
- `DayTabs.tsx` is unchanged (still fed `data.days` for the tab labels).

### `src/App.tsx`

No change required — `CategorySection` already receives `activeDay` +
`onSelectDay` and now pulls the rest from context.

## Styles (`src/styles.css`)

New rules, all colours via existing CSS variables (`--rose`, `--rose-deep`,
`--gold`, `--line`, `--muted`; `.card.pm` context for the PM tint). Nothing
hardcoded, so `.theme-yellow` / `.theme-almond` inherit correctly.

- `.step-check` — the round checkbox control; checked state fills with
  `--rose` (or the PM gradient under `.card.pm`).
- `ul.steps li` — adjust `gap` / alignment to seat the control before the
  icon badge.
- `.card-progress` — the `done/total` count in `card-head`.
- `.week-progress`, `.week-progress .marker` (+ `.is-partial`, `.is-full`,
  `.is-today`) — the strip.

## Definition of done

- `npm run test` green, including new suites for `date.ts` (week math),
  `schedule.ts` (`resolveDay`), `progress.ts`, `types.ts` (`isAppState` v2 +
  `migrate`), `storage.ts` (v1 mirror upgrade), `worker/handlers.test.ts`
  (GET upgrades + persists a v1 blob; GET re-seeds a corrupt blob; PUT
  rejects a v2 body with a malformed `completedSteps`).
- `npm run lint:constraints` green — no new `as` / `!` / `any` / `@ts-ignore`.
- `npm run typecheck` green on both tsconfigs.
- Manual: with `programStartDate` set so the app is in week 1, the Wednesday
  face AM serum reads "Serum Vitamin C — Cocoon Nghệ C22"; move the start
  date back three weeks and it reads Niacinamide. Sunday face PM mask
  alternates Peppermint / Natural White across four consecutive weeks.
- Manual: tick steps on a day → the per-card count and the week-strip marker
  update; reload → ticks persist; open in a second browser → same ticks
  (confirms the round-trip to KV, i.e. `completedSteps` rides the existing
  `PUT`).
- Manual: crossing from Sunday into Monday (or moving the system clock)
  empties the visible ticks while the previous week's entries remain in
  `state.completedSteps`.

## Explicitly out of scope

- Streak badge, multi-week heatmap / history view (data is recorded now;
  the view is a later sub-project).
- Navigating or editing past weeks.
- Opening on today's weekday tab instead of the persisted tab.
- Per-field merge in `reconcile` (whole-blob newest-wins keeps its current
  limitation: two devices toggling within the 500 ms debounce → last `PUT`
  wins).
- Pruning `completedSteps`.
- Editing routine content or the two variant rules from the UI →
  sub-project 3.
- Notifications built on `resolveDay` → sub-project 5.
