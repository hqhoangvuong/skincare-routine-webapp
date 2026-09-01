# In-App Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [...]`)

**Goal:** Let the one user add / rename / remove products and steps, and add / remove week-conditional variant branches on a step, entirely from the phone UI — no editing `routine.ts` by hand.

**Architecture:** A step becomes a union (`RoutineStep`) of a plain `[product, note]` tuple plus two conditional forms (`threshold`, `cycle`). Content is resolved through one new seam, `src/shared/[...]

**Tech Stack:** React 18, Vite 5, TypeScript strict, Vitest + @testing-library/react (jsdom), Cloudflare Worker + KV (unchanged this sub-project).

**Spec:** `docs/superpowers/specs/2026-09-01-content-editor-spec.md`

## Global Constraints

- **Port, not redesign.** Every Vietnamese routine string is a product the user owns. This sub-project changes how content is stored and edited, never regenerates or paraphrases content. The two `[...]
- **No new dependencies.** Nothing added to `package.json`.
- **No `as` casts, no `any`, no `@ts-ignore` / `@ts-nocheck`, no non-null `!`** anywhere in `src/` or `worker/`, tests included. Narrow untrusted data with type predicates. `npm run lint:constrain[...]
- **TypeScript `strict: true`.** `npm run build` runs `typecheck` on both `tsconfig.json` and `tsconfig.worker.json` and fails on any error.
- **Timezone.** All date arithmetic stays pinned to `Asia/Ho_Chi_Minh` via `src/shared/date.ts` helpers. No bare `new Date().getDay()` / `.getDate()` etc. Use `weekdayIndexOfIso` for weekday-from-[...]
- **`src/shared/` is imported by both the frontend and the Worker.** Types, guards, routine content, and date helpers both need live there and are never duplicated.
- **Node 20** (`.nvmrc`; CI's only version). Local toolchain note: an official self-contained Node 20 is installed at `~/.local/node20`; prefix commands with `export PATH="$HOME/.local/node20/bin:[...]
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
| `src/shared/types.ts` | `AppState` shape + every guard both deployables share | `RoutineStep` union + variant types + guards; `StoredStep` / `StoredDay` / `CategoryOverride`; `AppState` v3; `isA[...]
| `src/shared/routine.ts` | The shipped routine content (ported data) | `faceDays[2].am[2]` and `faceDays[6].pm[3]` authored as `ConditionalStep`s; day arrays widen to `RoutineStep[]` |
| `src/shared/schedule.ts` | Resolve one step for a program week | delete the two constants + `withStep` + `resolveDay`; export only `resolveStep(step, week)` |
| `src/shared/content.ts` | **new** — the single content read seam + pure edit helpers | `getCategoryData`, `resolveDayForState` (+ `ResolvedStep`/`ResolvedDay`), id derivation, `ensureOverride`[...]
| `src/shared/progress.ts` | Check-off math | re-keyed off `stepId`; imports `resolveDayForState`; takes `state` |
| `src/shared/defaults.ts` | `makeDefaultState()` | `version: 3` |
| `src/state/AppStateProvider.tsx` | The one context components use | `toggleStep(category, dayIndex, stepId)`; new `editContent(mutate)` |
| `src/App.tsx` | Top-level layout | pass `state` (whole) + `editContent` to `CategorySection` |
| `src/components/CategorySection.tsx` | Per-category hero + gallery + tabs + panel | `state` prop; `editing` `useState`; pencil toggle; reset-to-default; thread `editing` + `onEdit` bundles down [...]
| `src/components/DayPanel.tsx` | The active day's cards | `state` prop; render via `ResolvedStep`; edit mode → `StepEditor` rows |
| `src/components/WeekProgress.tsx` | The week completion strip | `state` prop; hidden by parent in edit mode |
| `src/components/Gallery.tsx` | The product gallery | `editing` prop + `onEdit` bundle |
| `src/components/StepEditor.tsx` | **new** — one editable step row (expand on tap) | product / note inputs, variant selector, remove |
| `src/components/VariantEditor.tsx` | **new** — threshold / cycle branch editors | builds the next `RoutineStep`, kind + length switching |
| `CLAUDE.md` | Repo guidance | document `overrides` / `stepSeq` / v3 migration / `content.ts` seam / editor scope; drop the positional-identity trade-off paragraph |

**Task dependency order:** 1 → 2 → 3 → 4 → 5 → 6 (read-mode parity checkpoint — the app works exactly as before, just re-plumbed) → 7 → 8 → 9 → 10 (editor live) → 11 (docs + [...])

**Commit units.** Most tasks commit on their own. The exception is the v3 cutover: **Tasks 3, 4, 5 and 6 are one commit unit.** Changing `CompletedStep` from `{ phase, stepIndex }` to `{ stepId }`[...]

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

`isRecord` already exists in this file (used by `isAppState`). These guards must be declared after it — put them below the existing `isRecord` definition, or move `isRecord` up if ordering fights.

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

Add `resolveStep(step, week)` to `schedule.ts`, author `faceDays[2].am[2]` and `faceDays[6].pm[3]` as conditionals in `routine.ts`, and rewrite the existing `resolveDay` to map every step through[...]

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

{% raw %}
```ts
{kind:"threshold",untilWeek:2,
 before:["Serum Vitamin C — Cocoon Nghệ C22","Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide"],
 from:["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm tẩy da chết"]}
```
{% endraw %}

`src/shared/routine.ts` line 26 — replace the fourth PM entry of the `CN` (Sunday) face day. It currently reads:

```ts
["Mặt nạ Histolab Peppermint","Mặt nạ tuần lẻ trong chu kỳ 4 tuần"]
```

Replace with:

{% raw %}
```ts
{kind:"cycle",length:2,
 weeks:[["Mặt nạ Histolab Peppermint","Mặt nạ tuần lẻ trong chu kỳ 4 tuần"],
        ["Mặt nạ Histolab Natural White","Mặt nạ tuần chẵn trong chu kỳ 4 tuần"]]}
```
{% endraw %}

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

Note `resolveDay` now always returns a fresh object (it maps the arrays), so the old `schedule.test.ts` assertions that `resolveDay(...) === routine.face.days[0]` are gone by design.

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
Expected: PASS. Watch for other consumers of `resolveDay` — `src/shared/progress.ts` and `src/components/DayPanel.tsx` still import it; its signature and return type are unchanged, so they keep working.

- [ ] **Step 8: Commit**

```bash
git add src/shared/routine.ts src/shared/schedule.ts src/shared/types.ts src/shared/schedule.test.ts src/shared/routine.test.ts
git commit -m "feat(schedule): resolveStep over RoutineStep; author the two week-conditional face steps as data"
```

---

## Task 3: `AppState` v3 — overrides, stepSeq, stepId-keyed completedSteps, migration

The schema task. `CompletedStep` changes from `{ date, category, phase, stepIndex }` to `{ date, category, stepId }`. `AppState` adds `overrides?` and `stepSeq?` and becomes `version: 3`. Migration arms: v2→v3 maps the old `(phase, stepIndex)` pairs to positional stepIds via weekday; v1→v3 just starts fresh.

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
  - `type AppState = { version: 3; updatedAt: string; programStartDate: string; completedSteps: CompletedStep[]; overrides?: { face?: CategoryOverride; hair?: CategoryOverride; body?: CategoryOverride }; stepSeq?: number; ui: ... }`
  - `isStoredStep(v): v is StoredStep`, `isStoredDay(v): v is StoredDay`, `isCategoryOverride(v): v is CategoryOverride`
  - `isCompletedStep(v): v is CompletedStep` — v3 shape
  - `isAppState(v): v is AppState` — v3
  - `migrate(v: unknown): AppState | null` — v3 target, v2→v3 and v1→v3 arms
  - `StepPhase` and `isStepPhase` stay exported and unchanged (still used to name the three step lists and scope `phaseCompletion`).

The rest of this large task is documented in the plan source file itself. Refer to the GitHub repository for detailed implementation steps.

---

## Task 4: `content.ts` — the content read seam

New file. `getCategoryData` merges an override over the default; `resolveDayForState` produces a `ResolvedDay` of `{ id, product, note }` steps for a program week. **Read only** — mutation helpers come later.

The implementation details are documented in the plan source file.

