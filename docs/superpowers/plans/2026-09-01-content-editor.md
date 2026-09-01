# In-App Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the one user add / rename / remove products and steps, and add / remove week-conditional variant branches on a step, entirely from the phone UI — no editing `routine.ts` by hand.

**Architecture:** A step becomes a union (`RoutineStep`) of a plain `[product, note]` tuple plus two conditional forms (`threshold`, `cycle`). Content is resolved through one new seam, `src/shared/content.ts`, which merges per-category copy-on-write overrides stored on `AppState` over the shipped `routine.ts` defaults and resolves each step for the current program week. `AppState` goes to `version: 3`: `completedSteps` is re-keyed from a positional `phase`+`stepIndex` to a stable `stepId`, `overrides?` and `stepSeq?` are added, and `migrate()` gains a v2→v3 arm that remaps existing check-offs. The editor is an inline per-category pencil toggle; step rows expand on tap to product / note / variant fields.

**Tech Stack:** React 18, Vite 5, TypeScript strict, Vitest + @testing-library/react (jsdom), Cloudflare Worker + KV (unchanged this sub-project).

**Spec:** `docs/superpowers/specs/2026-09-01-content-editor-spec.md`

## Global Constraints

- **Port, not redesign.** Every Vietnamese routine string is a product the user owns. This sub-project changes how content is stored and edited, never regenerates or paraphrases content. The two `faceDays` entries re-authored as conditionals keep their exact existing strings, copied verbatim from the current source.
- **No new dependencies.** Nothing added to `package.json`.
- **No `as` casts, no `any`, no `@ts-ignore` / `@ts-nocheck`, no non-null `!`** anywhere in `src/` or `worker/`, tests included. Narrow untrusted data with type predicates. `npm run lint:constraints` enforces this and runs first in `npm run test`. The one allowed exception line is the existing `as Record<string, unknown>` inside `isAppState`; do not add a second.
- **TypeScript `strict: true`.** `npm run build` runs `typecheck` on both `tsconfig.json` and `tsconfig.worker.json` and fails on any error.
- **Timezone.** All date arithmetic stays pinned to `Asia/Ho_Chi_Minh` via `src/shared/date.ts` helpers. No bare `new Date().getDay()` / `.getDate()` etc. Use `weekdayIndexOfIso` for weekday-from-date-string.
- **`src/shared/` is imported by both the frontend and the Worker.** Types, guards, routine content, and date helpers both need live there and are never duplicated.
- **Node 20** (`.nvmrc`; CI's only version). Local toolchain note: an official self-contained Node 20 is installed at `~/.local/node20`; prefix commands with `export PATH="$HOME/.local/node20/bin:$PATH"` if the system `node` is broken.
- **Commit per task.** TDD: write the failing test first, watch it fail, implement, watch it pass, commit.
- **Vietnamese UI copy** for every user-facing string (labels, placeholders, confirm dialogs).

## Test / build commands

```
export PATH="$HOME/.local/node20/bin:$PATH"   # only if system node is broken
npm run test                 # constraint gate + full vitest run (frontend + worker)
npx vitest run <path>        # a single file
npm run typecheck            # tsc --noEmit on both tsconfigs
npm run build                # typecheck then vite build
npm run lint:constraints     # the no-cast/no-!/no-any grep gate alone
```

---

## File Structure

| File | Responsibility | This plan |
|---|---|---|
| `src/shared/types.ts` | `AppState` shape + every guard both deployables share | `RoutineStep` union + variant types + guards; `StoredStep` / `StoredDay` / `CategoryOverride`; `AppState` v3; `isAppState`/`isCompletedStep` v3; frozen `isV2State`; `migrate` v2→v3 arm |
| `src/shared/routine.ts` | The shipped routine content (ported data) | `faceDays[2].am[2]` and `faceDays[6].pm[3]` authored as `ConditionalStep`s; day arrays widen to `RoutineStep[]` |
| `src/shared/schedule.ts` | Resolve one step for a program week | delete the two constants + `withStep` + `resolveDay`; export only `resolveStep(step, week)` |
| `src/shared/content.ts` | **new** — the single content read seam + pure edit helpers | `getCategoryData`, `resolveDayForState` (+ `ResolvedStep`/`ResolvedDay`), id derivation, `ensureOverride`, 8 mutation helpers |
| `src/shared/progress.ts` | Check-off math | re-keyed off `stepId`; imports `resolveDayForState`; takes `state` |
| `src/shared/defaults.ts` | `makeDefaultState()` | `version: 3` |
| `src/state/AppStateProvider.tsx` | The one context components use | `toggleStep(category, dayIndex, stepId)`; new `editContent(mutate)` |
| `src/App.tsx` | Top-level layout | pass `state` (whole) + `editContent` to `CategorySection` |
| `src/components/CategorySection.tsx` | Per-category hero + gallery + tabs + panel | `state` prop; `editing` `useState`; pencil toggle; reset-to-default; thread `editing` + `onEdit` bundles down |
| `src/components/DayPanel.tsx` | The active day's cards | `state` prop; render via `ResolvedStep`; edit mode → `StepEditor` rows |
| `src/components/WeekProgress.tsx` | The week completion strip | `state` prop; hidden by parent in edit mode |
| `src/components/Gallery.tsx` | The product gallery | `editing` prop + `onEdit` bundle |
| `src/components/StepEditor.tsx` | **new** — one editable step row (expand on tap) | product / note inputs, variant selector, remove |
| `src/components/VariantEditor.tsx` | **new** — threshold / cycle branch editors | builds the next `RoutineStep`, kind + length switching |
| `CLAUDE.md` | Repo guidance | document `overrides` / `stepSeq` / v3 migration / `content.ts` seam / editor scope; drop the positional-identity trade-off paragraph |

**Task dependency order:** 1 → 2 → 3 → 4 → 5 → 6 (read-mode parity checkpoint — the app works exactly as before, just re-plumbed) → 7 → 8 → 9 → 10 (editor live) → 11 (docs + verification). 11 tasks.

**Commit units.** Most tasks commit on their own. The exception is the v3 cutover: **Tasks 3, 4, 5 and 6 are one commit unit.** Changing `CompletedStep` from `{ phase, stepIndex }` to `{ stepId }` (Task 3) breaks `progress.ts` (Task 5) and every component that calls it (Task 6), and `progress.ts` needs `content.ts` (Task 4) — none of these compile in isolation. Do Tasks 3→6 back to back, run the full gate once at the end of Task 6, and make **one commit** there (Task 6 Step 8). Tasks 3, 4 and 5 each still end with "run the file's own tests" so a reviewer can see each layer land, but there is no green tree — and no commit — until Task 6. A subagent-driven executor should treat 3–6 as a single dispatch or a tightly-coupled chain, not four independently-gated tasks.

---

## Task 1: `RoutineStep` union types and guards

Pure additions to `types.ts`. No behavior changes anywhere; `routine.ts` still holds tuples. Deliverable: the variant vocabulary the rest of the plan builds on.

**Files:**
- Modify: `src/shared/types.ts` (add after the `StepTuple` type, before `StepPhase`)
- Test: `src/shared/types.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: existing `StepTuple = [product: string, note: string]`.
- Produces:
  - `type ThresholdVariant = { kind: "threshold"; untilWeek: number; before: StepTuple; from: StepTuple }`
  - `type CycleVariant = { kind: "cycle"; length: 2 | 4; weeks: StepTuple[] }`
  - `type ConditionalStep = ThresholdVariant | CycleVariant`
  - `type RoutineStep = StepTuple | ConditionalStep`
  - `isStepTuple(v: unknown): v is StepTuple`
  - `isThresholdVariant(v: unknown): v is ThresholdVariant`
  - `isCycleVariant(v: unknown): v is CycleVariant`
  - `isConditionalStep(v: unknown): v is ConditionalStep`
  - `isRoutineStep(v: unknown): v is RoutineStep`

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/types.test.ts`:

```ts
import {
  isStepTuple, isThresholdVariant, isCycleVariant, isConditionalStep, isRoutineStep,
} from "./types";

describe("RoutineStep guards", () => {
  const tuple = ["Serum", "note"];
  const threshold = { kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""] };
  const cycle2 = { kind: "cycle", length: 2, weeks: [["A", ""], ["B", ""]] };
  const cycle4 = { kind: "cycle", length: 4, weeks: [["A", ""], ["B", ""], ["C", ""], ["D", ""]] };

  it("isStepTuple accepts a 2-string array, rejects everything else", () => {
    expect(isStepTuple(tuple)).toBe(true);
    expect(isStepTuple(["A"])).toBe(false);
    expect(isStepTuple(["A", 1])).toBe(false);
    expect(isStepTuple(["A", "", ""])).toBe(false);
    expect(isStepTuple({})).toBe(false);
    expect(isStepTuple(threshold)).toBe(false);
  });

  it("isThresholdVariant checks shape, not the untilWeek >= 1 rule (that is UI coercion)", () => {
    expect(isThresholdVariant(threshold)).toBe(true);
    expect(isThresholdVariant({ ...threshold, untilWeek: 0 })).toBe(true);
    expect(isThresholdVariant({ ...threshold, untilWeek: "2" })).toBe(false);
    expect(isThresholdVariant({ ...threshold, before: ["A"] })).toBe(false);
    expect(isThresholdVariant({ kind: "threshold" })).toBe(false);
  });

  it("isCycleVariant requires weeks.length === length and length in {2,4}", () => {
    expect(isCycleVariant(cycle2)).toBe(true);
    expect(isCycleVariant(cycle4)).toBe(true);
    expect(isCycleVariant({ ...cycle2, length: 3 })).toBe(false);
    expect(isCycleVariant({ ...cycle2, weeks: [["A", ""]] })).toBe(false); // length mismatch
    expect(isCycleVariant({ ...cycle2, weeks: [["A", ""], ["B", 1]] })).toBe(false);
  });

  it("isConditionalStep / isRoutineStep compose the above", () => {
    expect(isConditionalStep(threshold)).toBe(true);
    expect(isConditionalStep(cycle4)).toBe(true);
    expect(isConditionalStep(tuple)).toBe(false);
    expect(isRoutineStep(tuple)).toBe(true);
    expect(isRoutineStep(threshold)).toBe(true);
    expect(isRoutineStep({ kind: "weird" })).toBe(false);
    expect(isRoutineStep(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/types.test.ts`
Expected: FAIL — `isStepTuple` (and the others) are not exported.

- [ ] **Step 3: Implement the types and guards**

In `src/shared/types.ts`, after `export type StepTuple = [product: string, note: string];`:

```ts
export type ThresholdVariant = {
  kind: "threshold";
  /** `before` applies to program-weeks 1..untilWeek; `from` applies from untilWeek+1 on. */
  untilWeek: number;
  before: StepTuple;
  from: StepTuple;
};

export type CycleVariant = {
  kind: "cycle";
  /** Cycle length in weeks. Only 2 and 4 are offered in the editor. */
  length: 2 | 4;
  /** Exactly `length` entries; selected by `(week - 1) % length`. */
  weeks: StepTuple[];
};

export type ConditionalStep = ThresholdVariant | CycleVariant;

/** A step as authored: a plain [product, note] or a week-conditional step. */
export type RoutineStep = StepTuple | ConditionalStep;

export function isStepTuple(value: unknown): value is StepTuple {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
  );
}

export function isThresholdVariant(value: unknown): value is ThresholdVariant {
  if (!isRecord(value)) return false;
  return (
    value.kind === "threshold" &&
    typeof value.untilWeek === "number" &&
    isStepTuple(value.before) &&
    isStepTuple(value.from)
  );
}

export function isCycleVariant(value: unknown): value is CycleVariant {
  if (!isRecord(value)) return false;
  if (value.kind !== "cycle") return false;
  if (value.length !== 2 && value.length !== 4) return false;
  return (
    Array.isArray(value.weeks) &&
    value.weeks.length === value.length &&
    value.weeks.every(isStepTuple)
  );
}

export function isConditionalStep(value: unknown): value is ConditionalStep {
  return isThresholdVariant(value) || isCycleVariant(value);
}

export function isRoutineStep(value: unknown): value is RoutineStep {
  return isStepTuple(value) || isConditionalStep(value);
}
```

`isRecord` already exists in this file (used by `isAppState`). These guards must be declared after it — put them below the existing `isRecord` definition, or move `isRecord` up if ordering fights you (it is a plain `function` declaration so hoisting covers it either way).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/types.test.ts`
Expected: PASS (all prior tests in the file still pass too).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat(types): RoutineStep union (threshold + cycle variants) and guards"
```

---

## Task 2: `resolveStep` and the two authored conditionals

Add `resolveStep(step, week)` to `schedule.ts`, author `faceDays[2].am[2]` and `faceDays[6].pm[3]` as conditionals in `routine.ts`, and rewrite the existing `resolveDay` to map every step through `resolveStep` (deleting the two hardcoded `StepTuple` constants and `withStep`). `resolveDay` stays in `schedule.ts` for now — Task 4 moves its role to `content.ts`.

**Files:**
- Modify: `src/shared/routine.ts` (line 13 — `faceDays[2].am[2]`; line 26 — `faceDays[6].pm[3]`)
- Modify: `src/shared/schedule.ts` (whole file)
- Test: `src/shared/schedule.test.ts` (add `resolveStep` cases; keep `resolveDay` cases, adjusting the "exact object identity" ones)
- Test: `src/shared/routine.test.ts` (the two "steady-state at that position" tests and the "every step is a [product, note] pair" test now need to allow conditionals)

**Interfaces:**
- Consumes: `RoutineStep`, `isStepTuple`, `isThresholdVariant`, `isCycleVariant` from Task 1; `routine` from `routine.ts`.
- Produces:
  - `resolveStep(step: RoutineStep, week: number): StepTuple` — plain tuple returned by reference; `threshold` → `week <= untilWeek ? before : from`; `cycle` → `weeks[(week - 1) % length]`.
  - `resolveDay(category: Category, dayIndex: number, week: number): DayData` — unchanged signature and return type; every step resolved via `resolveStep`. (Removed in Task 4.)

- [ ] **Step 1: Widen the day array element types**

In `src/shared/types.ts`, change `FaceOrBodyDay` and `HairDay` step arrays from `StepTuple[]` to `RoutineStep[]`:

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

`isHairDay` (`"steps" in day`) and `CategoryData` (`{ products: string[]; days: DayData[] }`) are unchanged.

- [ ] **Step 2: Write the failing tests**

Replace `src/shared/schedule.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { faceDays } from "./routine";
import { resolveStep } from "./schedule";

const before: [string, string] = ["Serum Vitamin C — Cocoon Nghệ C22", "weeks 1-2"];
const from: [string, string] = ["Serum Niacinamide 15% — Cocoon", "week 3+"];
const threshold = { kind: "threshold" as const, untilWeek: 2, before, from };

const odd: [string, string] = ["Mặt nạ Histolab Peppermint", "odd"];
const even: [string, string] = ["Mặt nạ Histolab Natural White", "even"];
const cycle2 = { kind: "cycle" as const, length: 2 as const, weeks: [odd, even] };
const cycle4 = {
  kind: "cycle" as const,
  length: 4 as const,
  weeks: [["w1", ""], ["w2", ""], ["w3", ""], ["w4", ""]] as [string, string][],
};

describe("resolveStep", () => {
  it("returns a plain tuple by reference, any week", () => {
    const plain: [string, string] = ["Toner Cocoon Sen", ""];
    expect(resolveStep(plain, 1)).toBe(plain);
    expect(resolveStep(plain, 9)).toBe(plain);
  });

  it("threshold: before through untilWeek, from after", () => {
    expect(resolveStep(threshold, 1)).toBe(before);
    expect(resolveStep(threshold, 2)).toBe(before);
    expect(resolveStep(threshold, 3)).toBe(from);
    expect(resolveStep(threshold, 12)).toBe(from);
  });

  it("cycle length 2: weeks 1,3,5 -> weeks[0]; weeks 2,4 -> weeks[1]", () => {
    expect(resolveStep(cycle2, 1)).toBe(odd);
    expect(resolveStep(cycle2, 2)).toBe(even);
    expect(resolveStep(cycle2, 3)).toBe(odd);
    expect(resolveStep(cycle2, 4)).toBe(even);
    expect(resolveStep(cycle2, 5)).toBe(odd);
  });

  it("cycle length 4: weeks 1..5 -> weeks[0,1,2,3,0]", () => {
    expect(resolveStep(cycle4, 1)).toBe(cycle4.weeks[0]);
    expect(resolveStep(cycle4, 4)).toBe(cycle4.weeks[3]);
    expect(resolveStep(cycle4, 5)).toBe(cycle4.weeks[0]);
  });
});

describe("the two authored routine conditionals", () => {
  it("Wednesday AM serum: Vitamin C weeks 1-2, Niacinamide week 3+", () => {
    const step = faceDays[2].am[2];
    expect(resolveStep(step, 1)[0]).toBe("Serum Vitamin C — Cocoon Nghệ C22");
    expect(resolveStep(step, 2)[1]).toContain("Tuần 1–2");
    expect(resolveStep(step, 3)[0]).toBe("Serum Niacinamide 15% — Cocoon");
  });

  it("Sunday PM mask: Peppermint weeks 1 & 3, Natural White weeks 2 & 4", () => {
    const step = faceDays[6].pm[3];
    expect(resolveStep(step, 1)[0]).toBe("Mặt nạ Histolab Peppermint");
    expect(resolveStep(step, 3)[0]).toBe("Mặt nạ Histolab Peppermint");
    expect(resolveStep(step, 2)[0]).toBe("Mặt nạ Histolab Natural White");
    expect(resolveStep(step, 4)[0]).toBe("Mặt nạ Histolab Natural White");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/shared/schedule.test.ts`
Expected: FAIL — `resolveStep` is not exported; `faceDays[2].am[2]` is still a tuple, so `resolveStep(step, 3)` would not switch.

- [ ] **Step 4: Author the two conditionals in `routine.ts`**

`src/shared/routine.ts` line 13 — replace the third AM entry of the `T4` (Wednesday) face day. It currently reads:

```ts
["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm tẩy da chết"]
```

Replace with:

```ts
{kind:"threshold",untilWeek:2,
 before:["Serum Vitamin C — Cocoon Nghệ C22","Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide"],
 from:["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm tẩy da chết"]}
```

`src/shared/routine.ts` line 26 — replace the fourth PM entry of the `CN` (Sunday) face day. It currently reads:

```ts
["Mặt nạ Histolab Peppermint","Mặt nạ tuần lẻ trong chu kỳ 4 tuần"]
```

Replace with:

```ts
{kind:"cycle",length:2,
 weeks:[["Mặt nạ Histolab Peppermint","Mặt nạ tuần lẻ trong chu kỳ 4 tuần"],
        ["Mặt nạ Histolab Natural White","Mặt nạ tuần chẵn trong chu kỳ 4 tuần"]]}
```

Every string above is copied verbatim from the current `routine.ts` (the `from` / `weeks[0]` branches) and `schedule.ts` (the `before` / `weeks[1]` branches). Do not retype them — copy.

- [ ] **Step 5: Rewrite `schedule.ts`**

Replace the whole file with:

```ts
import { routine } from "./routine";
import {
  isStepTuple, isThresholdVariant,
  type Category, type DayData, type RoutineStep, type StepTuple,
} from "./types";

/**
 * A RoutineStep resolved to the concrete [product, note] for `week` (1-based,
 * from programWeek()). A plain tuple is returned by reference; a threshold
 * switches at untilWeek; a cycle indexes weeks by (week - 1) % length.
 */
export function resolveStep(step: RoutineStep, week: number): StepTuple {
  if (isStepTuple(step)) return step;
  if (isThresholdVariant(step)) return week <= step.untilWeek ? step.before : step.from;
  return step.weeks[(week - 1) % step.length];
}

/**
 * The routine day for (category, dayIndex) with every step resolved for `week`.
 * TEMPORARY: superseded by content.ts#resolveDayForState (which also applies
 * user overrides) — kept only until progress.ts and the components move over.
 */
export function resolveDay(category: Category, dayIndex: number, week: number): DayData {
  const day = routine[category].days[dayIndex];
  if ("steps" in day) {
    return { ...day, steps: day.steps.map((s) => resolveStep(s, week)) };
  }
  return {
    ...day,
    am: day.am.map((s) => resolveStep(s, week)),
    pm: day.pm.map((s) => resolveStep(s, week)),
  };
}
```

Note `resolveDay` now always returns a fresh object (it maps the arrays), so the old `schedule.test.ts` assertions that `resolveDay(...) === routine.face.days[0]` are gone by design — the replacement test file above does not include them, and `content.test.ts` in Task 4 asserts identity at the `ResolvedStep` level instead.

- [ ] **Step 6: Fix `routine.test.ts`**

In `src/shared/routine.test.ts`:

- The `"keeps every step as a [product, note] pair"` test: change the inner loop to allow conditionals. Replace the `for (const step of steps)` body with:

```ts
for (const step of steps) {
  const tuples = Array.isArray(step) ? [step] : "weeks" in step ? step.weeks : [step.before, step.from];
  for (const t of tuples) {
    expect(t).toHaveLength(2);
    expect(typeof t[0]).toBe("string");
    expect(typeof t[1]).toBe("string");
    expect(t[0].length).toBeGreaterThan(0);
  }
}
```

- The `"keeps Wednesday morning on the steady-state Niacinamide serum"` test: `routine.face.days[2].am[2]` is now a `threshold`. Replace its body with:

```ts
const wednesday = routine.face.days[2];
if (isHairDay(wednesday)) throw new Error("expected a face day");
const step = wednesday.am[2];
if (Array.isArray(step) || step.kind !== "threshold") throw new Error("expected a threshold step");
expect(step.from[0]).toBe("Serum Niacinamide 15% — Cocoon");
expect(step.before[0]).toBe("Serum Vitamin C — Cocoon Nghệ C22");
```

- The `"keeps Sunday evening on the odd-week mask"` test: `routine.face.days[6].pm[3]` is now a `cycle`. Replace its body with:

```ts
const sunday = routine.face.days[6];
if (isHairDay(sunday)) throw new Error("expected a face day");
const step = sunday.pm[3];
if (Array.isArray(step) || step.kind !== "cycle") throw new Error("expected a cycle step");
expect(step.weeks[0][0]).toBe("Mặt nạ Histolab Peppermint");
expect(step.weeks[1][0]).toBe("Mặt nạ Histolab Natural White");
```

- [ ] **Step 7: Run the full suite**

Run: `npm run test`
Expected: PASS. Watch for other consumers of `resolveDay` — `src/shared/progress.ts` and `src/components/DayPanel.tsx` still import it; its signature and return type are unchanged, so they keep compiling. `DayPanel.test.tsx` still passes (the resolved output for the Wednesday/Sunday cases is the same product strings it already asserts).

- [ ] **Step 8: Commit**

```bash
git add src/shared/routine.ts src/shared/schedule.ts src/shared/types.ts src/shared/schedule.test.ts src/shared/routine.test.ts
git commit -m "feat(schedule): resolveStep over RoutineStep; author the two week-conditional face steps as data"
```

---

## Task 3: `AppState` v3 — overrides, stepSeq, stepId-keyed completedSteps, migration

The schema task. `CompletedStep` changes from `{ date, category, phase, stepIndex }` to `{ date, category, stepId }`. `AppState` adds `overrides?` and `stepSeq?` and becomes `version: 3`. `isAppState` / `isCompletedStep` validate v3. A frozen `isV2State` snapshot is added. `migrate` gains a v2→v3 arm that maps every old positional entry to a derived `stepId`.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/defaults.ts` (`version: 3`)
- Modify: `src/shared/date.ts` — nothing; `weekdayIndexOfIso` already exists (line 33)
- Test: `src/shared/types.test.ts` (rewrite the `isCompletedStep` / `isAppState` / `migrate` blocks)
- Test: `worker/handlers.test.ts` — check whether its fixtures build a v2 blob by hand (grep for `version: 2` / `phase:`); if so, update them to v3 in this task

**Interfaces:**
- Consumes: `RoutineStep` / `isRoutineStep` (Task 1); `weekdayIndexOfIso(iso: string): number` from `date.ts`.
- Produces:
  - `type StoredStep = { id: string; step: RoutineStep }`
  - `type StoredFaceOrBodyDay = { short: string; full: string; focus: string; am: StoredStep[]; pm: StoredStep[] }`
  - `type StoredHairDay = { short: string; full: string; type: string; steps: StoredStep[] }`
  - `type StoredDay = StoredFaceOrBodyDay | StoredHairDay`
  - `type CategoryOverride = { products: string[]; days: StoredDay[] }`
  - `type CompletedStep = { date: string; category: Category; stepId: string }` (**replaces** the v2 shape)
  - `type AppState = { version: 3; updatedAt: string; programStartDate: string; completedSteps: CompletedStep[]; overrides?: { face?: CategoryOverride; hair?: CategoryOverride; body?: CategoryOverride }; stepSeq?: number; ui: {...} }`
  - `isStoredStep(v): v is StoredStep`, `isStoredDay(v): v is StoredDay`, `isCategoryOverride(v): v is CategoryOverride`
  - `isCompletedStep(v): v is CompletedStep` — v3 shape
  - `isAppState(v): v is AppState` — v3
  - `migrate(v: unknown): AppState | null` — v3 target, v2→v3 and v1→v3 arms
  - `StepPhase` and `isStepPhase` stay exported and unchanged (still used to name the three step lists and scope `phaseCompletion`).

- [ ] **Step 1: Write the failing tests**

Rewrite the `isCompletedStep`, `isAppState`, and `migrate` `describe` blocks in `src/shared/types.test.ts` (keep the Task 1 `RoutineStep guards` block). Note `makeDefaultState` now returns v3, so `const v3 = makeDefaultState(new Date("2026-08-24T00:00:00Z"))`.

```ts
import { makeDefaultState } from "./defaults";
import { isAppState, isCompletedStep, isCategoryOverride, migrate } from "./types";

const v3 = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

const goodOverride = {
  products: ["A", "B"],
  days: Array.from({ length: 7 }, (_, i) => ({
    short: "T2", full: "Thứ Hai", focus: "x",
    am: [{ id: `face.${i}.am.0`, step: ["P", ""] }],
    pm: [{ id: `face.${i}.pm.0`, step: ["Q", ""] }],
  })),
};

describe("isCompletedStep (v3)", () => {
  it("accepts a well-formed entry", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face", stepId: "face.2.am.0" })).toBe(true);
  });
  it("rejects a missing stepId, a bad category, a non-string date", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face" })).toBe(false);
    expect(isCompletedStep({ date: "2026-09-02", category: "nails", stepId: "x" })).toBe(false);
    expect(isCompletedStep({ date: 20260902, category: "face", stepId: "x" })).toBe(false);
    expect(isCompletedStep(null)).toBe(false);
  });
});

describe("isCategoryOverride", () => {
  it("accepts a well-formed override", () => {
    expect(isCategoryOverride(goodOverride)).toBe(true);
  });
  it("rejects wrong day count, a step missing id, a non-RoutineStep step", () => {
    expect(isCategoryOverride({ ...goodOverride, days: goodOverride.days.slice(0, 6) })).toBe(false);
    const noId = structuredClone(goodOverride);
    delete noId.days[0].am[0].id;
    expect(isCategoryOverride(noId)).toBe(false);
    const badStep = structuredClone(goodOverride);
    badStep.days[0].am[0].step = ["only-one"];
    expect(isCategoryOverride(badStep)).toBe(false);
  });
});

describe("isAppState (v3)", () => {
  it("accepts a default state and one with a valid override", () => {
    expect(isAppState(v3)).toBe(true);
    expect(isAppState({ ...v3, overrides: { face: goodOverride }, stepSeq: 3 })).toBe(true);
  });
  it("rejects a v2-shaped blob", () => {
    const v2 = {
      version: 2, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate,
      completedSteps: [], ui: v3.ui,
    };
    expect(isAppState(v2)).toBe(false);
  });
  it("rejects a malformed overrides and a non-number stepSeq", () => {
    expect(isAppState({ ...v3, overrides: { face: { products: [] } } })).toBe(false);
    expect(isAppState({ ...v3, overrides: [] })).toBe(false);
    expect(isAppState({ ...v3, stepSeq: "3" })).toBe(false);
  });
  it("rejects a bad completedSteps element", () => {
    expect(isAppState({ ...v3, completedSteps: [{ date: "x", category: "face" }] })).toBe(false);
  });
});

describe("migrate to v3", () => {
  it("passes a valid v3 state through unchanged", () => {
    expect(migrate(v3)).toEqual(v3);
  });

  it("remaps a v2 completedSteps entry to a derived stepId by weekday", () => {
    const v2 = {
      version: 2, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate,
      completedSteps: [
        { date: "2026-08-24", category: "face", phase: "am", stepIndex: 2 }, // a Monday
        { date: "2026-08-30", category: "hair", phase: "steps", stepIndex: 0 }, // a Sunday
      ],
      ui: v3.ui,
    };
    const out = migrate(v2);
    expect(out?.version).toBe(3);
    expect(out?.completedSteps).toEqual([
      { date: "2026-08-24", category: "face", stepId: "face.0.am.2" },
      { date: "2026-08-30", category: "hair", stepId: "hair.6.steps.0" },
    ]);
    expect(out?.overrides).toBeUndefined();
    expect(out?.stepSeq).toBeUndefined();
  });

  it("chains a v1 blob to v3 with an empty completedSteps", () => {
    const v1 = { version: 1, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate, ui: v3.ui };
    expect(migrate(v1)).toEqual({
      version: 3, updatedAt: v3.updatedAt, programStartDate: v3.programStartDate,
      completedSteps: [], ui: v3.ui,
    });
  });

  it("returns null for junk", () => {
    expect(migrate({ hello: "world" })).toBeNull();
    expect(migrate({ version: 2 })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/types.test.ts`
Expected: FAIL — `isCategoryOverride` not exported; `isAppState` still accepts v2; `migrate` still targets v2.

- [ ] **Step 3: Implement the v3 types and guards in `types.ts`**

Replace the `CompletedStep` type and add the stored-content types (put these near `CategoryData`):

```ts
export type CompletedStep = {
  date: string; // ISO date of the routine day this step belongs to
  category: Category;
  stepId: string;
};

export type StoredStep = { id: string; step: RoutineStep };

export type StoredFaceOrBodyDay = {
  short: string; full: string; focus: string;
  am: StoredStep[]; pm: StoredStep[];
};
export type StoredHairDay = {
  short: string; full: string; type: string;
  steps: StoredStep[];
};
export type StoredDay = StoredFaceOrBodyDay | StoredHairDay;

export type CategoryOverride = {
  products: string[];
  days: StoredDay[];
};
```

Update `AppState`:

```ts
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

Rewrite `isCompletedStep`:

```ts
export function isCompletedStep(value: unknown): value is CompletedStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    isCategory(value.category) &&
    typeof value.stepId === "string"
  );
}
```

Add the stored-content guards:

```ts
export function isStoredStep(value: unknown): value is StoredStep {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && isRoutineStep(value.step);
}

function isStoredDay(value: unknown): value is StoredDay {
  if (!isRecord(value)) return false;
  if (typeof value.short !== "string" || typeof value.full !== "string") return false;
  if ("steps" in value) {
    return (
      typeof value.type === "string" &&
      Array.isArray(value.steps) &&
      value.steps.every(isStoredStep)
    );
  }
  return (
    typeof value.focus === "string" &&
    Array.isArray(value.am) && value.am.every(isStoredStep) &&
    Array.isArray(value.pm) && value.pm.every(isStoredStep)
  );
}

export function isCategoryOverride(value: unknown): value is CategoryOverride {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.products) &&
    value.products.every((p) => typeof p === "string") &&
    Array.isArray(value.days) &&
    value.days.length === 7 &&
    value.days.every(isStoredDay)
  );
}

function isOverrides(value: unknown): value is AppState["overrides"] {
  if (!isRecord(value)) return false;
  for (const key of CATEGORIES) {
    if (key in value && !isCategoryOverride(value[key])) return false;
  }
  return true;
}
```

Update `isAppState` (keep the single allowed `as Record<string, unknown>` line as-is):

```ts
export function isAppState(value: unknown): value is AppState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 3 &&
    typeof v.updatedAt === "string" &&
    typeof v.programStartDate === "string" &&
    Array.isArray(v.completedSteps) &&
    v.completedSteps.every(isCompletedStep) &&
    (v.overrides === undefined || isOverrides(v.overrides)) &&
    (v.stepSeq === undefined || typeof v.stepSeq === "number") &&
    isRecord(v.ui) &&
    isCategory(v.ui.activeCategory) &&
    isActiveDayByCategory(v.ui.activeDayByCategory)
  );
}
```

- [ ] **Step 4: Add the frozen `isV2State` snapshot and the v3 `migrate` arm**

Keep `isV1State` exactly as it is. Add a **new** frozen snapshot of the pre-v3 v2 shape — do not have it reference the current `isCompletedStep` (that is now v3):

```ts
type V2CompletedStep = {
  date: string; category: Category; phase: "am" | "pm" | "steps"; stepIndex: number;
};
type V2State = {
  version: 2;
  updatedAt: string;
  programStartDate: string;
  completedSteps: V2CompletedStep[];
  ui: { activeCategory: Category; activeDayByCategory: Record<Category, number> };
};

/** Frozen snapshot of the v2 shape. Must NOT track future isAppState changes. */
function isV2CompletedStep(value: unknown): value is V2CompletedStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    isCategory(value.category) &&
    (value.phase === "am" || value.phase === "pm" || value.phase === "steps") &&
    typeof value.stepIndex === "number"
  );
}
function isV2State(value: unknown): value is V2State {
  if (!isRecord(value)) return false;
  return (
    value.version === 2 &&
    typeof value.updatedAt === "string" &&
    typeof value.programStartDate === "string" &&
    Array.isArray(value.completedSteps) &&
    value.completedSteps.every(isV2CompletedStep) &&
    isRecord(value.ui) &&
    isCategory(value.ui.activeCategory) &&
    isActiveDayByCategory(value.ui.activeDayByCategory)
  );
}
```

Add `import { weekdayIndexOfIso } from "./date";` at the top of `types.ts` (check it is not already imported — `types.ts` currently imports nothing from `date.ts`, so add the line).

Rewrite `migrate`:

```ts
export function migrate(value: unknown): AppState | null {
  if (isAppState(value)) return value;

  if (isV2State(value)) {
    return {
      version: 3,
      updatedAt: value.updatedAt,
      programStartDate: value.programStartDate,
      completedSteps: value.completedSteps.map((c) => ({
        date: c.date,
        category: c.category,
        stepId: `${c.category}.${weekdayIndexOfIso(c.date)}.${c.phase}.${c.stepIndex}`,
      })),
      ui: value.ui,
    };
  }

  if (isV1State(value)) {
    return {
      version: 3,
      updatedAt: value.updatedAt,
      programStartDate: value.programStartDate,
      completedSteps: [],
      ui: value.ui,
    };
  }

  return null;
}
```

(The old v1→v2 arm produced `version: 2`; v1 has no `completedSteps`, so jumping v1 straight to v3 with `completedSteps: []` is equivalent and simpler. Delete the old v1 arm body and replace with the above.)

- [ ] **Step 5: `defaults.ts` → v3**

In `src/shared/defaults.ts` change `version: 2` to `version: 3`. Nothing else — `overrides` and `stepSeq` are optional and stay absent in a fresh state.

- [ ] **Step 6: Check the Worker tests**

Run: `grep -n "version: 2\|phase:\|stepIndex" worker/handlers.test.ts`
If any fixture hand-builds a v2 blob or a v2 `completedSteps` entry, update it to the v3 shape (`version: 3`, `completedSteps: [{ date, category, stepId }]`). If it only uses `makeDefaultState()`, no change is needed. `worker/handlers.ts` itself imports `isAppState` / `migrate` by name and needs no edit.

- [ ] **Step 7: Run just this file's tests**

Run: `npx vitest run src/shared/types.test.ts src/shared/routine.test.ts src/shared/schedule.test.ts worker/handlers.test.ts`
Expected: PASS. Do **not** run `npm run test` / `npm run typecheck` here and do **not** commit — `progress.ts` no longer compiles against the new `CompletedStep` (it still reads `.phase` / `.stepIndex`), which cascades to the provider and components. That is expected. Tasks 4→6 finish the cutover; the single commit for Tasks 3–6 is at the end of Task 6. Proceed straight to Task 4.

---

## Task 4: `content.ts` — the content read seam

New file. `getCategoryData` merges an override over the default; `resolveDayForState` produces a `ResolvedDay` of `{ id, product, note }` steps for a program week. **Read only** — mutation helpers are Task 8. Nothing consumes this yet; Task 5 (progress) and Task 7 (components) switch to it.

**Files:**
- Create: `src/shared/content.ts`
- Test: `src/shared/content.test.ts`

**Interfaces:**
- Consumes: `routine` from `routine.ts`; `resolveStep` from `schedule.ts`; `AppState`, `Category`, `CategoryData`, `DayData`, `StoredDay`, `StoredStep`, `RoutineStep`, `isHairDay` from `types.ts`.
- Produces:
  - `type ResolvedStep = { id: string; product: string; note: string }`
  - `type ResolvedDay = { kind: "facebody"; short: string; full: string; focus: string; am: ResolvedStep[]; pm: ResolvedStep[] } | { kind: "hair"; short: string; full: string; type: string; steps: ResolvedStep[] }`
  - `stepId(category: Category, dayIndex: number, phase: StepPhase, index: number): string` → `` `${category}.${dayIndex}.${phase}.${index}` ``
  - `getCategoryData(state: AppState, category: Category): CategoryData`
  - `resolveDayForState(state: AppState, category: Category, dayIndex: number, week: number): ResolvedDay`
  - `getStoredDays(state: AppState, category: Category): StoredDay[]` — the override's days if present, else the defaults wrapped with derived ids (used by Task 8 helpers and by `resolveDayForState`)

- [ ] **Step 1: Write the failing tests**

`src/shared/content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { routine } from "./routine";
import { getCategoryData, resolveDayForState, stepId } from "./content";
import type { AppState, CategoryOverride } from "./types";

const base: AppState = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

function withFaceOverride(mut: (o: CategoryOverride) => void): AppState {
  // start from the real default face content, wrapped with derived ids
  const days = routine.face.days.map((day, di) => {
    if ("steps" in day) {
      return { short: day.short, full: day.full, type: day.type,
        steps: day.steps.map((step, i) => ({ id: stepId("face", di, "steps", i), step })) };
    }
    return { short: day.short, full: day.full, focus: day.focus,
      am: day.am.map((step, i) => ({ id: stepId("face", di, "am", i), step })),
      pm: day.pm.map((step, i) => ({ id: stepId("face", di, "pm", i), step })) };
  });
  const override: CategoryOverride = { products: [...routine.face.products], days };
  mut(override);
  return { ...base, overrides: { face: override } };
}

describe("stepId", () => {
  it("builds the positional id string", () => {
    expect(stepId("face", 2, "am", 0)).toBe("face.2.am.0");
    expect(stepId("hair", 0, "steps", 4)).toBe("hair.0.steps.4");
  });
});

describe("getCategoryData", () => {
  it("returns the default (by reference) when there is no override", () => {
    expect(getCategoryData(base, "face")).toBe(routine.face);
    expect(getCategoryData(base, "hair")).toBe(routine.hair);
  });
  it("returns the override content when one exists, other categories untouched", () => {
    const state = withFaceOverride((o) => { o.products[0] = "Renamed cleanser"; });
    expect(getCategoryData(state, "face").products[0]).toBe("Renamed cleanser");
    expect(getCategoryData(state, "face").days).toHaveLength(7);
    expect(getCategoryData(state, "hair")).toBe(routine.hair); // independent
  });
});

describe("resolveDayForState", () => {
  it("default face Wednesday: Vitamin C at week 1, Niacinamide at week 3, same id", () => {
    const w1 = resolveDayForState(base, "face", 2, 1);
    const w3 = resolveDayForState(base, "face", 2, 3);
    if (w1.kind !== "facebody" || w3.kind !== "facebody") throw new Error("expected facebody");
    expect(w1.am[2]).toEqual({ id: "face.2.am.2", product: "Serum Vitamin C — Cocoon Nghệ C22",
      note: "Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide" });
    expect(w3.am[2].id).toBe("face.2.am.2");
    expect(w3.am[2].product).toBe("Serum Niacinamide 15% — Cocoon");
  });

  it("hair day resolves to the flat steps list", () => {
    const d = resolveDayForState(base, "hair", 1, 1);
    if (d.kind !== "hair") throw new Error("expected hair");
    expect(d.steps).toHaveLength(2);
    expect(d.steps[0].id).toBe("hair.1.steps.0");
  });

  it("uses override content and its frozen ids", () => {
    const state = withFaceOverride((o) => {
      const mon = o.days[0];
      if ("steps" in mon) throw new Error("face day");
      mon.am[1] = { id: "face.0.am.new-0", step: ["Custom toner", "note"] };
    });
    const d = resolveDayForState(state, "face", 0, 1);
    if (d.kind !== "facebody") throw new Error("expected facebody");
    expect(d.am[1]).toEqual({ id: "face.0.am.new-0", product: "Custom toner", note: "note" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/content.test.ts`
Expected: FAIL — `./content` does not exist.

- [ ] **Step 3: Implement `src/shared/content.ts`**

```ts
import { routine } from "./routine";
import { resolveStep } from "./schedule";
import {
  isHairDay,
  type AppState, type Category, type CategoryData, type DayData,
  type RoutineStep, type StepPhase, type StoredDay, type StoredStep,
} from "./types";

export type ResolvedStep = { id: string; product: string; note: string };

export type ResolvedDay =
  | { kind: "facebody"; short: string; full: string; focus: string; am: ResolvedStep[]; pm: ResolvedStep[] }
  | { kind: "hair"; short: string; full: string; type: string; steps: ResolvedStep[] };

/** The positional id for a default (un-overridden) step. */
export function stepId(category: Category, dayIndex: number, phase: StepPhase, index: number): string {
  return `${category}.${dayIndex}.${phase}.${index}`;
}

/** Drop the ids from an override's days to get back a plain DayData[]. */
function overrideToCategoryData(days: StoredDay[], products: string[]): CategoryData {
  const plain: DayData[] = days.map((day) => {
    if ("steps" in day) {
      return { short: day.short, full: day.full, type: day.type, steps: day.steps.map((s) => s.step) };
    }
    return {
      short: day.short, full: day.full, focus: day.focus,
      am: day.am.map((s) => s.step), pm: day.pm.map((s) => s.step),
    };
  });
  return { products, days: plain };
}

export function getCategoryData(state: AppState, category: Category): CategoryData {
  const override = state.overrides?.[category];
  if (!override) return routine[category];
  return overrideToCategoryData(override.days, override.products);
}

/** Wrap a default DayData as a StoredDay with derived positional ids. */
function wrapDefaultDay(category: Category, dayIndex: number, day: DayData): StoredDay {
  if (isHairDay(day)) {
    return {
      short: day.short, full: day.full, type: day.type,
      steps: day.steps.map((step, i) => ({ id: stepId(category, dayIndex, "steps", i), step })),
    };
  }
  return {
    short: day.short, full: day.full, focus: day.focus,
    am: day.am.map((step, i) => ({ id: stepId(category, dayIndex, "am", i), step })),
    pm: day.pm.map((step, i) => ({ id: stepId(category, dayIndex, "pm", i), step })),
  };
}

/**
 * The category's days as StoredStep-carrying days: the override's frozen days if
 * one exists, otherwise the shipped defaults wrapped with derived ids.
 */
export function getStoredDays(state: AppState, category: Category): StoredDay[] {
  const override = state.overrides?.[category];
  if (override) return override.days;
  return routine[category].days.map((day, i) => wrapDefaultDay(category, i, day));
}

function resolve(stored: StoredStep, week: number): ResolvedStep {
  const [product, note] = resolveStep(stored.step, week);
  return { id: stored.id, product, note };
}

export function resolveDayForState(
  state: AppState, category: Category, dayIndex: number, week: number,
): ResolvedDay {
  const day = getStoredDays(state, category)[dayIndex];
  if ("steps" in day) {
    return {
      kind: "hair", short: day.short, full: day.full, type: day.type,
      steps: day.steps.map((s) => resolve(s, week)),
    };
  }
  return {
    kind: "facebody", short: day.short, full: day.full, focus: day.focus,
    am: day.am.map((s) => resolve(s, week)),
    pm: day.pm.map((s) => resolve(s, week)),
  };
}
```

Note `RoutineStep` is imported but only used transitively; if `tsc` flags it as unused, drop it from the import. Keep `DayData` and the others.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: No commit yet**

Do not run `npm run typecheck` / `npm run test` or commit — still mid-cutover (`progress.ts` is next). `content.ts` is purely additive so nothing it introduced is broken; proceed to Task 5. The commit for Tasks 3–6 lands at the end of Task 6.

---

## Task 5: `progress.ts` re-keyed off `stepId`

`completedSteps` identity is now `(date, category, stepId)`. The counting helpers read resolved steps via `content.ts` (so they see overrides) and take `state`.

**Files:**
- Modify: `src/shared/progress.ts`
- Test: `src/shared/progress.test.ts` (rewrite)

**Interfaces:**
- Consumes: `resolveDayForState` from `content.ts`; `programWeek`, `weekdayDateIso` from `date.ts`; `AppState`, `Category`, `CompletedStep`, `StepPhase` from `types.ts`.
- Produces:
  - `toggleCompletedStep(state: AppState, target: CompletedStep): AppState` — unchanged behavior; `target` now `{ date, category, stepId }`. Pure; does not stamp `updatedAt`.
  - `isStepDone(completed: CompletedStep[], category: Category, dayIndex: number, stepId: string, nowIso: string): boolean`
  - `phaseCompletion(state: AppState, category: Category, dayIndex: number, phase: StepPhase, nowIso: string): { done: number; total: number }`
  - `dayCompletion(state: AppState, category: Category, dayIndex: number, nowIso: string): { done: number; total: number }`

- [ ] **Step 1: Rewrite `progress.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { dayCompletion, isStepDone, phaseCompletion, toggleCompletedStep } from "./progress";
import { stepId } from "./content";
import type { AppState, CompletedStep } from "./types";

const base: AppState = makeDefaultState(new Date("2026-08-24T00:00:00Z")); // programStartDate 2026-08-24 (Mon, week 1)
const NOW = "2026-08-26"; // Wednesday of week 1
const wedAm0: CompletedStep = { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 0) };

describe("toggleCompletedStep", () => {
  it("adds an absent entry and removes a present one, without mutating input", () => {
    const added = toggleCompletedStep(base, wedAm0);
    expect(added.completedSteps).toEqual([wedAm0]);
    expect(base.completedSteps).toEqual([]);
    expect(added.updatedAt).toBe(base.updatedAt);
    expect(toggleCompletedStep(added, wedAm0).completedSteps).toEqual([]);
  });
});

describe("isStepDone", () => {
  it("matches by (date-from-dayIndex, category, stepId)", () => {
    expect(isStepDone([wedAm0], "face", 2, stepId("face", 2, "am", 0), NOW)).toBe(true);
    expect(isStepDone([wedAm0], "face", 2, stepId("face", 2, "am", 1), NOW)).toBe(false);
    expect(isStepDone([wedAm0], "face", 2, stepId("face", 2, "am", 0), "2026-09-02")).toBe(false); // other week
  });
});

describe("phaseCompletion / dayCompletion", () => {
  it("counts done against the resolved phase length", () => {
    const completed: CompletedStep[] = [
      { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 0) },
      { date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 1) },
    ];
    const c = phaseCompletion({ ...base, completedSteps: completed }, "face", 2, "am", NOW);
    expect(c).toEqual({ done: 2, total: 5 }); // Wednesday AM has 5 steps
  });

  it("dayCompletion sums am + pm for a face day and uses steps for a hair day", () => {
    const face = dayCompletion(base, "face", 2, NOW);
    expect(face.done).toBe(0);
    expect(face.total).toBeGreaterThan(5);
    const hair = dayCompletion(base, "hair", 1, "2026-08-25"); // Tuesday
    expect(hair.total).toBe(2);
  });

  it("a check-off on a conditional step stays counted across the week boundary", () => {
    // Wednesday AM index 2 is the threshold step; its id is week-invariant.
    const id = stepId("face", 2, "am", 2);
    const state: AppState = {
      ...base,
      completedSteps: [{ date: "2026-08-26", category: "face", stepId: id }], // week 1 (Vitamin C)
    };
    expect(phaseCompletion(state, "face", 2, "am", "2026-08-26").done).toBe(1); // week 1
    // move NOW into week 3; same routine-day-of-week date maths, different product, same id
    expect(isStepDone(state.completedSteps, "face", 2, id, "2026-09-09")).toBe(false);
    // ^ different calendar date (week 3 Wednesday) => not done for THAT date; the
    //   point of the id stability is that if she re-checks in week 3 it lands on
    //   the same slot. Assert the id used is identical regardless of week:
    expect(id).toBe("face.2.am.2");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/progress.test.ts`
Expected: FAIL — `isStepDone` / `phaseCompletion` signatures differ; `CompletedStep` no longer has `phase`.

- [ ] **Step 3: Rewrite `src/shared/progress.ts`**

```ts
import { programWeek, weekdayDateIso } from "./date";
import { resolveDayForState } from "./content";
import type { AppState, Category, CompletedStep, StepPhase } from "./types";

function sameStep(a: CompletedStep, b: CompletedStep): boolean {
  return a.date === b.date && a.category === b.category && a.stepId === b.stepId;
}

/** Add `target` if absent, remove it if present. Pure. Does not stamp updatedAt. */
export function toggleCompletedStep(state: AppState, target: CompletedStep): AppState {
  const without = state.completedSteps.filter((entry) => !sameStep(entry, target));
  const next = without.length === state.completedSteps.length ? [...without, target] : without;
  return { ...state, completedSteps: next };
}

/** True when the step slot is checked for its date within `nowIso`'s week. */
export function isStepDone(
  completed: CompletedStep[],
  category: Category,
  dayIndex: number,
  stepId: string,
  nowIso: string,
): boolean {
  const date = weekdayDateIso(dayIndex, nowIso);
  return completed.some((entry) => sameStep(entry, { date, category, stepId }));
}

function phaseSteps(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, week: number,
): { id: string }[] {
  const day = resolveDayForState(state, category, dayIndex, week);
  if (day.kind === "hair") return phase === "steps" ? day.steps : [];
  if (phase === "am") return day.am;
  if (phase === "pm") return day.pm;
  return [];
}

export function phaseCompletion(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, nowIso: string,
): { done: number; total: number } {
  const week = programWeek(state.programStartDate, nowIso);
  const steps = phaseSteps(state, category, dayIndex, phase, week);
  const date = weekdayDateIso(dayIndex, nowIso);
  let done = 0;
  for (const step of steps) {
    if (state.completedSteps.some((e) => sameStep(e, { date, category, stepId: step.id }))) done += 1;
  }
  return { done, total: steps.length };
}

export function dayCompletion(
  state: AppState, category: Category, dayIndex: number, nowIso: string,
): { done: number; total: number } {
  const week = programWeek(state.programStartDate, nowIso);
  const day = resolveDayForState(state, category, dayIndex, week);
  const phases: StepPhase[] = day.kind === "hair" ? ["steps"] : ["am", "pm"];
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    const c = phaseCompletion(state, category, dayIndex, phase, nowIso);
    done += c.done;
    total += c.total;
  }
  return { done, total };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: No commit yet — proceed to Task 6**

`npm run typecheck` now FAILS in `src/components/DayPanel.tsx`, `src/components/WeekProgress.tsx`, `src/state/AppStateProvider.tsx` (they still call the old `resolveDay` / `isStepDone` / `phaseCompletion` / `dayCompletion` signatures) and in the four test files that build v2 `CompletedStep` fixtures. Expected. Do **not** "fix" by loosening the new signatures, and do **not** commit. Task 6 finishes the cutover and makes the one commit for Tasks 3–6.

---

## Task 6: Re-plumb the read path — `AppStateProvider` + components to v3 / `content.ts`

Finishes the Tasks 3–6 cutover: the single commit for all four lands here. At the end of this task the app renders and behaves exactly as before — same products, same checkboxes, same week strip — but every content read goes through `content.ts` and every check-off is `stepId`-keyed. **No editing UI yet.** This is the parity checkpoint.

**Files:**
- Modify: `src/state/AppStateProvider.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/CategorySection.tsx`
- Modify: `src/components/DayPanel.tsx`
- Modify: `src/components/WeekProgress.tsx`
- Modify: `src/shared/schedule.ts` (delete the now-unused `resolveDay`)
- Test: `src/state/AppStateProvider.test.tsx`, `src/components/DayPanel.test.tsx`, `src/components/WeekProgress.test.tsx`, `src/components/CategorySection.test.tsx` (adapt fixtures/signatures to v3 — keep the behavioral assertions)

**Interfaces:**
- Consumes: `resolveDayForState` / `ResolvedStep` / `ResolvedDay` from `content.ts`; `isStepDone` / `phaseCompletion` / `dayCompletion` (new signatures) from `progress.ts`; `toggleCompletedStep` from `progress.ts`.
- Produces:
  - `AppStateContextValue.toggleStep: (category: Category, dayIndex: number, stepId: string) => void`
  - `AppStateContextValue.editContent: (mutate: (state: AppState) => AppState) => void`
  - `CategorySection` prop shape: `{ category: Category; state: AppState; activeDay: number; onSelectDay: (i: number) => void; onToggleStep: AppStateContextValue["toggleStep"]; editContent: AppStateContextValue["editContent"] }`
  - `DayPanel` prop shape: `{ category: Category; state: AppState; dayIndex: number; onToggleStep: ...; now?: Date }` (drops `programStartDate` and `completedSteps`)
  - `WeekProgress` prop shape: `{ category: Category; state: AppState; now?: Date }` (drops `programStartDate` and `completedSteps`)

- [ ] **Step 1: `AppStateProvider.tsx`**

Change `toggleStep` and add `editContent`:

```ts
toggleStep: (category, dayIndex, stepId) =>
  update((prev) =>
    toggleCompletedStep(prev, {
      date: weekdayDateIso(dayIndex, todayIso()),
      category,
      stepId,
    }),
  ),
editContent: (mutate) => update(mutate),
```

Add `editContent: (mutate: (state: AppState) => AppState) => void;` to `AppStateContextValue`, and `editContent` to the `useMemo` value object and its return. Update the `toggleStep` type in `AppStateContextValue` to `(category: Category, dayIndex: number, stepId: string) => void`. `import type { AppState } from "../shared/types"` is already present.

- [ ] **Step 2: `App.tsx`**

```tsx
const { state, status, setActiveCategory, setActiveDay, toggleStep, editContent } = useAppState();
...
<CategorySection
  key={activeCategory}
  category={activeCategory}
  state={state}
  activeDay={activeDayByCategory[activeCategory]}
  onSelectDay={(index) => setActiveDay(activeCategory, index)}
  onToggleStep={toggleStep}
  editContent={editContent}
/>
```

Drop the `programStartDate` and `completedSteps` props.

- [ ] **Step 3: `CategorySection.tsx`**

- Props: replace `programStartDate` / `completedSteps` with `state: AppState`; add `editContent`.
- Replace `const data = routine[category];` with `const data = getCategoryData(state, category);` (import from `../shared/content`; drop the `routine` import).
- Pass `state` to `WeekProgress` and `DayPanel` instead of `programStartDate` / `completedSteps`.
- `Gallery` still gets `products={data.products}` (Task 8 adds its edit props).
- `DayTabs` still gets `days={data.days}`.
- No pencil / edit toggle yet (Task 10).

- [ ] **Step 4: `DayPanel.tsx`**

- Props: `{ category, state, dayIndex, onToggleStep, now = new Date() }`. `onToggleStep: (category: Category, dayIndex: number, stepId: string) => void`.
- `const nowIso = todayIso(now); const week = programWeek(state.programStartDate, nowIso);`
- `const day = resolveDayForState(state, category, dayIndex, week);` (import from `../shared/content`; drop `resolveDay` from `../shared/schedule` and `isHairDay` if now unused).
- Branch on `day.kind === "hair"` instead of `isHairDay(day)`.
- The `Steps` inner component now takes `steps: ResolvedStep[]` and a `phase`. Each item:

```tsx
{steps.map((s) => {
  const checked = isStepDone(completedSteps, category, dayIndex, s.id, nowIso);
  return (
    <li key={s.id}>
      <label className="step-check">
        <input type="checkbox" aria-label={s.product} checked={checked}
          onChange={() => onToggleStep(category, dayIndex, s.id)} />
        <span className="step-check-box" aria-hidden="true" />
      </label>
      <div className="icon-badge"><Icon icon={pickIcon(s.product)} /></div>
      <div>
        <strong>{s.product}</strong>
        {s.note ? <span className="note">{s.note}</span> : null}
      </div>
    </li>
  );
})}
```

  where `completedSteps` is `state.completedSteps`. Pass `state.completedSteps` (or `state`) into `Steps`.
- `phaseCompletion` / the per-card `done`/`total`: call `phaseCompletion(state, category, dayIndex, "am" | "pm" | "steps", nowIso)`.
- `PANEL_COPY`, `Card`, badges: unchanged.

- [ ] **Step 5: `WeekProgress.tsx`**

- Props: `{ category, state, now = new Date() }`.
- `const week = programWeek(state.programStartDate, nowIso);`
- `dayCompletion(state, category, index, nowIso)` per day marker.
- `weekdayIndex(now)` for the today column — unchanged.

- [ ] **Step 5b: Delete the now-dead `resolveDay` from `schedule.ts`**

Nothing imports `resolveDay` any more (progress.ts moved to `resolveDayForState` in Task 5; DayPanel in Step 4). Delete the `resolveDay` export and its `DayData` / `Category` / `routine` imports if they become unused — `schedule.ts` should end up as just `resolveStep` plus the `isStepTuple` / `isThresholdVariant` / `RoutineStep` / `StepTuple` imports it needs. `schedule.test.ts` (rewritten in Task 2) already only tests `resolveStep`. Run `grep -rn "resolveDay" src/` to confirm zero hits before deleting.

- [ ] **Step 6: Update the four test files** (adapt v2 fixtures → v3, keep assertions)

- **`DayPanel.test.tsx`**: `renderPanel` builds `state` via `makeDefaultState(new Date("2026-08-24T00:00:00Z"))` and passes `state={...}` instead of `programStartDate` / `completedSteps`. For the "reflects completedSteps as checked" test, build entries as `{ date: "2026-08-26", category: "face", stepId: stepId("face", 2, "am", 0) }` (import `stepId` from `../shared/content`). Keep every assertion (Vitamin C week 1 / Niacinamide week 3, accessible checkbox name, `2/5` count, hair flat list). `onToggleStep` is now called with `("face", 2, "face.2.am.0")` — update that assertion to `expect(onToggleStep).toHaveBeenCalledWith("face", 2, "face.2.am.0")`.
- **`WeekProgress.test.tsx`**: pass `state` (with `completedSteps` built from `{ date, category, stepId: stepId("hair", 1, "steps", 0) }` etc.). Keep the seven-markers / is-full / is-partial / is-today / "Tuần N" assertions.
- **`AppStateProvider.test.tsx`**: the `Probe` button `toggle w-am-0` now calls `toggleStep("face", 2, "face.2.am.2")` — pick any valid id string, e.g. `stepId("face", 2, "am", 2)` or the literal `"face.2.am.2"`. Keep the "completed count 0 → 1 → 0" assertion. Add a button that calls `editContent((s) => ({ ...s, stepSeq: (s.stepSeq ?? 0) + 1 }))` and assert a `data-testid="seq"` span goes `` → `1``, proving the seam writes.
- **`CategorySection.test.tsx`**: `stateProps` becomes `{ state: makeDefaultState(new Date("2026-08-24T00:00:00Z")), onToggleStep: () => {}, editContent: () => {} }` spread into the render. Keep the gallery / seven-tabs / active-day-steps / onSelectDay / hair-flat-list / theme-class assertions.

- [ ] **Step 7: Run the full suite + typecheck + build**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all green. The app is at read-mode parity on v3.

- [ ] **Step 8: Commit — the single commit for Tasks 3, 4, 5 and 6**

```bash
git add src/shared/types.ts src/shared/types.test.ts src/shared/defaults.ts \
  src/shared/content.ts src/shared/content.test.ts \
  src/shared/progress.ts src/shared/progress.test.ts src/shared/schedule.ts \
  worker/handlers.test.ts \
  src/state/AppStateProvider.tsx src/state/AppStateProvider.test.tsx \
  src/App.tsx src/components/CategorySection.tsx src/components/CategorySection.test.tsx \
  src/components/DayPanel.tsx src/components/DayPanel.test.tsx \
  src/components/WeekProgress.tsx src/components/WeekProgress.test.tsx
git commit -m "feat(state): AppState v3 with overrides + stepId check-offs; content.ts read seam; editContent"
```

If `git status` shows anything from Tasks 3–6 not in this list, add it — the cutover must land whole.

---

## Task 7: `content.ts` mutation helpers (pure)

Eight pure `AppState → AppState` helpers plus the private `ensureOverride`. Each performs the copy-on-write clone of `overrides[category]` on first touch (snapshotting derived ids into `StoredStep`s). No UI yet.

**Files:**
- Modify: `src/shared/content.ts`
- Test: `src/shared/content.test.ts` (add a `describe("mutation helpers")` block)

**Interfaces:**
- Consumes: `getStoredDays`, `stepId` (Task 4); `RoutineStep`, `StoredStep`, `StoredDay`, `CategoryOverride`, `AppState`, `Category`, `StepPhase` from `types.ts`.
- Produces (all `(state, ...) => AppState`, pure, no `updatedAt` stamp):
  - `addProduct(state, category)` — appends `""`
  - `renameProduct(state, category, index, name)`
  - `removeProduct(state, category, index)`
  - `addStep(state, category, dayIndex, phase)` — appends `{ id: \`${category}.${dayIndex}.${phase}.new-${n}\`, step: ["", ""] }`, `n = state.stepSeq ?? 0`, then `stepSeq = n + 1`
  - `updateStepTuple(state, category, dayIndex, phase, id, product, note)` — sets that step's `.step` to `[product, note]`
  - `removeStep(state, category, dayIndex, phase, id)`
  - `setStepVariant(state, category, dayIndex, phase, id, variant: RoutineStep)` — replaces `.step` with `variant`, keeps `.id`
  - `resetCategory(state, category)` — deletes `overrides[category]`

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/content.test.ts`:

```ts
import {
  addProduct, renameProduct, removeProduct,
  addStep, updateStepTuple, removeStep, setStepVariant, resetCategory,
} from "./content";
import type { ThresholdVariant } from "./types";

describe("mutation helpers", () => {
  it("renameProduct clones on first touch and leaves other categories default", () => {
    const s = renameProduct(base, "face", 0, "Renamed");
    expect(s.overrides?.face?.products[0]).toBe("Renamed");
    expect(s.overrides?.hair).toBeUndefined();
    expect(base.overrides).toBeUndefined(); // input not mutated
  });

  it("addProduct / removeProduct adjust the products array", () => {
    const added = addProduct(base, "face");
    const n = routine.face.products.length;
    expect(added.overrides?.face?.products).toHaveLength(n + 1);
    expect(added.overrides?.face?.products[n]).toBe("");
    const removed = removeProduct(added, "face", 0);
    expect(removed.overrides?.face?.products).toHaveLength(n);
  });

  it("addStep appends a blank step with a new-<n> id and bumps stepSeq", () => {
    const a = addStep(base, "face", 0, "pm");
    expect(a.stepSeq).toBe(1);
    const day = a.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("expected a face day");
    expect(day.pm[day.pm.length - 1]).toEqual({ id: "face.0.pm.new-0", step: ["", ""] });
    // untouched steps keep derived ids
    expect(day.pm[0].id).toBe("face.0.pm.0");
    const b = addStep(a, "face", 0, "pm");
    expect(b.stepSeq).toBe(2);
    const day2 = b.overrides?.face?.days[0];
    if (!day2 || "steps" in day2) throw new Error("face day");
    expect(day2.pm[day2.pm.length - 1].id).toBe("face.0.pm.new-1");
  });

  it("updateStepTuple changes product/note, keeps id", () => {
    const s = updateStepTuple(base, "face", 0, "am", "face.0.am.0", "New product", "New note");
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.am[0]).toEqual({ id: "face.0.am.0", step: ["New product", "New note"] });
  });

  it("removeStep drops the step, other ids unchanged, stepSeq untouched", () => {
    const s = removeStep(base, "hair", 0, "steps", "hair.0.steps.1");
    const day = s.overrides?.hair?.days[0];
    if (!day || !("steps" in day)) throw new Error("hair day");
    expect(day.steps.find((x) => x.id === "hair.0.steps.1")).toBeUndefined();
    expect(day.steps[0].id).toBe("hair.0.steps.0");
    expect(s.stepSeq).toBeUndefined();
  });

  it("setStepVariant swaps the step form, preserving id", () => {
    const variant: ThresholdVariant = {
      kind: "threshold", untilWeek: 2, before: ["X", ""], from: ["Y", ""],
    };
    const s = setStepVariant(base, "face", 0, "am", "face.0.am.0", variant);
    const day = s.overrides?.face?.days[0];
    if (!day || "steps" in day) throw new Error("face day");
    expect(day.am[0]).toEqual({ id: "face.0.am.0", step: variant });
  });

  it("resetCategory removes just that override", () => {
    const two = renameProduct(renameProduct(base, "face", 0, "F"), "hair", 0, "H");
    const s = resetCategory(two, "face");
    expect(s.overrides?.face).toBeUndefined();
    expect(s.overrides?.hair?.products[0]).toBe("H");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/content.test.ts`
Expected: FAIL — none of the helpers are exported.

- [ ] **Step 3: Implement the helpers in `content.ts`**

```ts
import type { CategoryOverride } from "./types"; // add to the existing import from ./types

/** Deep-ish clone of one override (arrays + step objects), safe to mutate. */
function cloneOverride(o: CategoryOverride): CategoryOverride {
  return {
    products: [...o.products],
    days: o.days.map((day) =>
      "steps" in day
        ? { ...day, steps: day.steps.map((s) => ({ ...s })) }
        : { ...day, am: day.am.map((s) => ({ ...s })), pm: day.pm.map((s) => ({ ...s })) },
    ),
  };
}

/** The category's override, cloned; created from defaults (with derived ids) on first touch. */
function ensureOverride(state: AppState, category: Category): CategoryOverride {
  const existing = state.overrides?.[category];
  if (existing) return cloneOverride(existing);
  return { products: [...routine[category].products], days: getStoredDays(state, category) };
}

function withOverride(state: AppState, category: Category, o: CategoryOverride): AppState {
  return { ...state, overrides: { ...state.overrides, [category]: o } };
}

function phaseArrayOf(day: StoredDay, phase: StepPhase): StoredStep[] {
  if ("steps" in day) return day.steps;
  return phase === "pm" ? day.pm : day.am;
}

function setPhaseArray(day: StoredDay, phase: StepPhase, next: StoredStep[]): StoredDay {
  if ("steps" in day) return { ...day, steps: next };
  return phase === "pm" ? { ...day, pm: next } : { ...day, am: next };
}

export function addProduct(state: AppState, category: Category): AppState {
  const o = ensureOverride(state, category);
  o.products.push("");
  return withOverride(state, category, o);
}

export function renameProduct(state: AppState, category: Category, index: number, name: string): AppState {
  const o = ensureOverride(state, category);
  if (index >= 0 && index < o.products.length) o.products[index] = name;
  return withOverride(state, category, o);
}

export function removeProduct(state: AppState, category: Category, index: number): AppState {
  const o = ensureOverride(state, category);
  if (index >= 0 && index < o.products.length) o.products.splice(index, 1);
  return withOverride(state, category, o);
}

export function addStep(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
): AppState {
  const o = ensureOverride(state, category);
  const n = state.stepSeq ?? 0;
  const day = o.days[dayIndex];
  const next = [...phaseArrayOf(day, phase), { id: `${category}.${dayIndex}.${phase}.new-${n}`, step: ["", ""] }];
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return { ...withOverride(state, category, o), stepSeq: n + 1 };
}

export function updateStepTuple(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
  id: string, product: string, note: string,
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const next = phaseArrayOf(day, phase).map((s) => (s.id === id ? { id, step: [product, note] } : s));
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return withOverride(state, category, o);
}

export function removeStep(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase, id: string,
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const next = phaseArrayOf(day, phase).filter((s) => s.id !== id);
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return withOverride(state, category, o);
}

export function setStepVariant(
  state: AppState, category: Category, dayIndex: number, phase: StepPhase,
  id: string, variant: RoutineStep,
): AppState {
  const o = ensureOverride(state, category);
  const day = o.days[dayIndex];
  const next = phaseArrayOf(day, phase).map((s) => (s.id === id ? { id, step: variant } : s));
  o.days[dayIndex] = setPhaseArray(day, phase, next);
  return withOverride(state, category, o);
}

export function resetCategory(state: AppState, category: Category): AppState {
  if (!state.overrides?.[category]) return state;
  const nextOverrides = { ...state.overrides };
  delete nextOverrides[category];
  const isEmpty = Object.keys(nextOverrides).length === 0;
  return { ...state, overrides: isEmpty ? undefined : nextOverrides };
}
```

Note the `[product, note]` array literals: TypeScript infers `string[]`, but `StoredStep.step` is `RoutineStep` and `["", ""]` must satisfy `StepTuple = [string, string]`. If `tsc` complains, annotate: `const step: StepTuple = [product, note];` — import `StepTuple` and use a typed local, **not** an `as` cast.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/shared/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test`
Expected: all green (no consumer of the new helpers yet).

- [ ] **Step 6: Commit**

```bash
git add src/shared/content.ts src/shared/content.test.ts
git commit -m "feat(content): pure copy-on-write mutation helpers for products and steps"
```

---

## Task 8: `Gallery` edit mode

`Gallery` gains an optional `editing` + `onEdit` bundle. When editing, each product is a text input with a remove button, plus an add button. When not editing, it renders exactly as today.

**Files:**
- Modify: `src/components/Gallery.tsx`
- Test: `src/components/Gallery.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type GalleryEdit = { onRename: (index: number, name: string) => void; onRemove: (index: number) => void; onAdd: () => void }`
  - `Gallery` props: `{ products: string[]; editing?: boolean; onEdit?: GalleryEdit }`

- [ ] **Step 1: Write the failing tests**

`src/components/Gallery.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Gallery from "./Gallery";

describe("Gallery", () => {
  it("renders a plain list when not editing", () => {
    render(<Gallery products={["A", "B"]} />);
    const g = screen.getByTestId("gallery");
    expect(within(g).getByText("A")).toBeInTheDocument();
    expect(within(g).queryByRole("textbox")).toBeNull();
  });

  it("renders an input + remove per product and an add button when editing", async () => {
    const onEdit = { onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() };
    render(<Gallery products={["Cleanser", "Toner"]} editing onEdit={onEdit} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue("Cleanser");

    await userEvent.type(inputs[1], "!");
    expect(onEdit.onRename).toHaveBeenLastCalledWith(1, "Toner!");

    await userEvent.click(screen.getAllByRole("button", { name: /xoá sản phẩm/i })[0]);
    expect(onEdit.onRemove).toHaveBeenCalledWith(0);

    await userEvent.click(screen.getByRole("button", { name: /thêm sản phẩm/i }));
    expect(onEdit.onAdd).toHaveBeenCalled();
  });

  it("shows a placeholder for an empty product name", () => {
    render(<Gallery products={[""]} editing onEdit={{ onRename: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() }} />);
    expect(screen.getByPlaceholderText("Sản phẩm chưa đặt tên")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/Gallery.test.tsx`
Expected: FAIL — no edit rendering.

- [ ] **Step 3: Implement**

```tsx
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";

export type GalleryEdit = {
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
};

export default function Gallery({
  products,
  editing = false,
  onEdit,
}: {
  products: string[];
  editing?: boolean;
  onEdit?: GalleryEdit;
}) {
  if (editing && onEdit) {
    return (
      <div className="gallery gallery-edit" data-testid="gallery">
        {products.map((product, index) => (
          <div className="prod prod-edit" key={index}>
            <Icon icon={pickIcon(product)} size={34} />
            <input
              type="text"
              value={product}
              placeholder="Sản phẩm chưa đặt tên"
              onChange={(e) => onEdit.onRename(index, e.target.value)}
            />
            <button type="button" aria-label={`Xoá sản phẩm ${index + 1}`} onClick={() => onEdit.onRemove(index)}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="gallery-add" onClick={onEdit.onAdd}>
          + Thêm sản phẩm
        </button>
      </div>
    );
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

Note the `key` changes from `product` to `index` — product strings are now editable and can collide or be empty, so the array index is the stable key here.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/Gallery.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check the existing gallery test still passes**

Run: `npx vitest run src/components/CategorySection.test.tsx`
Expected: PASS — `CategorySection` does not pass `editing` yet, so `Gallery` renders the plain branch (the `key` change is the only difference and it is invisible to the test).

- [ ] **Step 6: Add minimal styles**

Append to `src/styles.css` (near the existing `.gallery` / `.prod` rules) rules for `.gallery-edit .prod-edit` (flex row: icon, `input { flex: 1 }`, `×` button), `.gallery-add` (full-width dashed button). Match the existing visual language — reuse existing spacing/color variables; no new palette. Keep it short; this is a personal tool.

- [ ] **Step 7: Commit**

```bash
git add src/components/Gallery.tsx src/components/Gallery.test.tsx src/styles.css
git commit -m "feat(gallery): edit mode — rename / remove / add product fields"
```

---

## Task 9: `VariantEditor` and `StepEditor` components

Two new presentational components. `VariantEditor` owns the kind selector and branch inputs and always emits a complete next `RoutineStep`. `StepEditor` is the collapsed-until-tapped row wrapping it, plus the remove control.

**Files:**
- Create: `src/components/VariantEditor.tsx`
- Create: `src/components/StepEditor.tsx`
- Test: `src/components/VariantEditor.test.tsx`, `src/components/StepEditor.test.tsx`
- Modify: `src/styles.css` (small)

**Interfaces:**
- Consumes: `isStepTuple`, `isThresholdVariant`, `RoutineStep`, `StepTuple` from `types.ts`; `ResolvedStep` from `content.ts`.
- Produces:
  - `VariantEditor` props: `{ value: RoutineStep; onChange: (next: RoutineStep) => void }`
  - `StepEditor` props: `{ display: ResolvedStep; raw: RoutineStep; onUpdateTuple: (product: string, note: string) => void; onSetVariant: (next: RoutineStep) => void; onRemove: () => void }`
  - `firstTuple(step: RoutineStep): StepTuple` (exported from `VariantEditor`) — plain → itself; threshold → `before`; cycle → `weeks[0]`

- [ ] **Step 1: Write `VariantEditor.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VariantEditor from "./VariantEditor";
import type { RoutineStep } from "../shared/types";

function last(mock: ReturnType<typeof vi.fn>): RoutineStep {
  return mock.mock.calls[mock.mock.calls.length - 1][0];
}

describe("VariantEditor", () => {
  it("plain: edits product/note, emits a tuple", async () => {
    const onChange = vi.fn();
    render(<VariantEditor value={["Toner", "am note"]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Sản phẩm"), "!");
    expect(last(onChange)).toEqual(["Toner!", "am note"]);
  });

  it("switches plain -> threshold carrying the tuple into both branches", async () => {
    const onChange = vi.fn();
    render(<VariantEditor value={["Serum", "n"]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Kiểu đổi theo tuần"), "threshold");
    expect(last(onChange)).toEqual({
      kind: "threshold", untilWeek: 2, before: ["Serum", "n"], from: ["Serum", "n"],
    });
  });

  it("threshold: editing the 'from' branch keeps 'before' intact", async () => {
    const value: RoutineStep = { kind: "threshold", untilWeek: 2, before: ["A", ""], from: ["B", ""] };
    const onChange = vi.fn();
    render(<VariantEditor value={value} onChange={onChange} />);
    const fromProduct = screen.getByLabelText("Sản phẩm — từ tuần 3");
    await userEvent.type(fromProduct, "!");
    const next = last(onChange);
    if (Array.isArray(next) || next.kind !== "threshold") throw new Error("expected threshold");
    expect(next.before).toEqual(["A", ""]);
    expect(next.from[0]).toBe("B!");
  });

  it("cycle: switching length 2 -> 4 pads weeks to 4", async () => {
    const value: RoutineStep = { kind: "cycle", length: 2, weeks: [["A", ""], ["B", ""]] };
    const onChange = vi.fn();
    render(<VariantEditor value={value} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Số tuần trong chu kỳ"), "4");
    const next = last(onChange);
    if (Array.isArray(next) || next.kind !== "cycle") throw new Error("expected cycle");
    expect(next.length).toBe(4);
    expect(next.weeks).toHaveLength(4);
    expect(next.weeks[0]).toEqual(["A", ""]);
    expect(next.weeks[2]).toEqual(["", ""]);
  });
});
```

- [ ] **Step 2: Implement `VariantEditor.tsx`**

```tsx
import { isStepTuple, isThresholdVariant, type RoutineStep, type StepTuple } from "../shared/types";

type Kind = "plain" | "threshold" | "cycle";

export function firstTuple(step: RoutineStep): StepTuple {
  if (isStepTuple(step)) return step;
  if (isThresholdVariant(step)) return step.before;
  return step.weeks[0];
}

function kindOf(step: RoutineStep): Kind {
  if (isStepTuple(step)) return "plain";
  return step.kind;
}

function padWeeks(weeks: StepTuple[], length: 2 | 4): StepTuple[] {
  const next = weeks.slice(0, length);
  while (next.length < length) next.push(["", ""]);
  return next;
}

function TupleFields({
  label, value, onChange,
}: {
  label: { product: string; note: string };
  value: StepTuple;
  onChange: (t: StepTuple) => void;
}) {
  return (
    <div className="variant-branch">
      <label>
        {label.product}
        <input type="text" value={value[0]} placeholder="Bước chưa đặt tên"
          onChange={(e) => onChange([e.target.value, value[1]])} />
      </label>
      <label>
        {label.note}
        <input type="text" value={value[1]}
          onChange={(e) => onChange([value[0], e.target.value])} />
      </label>
    </div>
  );
}

export default function VariantEditor({
  value,
  onChange,
}: {
  value: RoutineStep;
  onChange: (next: RoutineStep) => void;
}) {
  const kind = kindOf(value);
  const base = firstTuple(value);

  function switchKind(next: Kind): void {
    if (next === kind) return;
    if (next === "plain") onChange(base);
    else if (next === "threshold") onChange({ kind: "threshold", untilWeek: 2, before: base, from: base });
    else onChange({ kind: "cycle", length: 2, weeks: [base, base] });
  }

  return (
    <div className="variant-editor">
      <label>
        Kiểu đổi theo tuần
        <select value={kind} onChange={(e) => switchKind(toKind(e.target.value))}>
          <option value="plain">Không đổi theo tuần</option>
          <option value="threshold">Đổi theo mốc tuần</option>
          <option value="cycle">Luân phiên theo chu kỳ</option>
        </select>
      </label>

      {kind === "plain" && (
        <TupleFields label={{ product: "Sản phẩm", note: "Ghi chú" }} value={base}
          onChange={(t) => onChange(t)} />
      )}

      {kind === "threshold" && !isStepTuple(value) && value.kind === "threshold" && (
        <>
          <label>
            Đổi từ tuần thứ
            <input type="number" min={1} value={value.untilWeek}
              onChange={(e) => onChange({ ...value, untilWeek: coerceWeek(e.target.value) })}
              onBlur={(e) => onChange({ ...value, untilWeek: coerceWeek(e.target.value) })} />
          </label>
          <TupleFields
            label={{ product: `Sản phẩm — tuần 1–${value.untilWeek}`, note: `Ghi chú — tuần 1–${value.untilWeek}` }}
            value={value.before}
            onChange={(t) => onChange({ ...value, before: t })} />
          <TupleFields
            label={{ product: `Sản phẩm — từ tuần ${value.untilWeek + 1}`, note: `Ghi chú — từ tuần ${value.untilWeek + 1}` }}
            value={value.from}
            onChange={(t) => onChange({ ...value, from: t })} />
        </>
      )}

      {kind === "cycle" && !isStepTuple(value) && value.kind === "cycle" && (
        <>
          <label>
            Số tuần trong chu kỳ
            <select value={value.length}
              onChange={(e) => {
                const length = e.target.value === "4" ? 4 : 2;
                onChange({ kind: "cycle", length, weeks: padWeeks(value.weeks, length) });
              }}>
              <option value="2">2</option>
              <option value="4">4</option>
            </select>
          </label>
          {value.weeks.map((week, i) => (
            <TupleFields key={i}
              label={{ product: cycleLabel(value.length, i, "Sản phẩm"), note: cycleLabel(value.length, i, "Ghi chú") }}
              value={week}
              onChange={(t) => {
                const weeks = value.weeks.map((w, wi) => (wi === i ? t : w));
                onChange({ ...value, weeks });
              }} />
          ))}
        </>
      )}
    </div>
  );
}

function toKind(v: string): Kind {
  return v === "threshold" ? "threshold" : v === "cycle" ? "cycle" : "plain";
}

function coerceWeek(v: string): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

function cycleLabel(length: 2 | 4, i: number, prefix: string): string {
  if (length === 2) return `${prefix} — tuần ${i === 0 ? "lẻ (1, 3…)" : "chẵn (2, 4…)"}`;
  return `${prefix} — tuần ${i + 1}`;
}
```

`toKind` / `coerceWeek` narrow the `<select>` / `<input>` string values without an `as` cast — a plain function returning the union.

- [ ] **Step 3: Write `StepEditor.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import StepEditor from "./StepEditor";

const display = { id: "face.0.am.0", product: "Toner Cocoon Sen", note: "" };

describe("StepEditor", () => {
  it("is collapsed by default and expands on tap", async () => {
    render(<StepEditor display={display} raw={["Toner Cocoon Sen", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("Toner Cocoon Sen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sản phẩm")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /sửa bước/i }));
    expect(screen.getByLabelText("Sản phẩm")).toHaveValue("Toner Cocoon Sen");
  });

  it("shows a placeholder label for an empty product", () => {
    render(<StepEditor display={{ id: "x", product: "", note: "" }} raw={["", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("Bước chưa đặt tên")).toBeInTheDocument();
  });

  it("routes a plain edit to onUpdateTuple and a kind switch to onSetVariant", async () => {
    const onUpdateTuple = vi.fn();
    const onSetVariant = vi.fn();
    render(<StepEditor display={display} raw={["Toner Cocoon Sen", ""]}
      onUpdateTuple={onUpdateTuple} onSetVariant={onSetVariant} onRemove={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /sửa bước/i }));
    await userEvent.type(screen.getByLabelText("Sản phẩm"), "!");
    expect(onUpdateTuple).toHaveBeenLastCalledWith("Toner Cocoon Sen!", "");
    await userEvent.selectOptions(screen.getByLabelText("Kiểu đổi theo tuần"), "cycle");
    expect(onSetVariant).toHaveBeenCalledWith({
      kind: "cycle", length: 2, weeks: [["Toner Cocoon Sen", ""], ["Toner Cocoon Sen", ""]],
    });
  });

  it("calls onRemove", async () => {
    const onRemove = vi.fn();
    render(<StepEditor display={display} raw={["Toner Cocoon Sen", ""]}
      onUpdateTuple={vi.fn()} onSetVariant={vi.fn()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: /xoá bước/i }));
    expect(onRemove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Implement `StepEditor.tsx`**

```tsx
import { useState } from "react";
import VariantEditor from "./VariantEditor";
import { isStepTuple, type RoutineStep } from "../shared/types";
import type { ResolvedStep } from "../shared/content";

export default function StepEditor({
  display,
  raw,
  onUpdateTuple,
  onSetVariant,
  onRemove,
}: {
  display: ResolvedStep;
  raw: RoutineStep;
  onUpdateTuple: (product: string, note: string) => void;
  onSetVariant: (next: RoutineStep) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="step-edit">
      <div className="step-edit-head">
        <button type="button" className="step-edit-toggle" aria-expanded={open}
          aria-label={`Sửa bước: ${display.product || "Bước chưa đặt tên"}`}
          onClick={() => setOpen((v) => !v)}>
          <span>{display.product || "Bước chưa đặt tên"}</span>
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
        <button type="button" aria-label="Xoá bước" onClick={onRemove}>×</button>
      </div>
      {open && (
        <VariantEditor
          value={raw}
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

- [ ] **Step 5: Run both test files**

Run: `npx vitest run src/components/VariantEditor.test.tsx src/components/StepEditor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Styles**

Append to `src/styles.css`: `.variant-editor` (grid, gap), `.variant-branch` (bordered group), `.step-edit-head` (flex row), `.step-edit-toggle` (full-width text-left button). Reuse existing variables. Short.

- [ ] **Step 7: Typecheck + full suite + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test`
Expected: green (components not wired into the tree yet).

- [ ] **Step 8: Commit**

```bash
git add src/components/VariantEditor.tsx src/components/VariantEditor.test.tsx \
  src/components/StepEditor.tsx src/components/StepEditor.test.tsx src/styles.css
git commit -m "feat(editor): VariantEditor (threshold/cycle branches) and StepEditor row"
```

---

## Task 10: Wire the editor into `CategorySection` and `DayPanel`

Makes the editor live. `CategorySection` gets the pencil toggle, the reset button, and builds the `onEdit` bundles from `editContent` + the Task 7 helpers. `DayPanel` renders `StepEditor` rows in edit mode.

**Files:**
- Modify: `src/components/CategorySection.tsx`
- Modify: `src/components/DayPanel.tsx`
- Test: `src/components/CategorySection.test.tsx`, `src/components/DayPanel.test.tsx` (extend)
- Modify: `src/styles.css` (pencil button, reset button)

**Interfaces:**
- Consumes: `renameProduct` / `removeProduct` / `addProduct` / `addStep` / `updateStepTuple` / `removeStep` / `setStepVariant` / `resetCategory` from `content.ts`; `getStoredDays` from `content.ts`; `GalleryEdit` from `Gallery`; `StepEditor` component; `AppStateContextValue["editContent"]`.
- Produces:
  - `type DayEdit = { onAddStep: (phase: StepPhase) => void; onUpdateStep: (phase: StepPhase, id: string, product: string, note: string) => void; onRemoveStep: (phase: StepPhase, id: string) => void; onSetVariant: (phase: StepPhase, id: string, variant: RoutineStep) => void }`
  - `DayPanel` props gain `editing?: boolean; onEdit?: DayEdit`
  - `CategorySection` renders a pencil `<button aria-pressed={editing}>` and, while editing, a reset button

- [ ] **Step 1: Extend `CategorySection.test.tsx`**

Add:

```tsx
import { AppStateProvider } from "../state/AppStateProvider";
// helper: render CategorySection inside a real provider so editContent writes land
```

```tsx
it("toggles edit mode with the pencil and hides the week strip + checkboxes", async () => {
  render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
  expect(screen.getByRole("group", { name: /Tiến độ tuần/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /chỉnh sửa nội dung/i }));
  expect(screen.queryByRole("group", { name: /Tiến độ tuần/ })).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByRole("button", { name: /đặt lại theo mặc định/i })).toBeInTheDocument();
});

it("exits edit mode when the category prop changes (remount via key in App)", () => {
  // App.tsx remounts CategorySection with key={activeCategory}; simulate by
  // re-rendering with a different key and asserting the pencil is back to
  // aria-pressed=false. (Covered structurally: editing is local useState.)
  const { rerender } = render(
    <CategorySection key="face" category="face" activeDay={0} onSelectDay={() => {}} {...stateProps} />,
  );
  rerender(<CategorySection key="hair" category="hair" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
  expect(screen.getByRole("button", { name: /chỉnh sửa nội dung/i })).toHaveAttribute("aria-pressed", "false");
});
```

`stateProps` (from Task 6) is `{ state: makeDefaultState(...), onToggleStep: () => {}, editContent: () => {} }`. For the toggle test, `editContent` can stay a no-op — the assertions are about local `editing` state and conditional rendering, not persistence.

- [ ] **Step 2: Implement `CategorySection.tsx`**

- `import { useState } from "react";`
- `import { addProduct, addStep, getCategoryData, removeProduct, removeStep, renameProduct, resetCategory, setStepVariant, updateStepTuple } from "../shared/content";`
- `const [editing, setEditing] = useState(false);`
- In the returned JSX, next to `<Hero />`, add:

```tsx
<button
  type="button"
  className="edit-toggle"
  aria-pressed={editing}
  aria-label="Chỉnh sửa nội dung"
  onClick={() => setEditing((v) => !v)}
>
  ✎
</button>
{editing && (
  <button
    type="button"
    className="reset-category"
    onClick={() => {
      if (window.confirm(`Đặt lại toàn bộ nội dung mục này về mặc định? Các thay đổi bạn đã tạo sẽ bị xoá.`)) {
        editContent((s) => resetCategory(s, category));
      }
    }}
  >
    Đặt lại theo mặc định
  </button>
)}
```

- Gallery:

```tsx
<Gallery
  products={data.products}
  editing={editing}
  onEdit={{
    onRename: (i, name) => editContent((s) => renameProduct(s, category, i, name)),
    onRemove: (i) => editContent((s) => removeProduct(s, category, i)),
    onAdd: () => editContent((s) => addProduct(s, category)),
  }}
/>
```

- WeekProgress: wrap in `{!editing && (<WeekProgress category={category} state={state} />)}`
- DayPanel:

```tsx
<DayPanel
  category={category}
  state={state}
  dayIndex={activeDay}
  onToggleStep={onToggleStep}
  editing={editing}
  onEdit={{
    onAddStep: (phase) => editContent((s) => addStep(s, category, activeDay, phase)),
    onUpdateStep: (phase, id, product, note) =>
      editContent((s) => updateStepTuple(s, category, activeDay, phase, id, product, note)),
    onRemoveStep: (phase, id) => editContent((s) => removeStep(s, category, activeDay, phase, id)),
    onSetVariant: (phase, id, variant) =>
      editContent((s) => setStepVariant(s, category, activeDay, phase, id, variant)),
  }}
/>
```

- `DayTabs` stays visible in edit mode (edit one day at a time).
- Note in a comment: `editing` resets on category switch for free because `App.tsx` remounts this component with `key={activeCategory}`.

- [ ] **Step 3: Extend `DayPanel.test.tsx`**

```tsx
it("edit mode: renders StepEditor rows, hides the count badge, shows add-step", async () => {
  const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn() };
  render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={onEdit} />);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull(); // no "2/5" badge
  const toggles = screen.getAllByRole("button", { name: /sửa bước/i });
  expect(toggles.length).toBeGreaterThan(0);
  await userEvent.click(screen.getAllByRole("button", { name: /thêm bước/i })[0]);
  expect(onEdit.onAddStep).toHaveBeenCalledWith("am");
});

it("edit mode: removing a step calls onRemoveStep with (phase, id)", async () => {
  const state = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
  const onEdit = { onAddStep: vi.fn(), onUpdateStep: vi.fn(), onRemoveStep: vi.fn(), onSetVariant: vi.fn() };
  render(<DayPanel category="face" state={state} dayIndex={0} onToggleStep={() => {}} now={WEEK1_NOW}
    editing onEdit={onEdit} />);
  await userEvent.click(screen.getAllByRole("button", { name: /xoá bước/i })[0]);
  expect(onEdit.onRemoveStep).toHaveBeenCalledWith("am", "face.0.am.0");
});
```

- [ ] **Step 4: Implement `DayPanel.tsx` edit mode**

- Props: add `editing = false`, `onEdit`.
- `import StepEditor from "./StepEditor";` and `import { getStoredDays, resolveDayForState, type ResolvedDay } from "../shared/content";`
- Compute both: `const resolved = resolveDayForState(state, category, dayIndex, week);` and `const storedDay = getStoredDays(state, category)[dayIndex];`
- Extract a helper that renders one phase's body:

```tsx
function PhaseBody({
  phase, resolvedSteps, storedSteps, editing, onEdit, ...checkoffProps
}) {
  if (editing && onEdit) {
    return (
      <>
        <ul className="steps steps-edit">
          {resolvedSteps.map((rs, i) => (
            <StepEditor
              key={rs.id}
              display={rs}
              raw={storedSteps[i].step}
              onUpdateTuple={(p, n) => onEdit.onUpdateStep(phase, rs.id, p, n)}
              onSetVariant={(v) => onEdit.onSetVariant(phase, rs.id, v)}
              onRemove={() => onEdit.onRemoveStep(phase, rs.id)}
            />
          ))}
        </ul>
        <button type="button" className="add-step" onClick={() => onEdit.onAddStep(phase)}>
          + Thêm bước
        </button>
      </>
    );
  }
  return (/* the existing read-only <ul className="steps"> with checkboxes */);
}
```

- In the `Card`, when `editing` pass `done`/`total` such that the badge is hidden — simplest: give `Card` an `editing?: boolean` prop and render `{!editing && <span className="card-progress">{done}/{total}</span>}`. Skip calling `phaseCompletion` at all when `editing`.
- Hair branch: same treatment for the single `steps` phase.
- The `resolvedSteps` / `storedSteps` for a phase come from `resolved` (`ResolvedDay`) and `storedDay` (`StoredDay`) — branch on `resolved.kind`.

- [ ] **Step 5: Run the two test files**

Run: `npx vitest run src/components/DayPanel.test.tsx src/components/CategorySection.test.tsx`
Expected: PASS (old assertions + new).

- [ ] **Step 6: Styles**

`src/styles.css`: `.edit-toggle` (small round button, top-right of `.hero`), `.reset-category` (subtle text button), `.steps-edit` (list reset), `.add-step` (dashed full-width). Reuse variables.

- [ ] **Step 7: Full suite + typecheck + build + constraints**

Run: `npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green. The editor is live.

- [ ] **Step 8: Commit**

```bash
git add src/components/CategorySection.tsx src/components/CategorySection.test.tsx \
  src/components/DayPanel.tsx src/components/DayPanel.test.tsx src/styles.css
git commit -m "feat(editor): pencil toggle, product + step editing wired through content helpers"
```

---

## Task 11: Docs and final verification

Update `CLAUDE.md` to describe the new seam and the retired trade-off, and run the whole gate one last time.

**Files:**
- Modify: `CLAUDE.md`
- No test file (docs + verification)

- [ ] **Step 1: Update `CLAUDE.md`**

Make these edits (search for the quoted anchors):

1. **"### Routine content and rendering"** — after the "Content is data, not markup" bullet, add:

   > - **Per-user edits live in `AppState.overrides`, resolved by `src/shared/content.ts`.** `routine.ts` is the shipped default; the first edit to a category (via the in-app editor) copies that category's `{ products, days }` into `overrides[category]` (copy-on-write, whole-category), and every later edit mutates the clone. `getCategoryData(state, category)` and `resolveDayForState(state, category, dayIndex, week)` are the single read seam — `CategorySection`, `progress.ts`, and the editor all go through them, never `routine[category]` directly. `content.ts` also holds the eight pure mutation helpers (`addProduct`, `renameProduct`, `removeProduct`, `addStep`, `updateStepTuple`, `removeStep`, `setStepVariant`, `resetCategory`) the editor calls via `useAppState().editContent(mutate)`.

2. **"Week-conditional steps live in `src/shared/schedule.ts`, not in `routine.ts`."** — replace that whole bullet with:

   > - **A step is a `RoutineStep`: a plain `[product, note]` tuple, or a `ConditionalStep`.** Two conditional kinds: `threshold` (`{ kind, untilWeek, before, from }` — `before` for program-weeks `1..untilWeek`, `from` after) and `cycle` (`{ kind, length: 2|4, weeks }` — indexed by `(week-1) % length`). `resolveStep(step, week)` in `src/shared/schedule.ts` collapses a `RoutineStep` to a `StepTuple`; `resolveDayForState` in `content.ts` maps a whole day. The two week-conditional face steps (Wednesday-AM Vitamin C→Niacinamide, Sunday-PM 2-week mask rotation) are authored directly as conditionals in `routine.ts` — `schedule.ts` no longer hardcodes them and no longer imports `routine.ts`.

3. **"### State and persistence"** — update the `completedSteps` paragraph. Replace:

   > `completedSteps` on `AppState` is a flat dated log of checked steps (`{ date, category, phase, stepIndex }`) ... Checks are keyed by calendar date + step index, not by resolved product, so editing `programStartDate` across the week-2/3 boundary can leave a checked slot showing the other week's product — the accepted positional-identity trade-off. `AppState` is `version: 2`; `migrate()` ... upgrades a v1 blob (adds `completedSteps: []`) ...

   with:

   > `completedSteps` on `AppState` is a flat dated log of checked steps (`{ date, category, stepId }`). Every step carries a stable id: default steps get a derived `${category}.${dayIndex}.${phase}.${index}`; an override freezes those ids at copy-on-write time and new steps get `${category}.${dayIndex}.${phase}.new-${n}` from the monotonic `AppState.stepSeq`. Because a conditional step keeps one id across weeks, a check-off survives the week-2→3 product swap (the old positional-identity trade-off is gone). The visible checkboxes are the entries whose `date` falls in the current Mon–Sun week; older entries stay in the log. `AppState` is `version: 3`; `migrate()` chains v1→v3 (`completedSteps: []`) and v2→v3 (remapping each old `{ phase, stepIndex }` to `${category}.${weekdayIndexOfIso(date)}.${phase}.${stepIndex}`), and is called on every untrusted read — the `localStorage` mirror, `fetchRemote`, and the Worker's `GET`. `isV1State` and `isV2State` are frozen snapshots; add future migrations as new arms.

4. **"## Out of scope here, and where later work attaches"** — update the status line and the "Deliberately not built yet" list: move "a content editor" out (it now exists — sub-project 3, `overrides` + `content.ts` + the inline pencil editor), keep the PWA manifest/service worker and push notifications as the remaining deferred pieces. Note the editor's own deferrals: **reordering** products/steps, editing day metadata (`short`/`full`/`focus`/`type`), and linking a gallery entry to the steps that name it.

- [ ] **Step 2: Run the whole gate**

Run: `npm run lint:constraints && npm run typecheck && npm run test && npm run build`
Expected: all green. Note the counts (`Test Files N passed`, `Tests M passed`).

- [ ] **Step 3: Manual click-through** (phone-width viewport, `npm run dev`)

Verify each, in the face category unless noted:

1. Pencil toggles edit mode; the week strip and checkboxes disappear; a "Đặt lại theo mặc định" button appears.
2. Gallery: rename a product (persists across a reload — check with `npm run worker:dev` + `VITE_WORKER_URL`, or just localStorage); add a product (blank row appended); remove a product.
3. Day steps: expand a step; edit its product and note; collapse; the collapsed label reflects the edit.
4. Add a step to AM and to PM; it appears at the end with an empty label; remove it.
5. Convert a plain step to `Đổi theo mốc tuần`: set `untilWeek` to 3, give the two branches different products; toggle edit off; change `programStartDate` (Settings) across the week-3 boundary and confirm the shown product switches.
6. Convert a step to `Luân phiên theo chu kỳ`, length 2, two products; confirm it alternates by week; switch length to 4 and confirm two blank branches appear.
7. Convert a conditional step back to `Không đổi theo tuần`; the first branch's product survives.
8. Check off a step in read mode; edit that same step's note; the check stays. Remove a different step; no crash; its old check-off (if any) is silently inert.
9. "Đặt lại theo mặc định" → confirm → all edits for that category revert; other categories' edits (if any) remain.
10. Hair category: the flat step list is editable the same way; no AM/PM.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: content editor — overrides seam, RoutineStep variants, v3 migration"
```

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Base branch is `feat/foundation-rebuild` (the repo's stated main-for-PRs branch); confirm before merging. This plan's branch is `feat/content-editor`.

---

## Notes for the executor

- **`window.confirm` in jsdom**: it returns `undefined` (falsy) by default in tests, so the reset-category test in Task 10 asserts only that the button exists, not that a stubbed confirm fired. If you want to assert the reset path, `vi.spyOn(window, "confirm").mockReturnValue(true)` and check `editContent` was called — optional.
- **`structuredClone`** is available in the jsdom + Node 20 test environment (used in the Task 3 tests).
- **Controlled inputs firing `onChange` per keystroke**: the helpers are pure and cheap, and `update()` debounces the `PUT` (500ms), so per-keystroke `editContent` is fine — no debouncing needed in the components. Do not add `useEffect`-based local input state "to optimize"; it reintroduces the render-tearing class of bug the state layer was designed to avoid.
- **No new deps, no `as`/`any`/`!`**: the `<select>`/`<input>` string→union narrowing in `VariantEditor` is done with plain functions (`toKind`, `coerceWeek`). If you hit a spot that feels like it needs a cast, the boundary type is probably wrong — check `types.ts` for an existing guard first.
- **Keep `isV1State` and `isV2State` frozen** — they must not call the current `isCompletedStep`/`isAppState`.
