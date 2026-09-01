# Progress Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user check off individual routine steps for the current week, see per-card and per-week completion, and have the Wednesday-morning serum and Sunday-evening mask resolve automatically from the program week instead of a prose note.

**Architecture:** A new dated `completedSteps` array on `AppState` (version bumped 1→2, with a shared `migrate()` seam) rides the existing `useRemoteState` GET/PUT/localStorage path unchanged. Two new pure shared modules — `schedule.ts` (week-conditional content) and `progress.ts` (check-off math) — sit beside `date.ts`, which gains pure week-number helpers. Components stay prop-driven: `App` reads context and drills `completedSteps` / `programStartDate` / `toggleStep` down through `CategorySection` to `DayPanel` and the new `WeekProgress` strip.

**Tech Stack:** React 18 + TypeScript (`strict`), Vite 5, Vitest 2 + `@testing-library/react`, Cloudflare Worker (modules format), plain CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-progress-tracking-spec.md` (read it alongside this plan — the plan argues from it).

## Global Constraints

- **No `as` casts, no `any`, no `!` non-null assertions, no `@ts-ignore`/`@ts-nocheck`** anywhere in `src/` or `worker/`, tests included. `npm run lint:constraints` greps for these and CI runs it. The only allowed cast line is the existing `as Record<string, unknown>` inside `isAppState`. Narrow untrusted data with type predicates instead.
- **Node 20** is the only version CI builds with.
- **All date arithmetic pinned to `Asia/Ho_Chi_Minh`** via `src/shared/date.ts`. New helpers that take a date-only ISO string need no timezone handling (the weekday of `"2026-09-03"` is unambiguous); helpers that take a `Date` must go through the existing `todayIso` / `weekdayIndex`. Every "what day is it" helper keeps an optional `now: Date = new Date()` (or `nowIso: string`) parameter for deterministic tests — do not remove it.
- **`src/shared/` is imported by both the frontend and the Worker.** Anything added there must typecheck under both `tsconfig.json` and `tsconfig.worker.json` (run `npm run typecheck`). `tsconfig.worker.json` excludes `**/*.test.ts`.
- **Routine content is sacred.** Only the two `StepTuple`s named in Task 3 change, with the exact strings given. Do not touch any other routine string or the `FaceExtras` prose.
- **`npm run test`** runs `lint:constraints` then `vitest run` (frontend + worker in one suite). Every task ends green.
- Commit after every task with a `feat:` / `test:` / `refactor:` message. Work on branch `feat/progress-tracking` (already checked out).

---

### Task 1: Week-number date helpers

**Files:**
- Modify: `src/shared/date.ts` (append six exported functions; do not change `todayIso` / `weekdayIndex`)
- Test: `src/shared/date.test.ts` (append a describe block per helper)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `weekdayIndexOfIso(iso: string): number` — 0 = Mon .. 6 = Sun
  - `addDaysIso(iso: string, days: number): string` — `"YYYY-MM-DD"`, `days` may be negative
  - `mondayIsoOf(iso: string): string`
  - `programWeek(startIso: string, nowIso: string): number` — 1-based, min 1
  - `weekCyclePosition(startIso: string, nowIso: string): number` — 1..4
  - `weekdayDateIso(dayIndex: number, nowIso: string): string`

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/date.test.ts`:

```ts
import {
  addDaysIso,
  mondayIsoOf,
  programWeek,
  weekCyclePosition,
  weekdayDateIso,
  weekdayIndexOfIso,
} from "./date";

describe("weekdayIndexOfIso", () => {
  it("returns 0 for a Monday and 6 for a Sunday", () => {
    expect(weekdayIndexOfIso("2026-08-31")).toBe(0); // Monday
    expect(weekdayIndexOfIso("2026-09-06")).toBe(6); // Sunday
  });
});

describe("addDaysIso", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("mondayIsoOf", () => {
  it("snaps any weekday back to its Monday", () => {
    expect(mondayIsoOf("2026-09-02")).toBe("2026-08-31"); // Wed -> Mon
    expect(mondayIsoOf("2026-08-31")).toBe("2026-08-31"); // Mon -> itself
    expect(mondayIsoOf("2026-09-06")).toBe("2026-08-31"); // Sun -> Mon
  });
});

describe("programWeek", () => {
  it("is week 1 for any day in the start date's Mon-Sun week", () => {
    // 2026-08-26 is a Wednesday; its week is 2026-08-24..30
    expect(programWeek("2026-08-26", "2026-08-24")).toBe(1);
    expect(programWeek("2026-08-26", "2026-08-30")).toBe(1);
  });
  it("flips on Mondays", () => {
    expect(programWeek("2026-08-26", "2026-08-31")).toBe(2);
    expect(programWeek("2026-08-26", "2026-09-14")).toBe(4);
  });
  it("clamps a now before the start date to 1", () => {
    expect(programWeek("2026-08-26", "2026-08-01")).toBe(1);
  });
});

describe("weekCyclePosition", () => {
  it("cycles 1,2,3,4,1,2,... by program week", () => {
    const start = "2026-08-24"; // a Monday
    expect(weekCyclePosition(start, "2026-08-24")).toBe(1);
    expect(weekCyclePosition(start, "2026-08-31")).toBe(2);
    expect(weekCyclePosition(start, "2026-09-14")).toBe(4);
    expect(weekCyclePosition(start, "2026-09-21")).toBe(1);
  });
});

describe("weekdayDateIso", () => {
  it("returns the date of the given weekday within now's week", () => {
    expect(weekdayDateIso(0, "2026-09-02")).toBe("2026-08-31"); // Monday of that week
    expect(weekdayDateIso(2, "2026-09-02")).toBe("2026-09-02"); // Wednesday
    expect(weekdayDateIso(6, "2026-09-02")).toBe("2026-09-06"); // Sunday
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/date.test.ts`
Expected: FAIL — imports not exported.

- [ ] **Step 3: Implement**

Append to `src/shared/date.ts`:

```ts
/**
 * 0 = Mon .. 6 = Sun for a date-only ISO string. No timezone is involved: the
 * weekday of "2026-09-03" is the same everywhere, so this stays off the
 * Intl/TZ path the Date-taking helpers above use.
 */
export function weekdayIndexOfIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** `iso` shifted by `days` (may be negative), formatted "YYYY-MM-DD". */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** ISO date of the Monday of `iso`'s week. */
export function mondayIsoOf(iso: string): string {
  return addDaysIso(iso, -weekdayIndexOfIso(iso));
}

/**
 * 1-based program week: week 1 is the Mon-Sun week containing `startIso`, and
 * the number flips every Monday. Clamped to a minimum of 1, so a `nowIso`
 * before `startIso` still reads as week 1.
 */
export function programWeek(startIso: string, nowIso: string): number {
  const [sy, sm, sd] = mondayIsoOf(startIso).split("-").map(Number);
  const [ny, nm, nd] = mondayIsoOf(nowIso).split("-").map(Number);
  const diffDays = (Date.UTC(ny, nm - 1, nd) - Date.UTC(sy, sm - 1, sd)) / 86_400_000;
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/** Position in the repeating 4-week cycle: 1, 2, 3, 4, 1, 2, ... */
export function weekCyclePosition(startIso: string, nowIso: string): number {
  return ((programWeek(startIso, nowIso) - 1) % 4) + 1;
}

/** ISO date of weekday `dayIndex` (0 = Mon) within `nowIso`'s week. */
export function weekdayDateIso(dayIndex: number, nowIso: string): string {
  return addDaysIso(mondayIsoOf(nowIso), dayIndex);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/shared/date.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/shared/date.ts src/shared/date.test.ts
git commit -m "feat(date): program-week and ISO-date helpers"
```

---

### Task 2: `AppState` v2 — `completedSteps`, guards, `migrate()`

**Files:**
- Modify: `src/shared/types.ts` (add types + guards + `migrate`; bump `isAppState` to v2)
- Modify: `src/shared/defaults.ts` (`version: 2`, `completedSteps: []`)
- Create: `src/shared/types.test.ts`
- Modify: `src/state/storage.test.ts` (two existing assertions break on the v2 bump — fix them here)
- Modify: `worker/handlers.test.ts` (one existing assertion + one test title break — fix them here)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type StepPhase = "am" | "pm" | "steps"`
  - `type CompletedStep = { date: string; category: Category; phase: StepPhase; stepIndex: number }`
  - `isCompletedStep(value: unknown): value is CompletedStep`
  - `isAppState(value: unknown): value is AppState` — now requires `version === 2` and a valid `completedSteps` array
  - `migrate(value: unknown): AppState | null` — v2 passthrough, v1→v2 upgrade (adds `completedSteps: []`), else `null`
  - `AppState` now has `version: 2` and `completedSteps: CompletedStep[]`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { isAppState, isCompletedStep, migrate } from "./types";

const v2 = makeDefaultState(new Date("2026-08-24T00:00:00Z"));

describe("isCompletedStep", () => {
  it("accepts a well-formed entry", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face", phase: "am", stepIndex: 2 })).toBe(true);
  });
  it("rejects a bad phase, a missing date, a non-number index, a bad category", () => {
    expect(isCompletedStep({ date: "2026-09-02", category: "face", phase: "night", stepIndex: 0 })).toBe(false);
    expect(isCompletedStep({ category: "face", phase: "am", stepIndex: 0 })).toBe(false);
    expect(isCompletedStep({ date: "2026-09-02", category: "face", phase: "am", stepIndex: "0" })).toBe(false);
    expect(isCompletedStep({ date: "2026-09-02", category: "nails", phase: "am", stepIndex: 0 })).toBe(false);
    expect(isCompletedStep(null)).toBe(false);
  });
});

describe("isAppState (v2)", () => {
  it("accepts a default state", () => {
    expect(isAppState(v2)).toBe(true);
  });
  it("rejects a v1-shaped blob", () => {
    const { completedSteps: _drop, ...rest } = v2;
    expect(isAppState({ ...rest, version: 1 })).toBe(false);
  });
  it("rejects a non-array completedSteps and a bad element", () => {
    expect(isAppState({ ...v2, completedSteps: {} })).toBe(false);
    expect(isAppState({ ...v2, completedSteps: [{ date: "x", category: "face", phase: "am" }] })).toBe(false);
  });
});

describe("migrate", () => {
  it("passes a valid v2 state through unchanged", () => {
    expect(migrate(v2)).toEqual(v2);
  });
  it("upgrades a v1 blob by adding an empty completedSteps", () => {
    const { completedSteps: _drop, ...rest } = v2;
    const v1 = { ...rest, version: 1 };
    expect(migrate(v1)).toEqual({ ...v1, version: 2, completedSteps: [] });
  });
  it("returns null for something that is neither", () => {
    expect(migrate({ hello: "world" })).toBeNull();
    expect(migrate({ version: 1 })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/types.test.ts`
Expected: FAIL — `isCompletedStep` / `migrate` not exported; `isAppState(v2)` false because `makeDefaultState` is still v1.

- [ ] **Step 3: Implement the type + guard changes**

In `src/shared/types.ts`:

1. Add after the `StepTuple` type:

```ts
export type StepPhase = "am" | "pm" | "steps";

const STEP_PHASES: readonly StepPhase[] = ["am", "pm", "steps"];

export type CompletedStep = {
  date: string; // ISO date of the routine day this step belongs to
  category: Category;
  phase: StepPhase;
  stepIndex: number;
};
```

2. Change `AppState`:

```ts
export type AppState = {
  version: 2;
  /** ISO timestamp of the last local mutation; drives mount-time reconciliation. */
  updatedAt: string;
  /** ISO date, e.g. "2026-08-24". */
  programStartDate: string;
  /** Every checked step, as a dated log. Unordered; treated as a set. No cap. */
  completedSteps: CompletedStep[];
  ui: {
    activeCategory: Category;
    activeDayByCategory: Record<Category, number>;
  };
};
```

3. Add guards below `isActiveDayByCategory`:

```ts
function isStepPhase(value: unknown): value is StepPhase {
  return STEP_PHASES.some((phase) => phase === value);
}

export function isCompletedStep(value: unknown): value is CompletedStep {
  if (!isRecord(value)) return false;
  return (
    typeof value.date === "string" &&
    isCategory(value.category) &&
    isStepPhase(value.phase) &&
    typeof value.stepIndex === "number"
  );
}
```

4. In `isAppState`, change `v.version === 1` to `v.version === 2` and add the `completedSteps` checks:

```ts
  return (
    v.version === 2 &&
    typeof v.updatedAt === "string" &&
    typeof v.programStartDate === "string" &&
    Array.isArray(v.completedSteps) &&
    v.completedSteps.every(isCompletedStep) &&
    isRecord(v.ui) &&
    isCategory(v.ui.activeCategory) &&
    isActiveDayByCategory(v.ui.activeDayByCategory)
  );
```

5. Add the migration seam at the end of the file:

```ts
type V1State = Omit<AppState, "version" | "completedSteps"> & { version: 1 };

/**
 * A frozen snapshot of the v1 shape (this is intentionally a near-duplicate of
 * the pre-v2 `isAppState` body — it must NOT track future `isAppState` changes).
 */
function isV1State(value: unknown): value is V1State {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.updatedAt === "string" &&
    typeof value.programStartDate === "string" &&
    isRecord(value.ui) &&
    isCategory(value.ui.activeCategory) &&
    isActiveDayByCategory(value.ui.activeDayByCategory)
  );
}

/**
 * Upgrades an untrusted stored blob to the current `AppState` shape, or returns
 * null if it is neither a current state nor a recognisable older one. The one
 * place version migrations live; both deployables call it on every untrusted
 * read (localStorage mirror, Worker GET, remote fetch body).
 */
export function migrate(value: unknown): AppState | null {
  if (isAppState(value)) return value;
  if (isV1State(value)) {
    return {
      version: 2,
      updatedAt: value.updatedAt,
      programStartDate: value.programStartDate,
      completedSteps: [],
      ui: value.ui,
    };
  }
  return null;
}
```

- [ ] **Step 4: Update `defaults.ts`**

```ts
export function makeDefaultState(now: Date = new Date()): AppState {
  return {
    version: 2,
    updatedAt: now.toISOString(),
    programStartDate: todayIso(now),
    completedSteps: [],
    ui: {
      activeCategory: "face",
      activeDayByCategory: { face: 0, hair: 0, body: 0 },
    },
  };
}
```

- [ ] **Step 5: Fix the two existing suites the v2 bump breaks**

In `src/state/storage.test.ts`:
- The test `"returns null for a stored blob with the wrong version"` currently uses `version: 2` as the "wrong" version. Change it to `99`:
  ```ts
  localStorage.setItem(MIRROR_KEY, JSON.stringify({ ...state, version: 99 }));
  ```
- The test `"falls back to a default when neither exists"` asserts `result.state.version).toBe(1)`. Change to `toBe(2)`.

In `worker/handlers.test.ts`:
- `"seeds KV with a default state on first read"` asserts `expect(body).toMatchObject({ version: 1 })`. Change to `{ version: 2 }`.
- Rename the test `"rejects a body that is not a version 1 state"` to `"rejects a body that is not a version 2 state"` (its body — `{ hello: "world" }` → 400 — is unchanged).

- [ ] **Step 6: Run the full suite**

Run: `npm run test`
Expected: PASS. `src/shared/types.test.ts` green; `storage.test.ts` and `worker/handlers.test.ts` green with the edits; nothing else regressed. (`useRemoteState.test.ts` uses `{ ...makeDefaultState() }` and its `programStartDate`-only assertions still hold — it goes v2 automatically.)

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck
git add src/shared/types.ts src/shared/defaults.ts src/shared/types.test.ts src/state/storage.test.ts worker/handlers.test.ts
git commit -m "feat(state): AppState v2 with completedSteps and a migrate() seam"
```

---

### Task 3: Move the week-conditional prose out of `routine.ts`

**Files:**
- Modify: `src/shared/routine.ts` (exactly two `StepTuple`s)
- Modify: `src/shared/routine.test.ts` (the `"preserves the week-1-2 Niacinamide note"` test now asserts the opposite; add a Sunday-mask assertion)

**Interfaces:**
- Consumes: nothing.
- Produces: `routine` with the steady-state (week 3+) form of `faceDays[2].am[2]` and `faceDays[6].pm[3]`. Task 4 patches weeks 1–2 / the mask rotation back on.

- [ ] **Step 1: Update the failing test to the new expectation**

In `src/shared/routine.test.ts`, replace the test `"preserves the week-1-2 Niacinamide note on Wednesday morning"` with:

```ts
it("keeps Wednesday morning on the steady-state Niacinamide serum (the week rule now lives in schedule.ts)", () => {
  const wednesday = routine.face.days[2];
  if (isHairDay(wednesday)) throw new Error("expected a face day");
  expect(wednesday.am[2][0]).toBe("Serum Niacinamide 15% — Cocoon");
  expect(wednesday.am.map((s) => s[1]).join(" ")).not.toContain("Tuần");
});

it("keeps Sunday evening on the odd-week mask (the rotation now lives in schedule.ts)", () => {
  const sunday = routine.face.days[6];
  if (isHairDay(sunday)) throw new Error("expected a face day");
  expect(sunday.pm[3][0]).toBe("Mặt nạ Histolab Peppermint");
  expect(sunday.pm.map((s) => s[1]).join(" ")).not.toContain("Tuần 2&4");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/routine.test.ts`
Expected: FAIL — the current strings still contain "Tuần …".

- [ ] **Step 3: Edit `routine.ts`**

In `faceDays`, day index 2 (`{short:"T4",...}`), `am` array, **third entry** — replace:

```
["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm tẩy da chết — áp dụng từ Tuần 3 (Tuần 1–2 vẫn dùng Vitamin C)"]
```

with:

```
["Serum Niacinamide 15% — Cocoon","Hỗ trợ hàng rào da trước đêm tẩy da chết"]
```

In `faceDays`, day index 6 (`{short:"CN",...}`), `pm` array, **fourth entry** — replace:

```
["Mặt nạ luân phiên theo tuần","Tuần 1&3: Histolab Peppermint · Tuần 2&4: Histolab Natural White"]
```

with:

```
["Mặt nạ Histolab Peppermint","Mặt nạ tuần lẻ trong chu kỳ 4 tuần"]
```

Change nothing else in the file.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/routine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/routine.ts src/shared/routine.test.ts
git commit -m "refactor(routine): lift the week-conditional prose out of the two face steps"
```

---

### Task 4: `schedule.ts` — `resolveDay`

**Files:**
- Create: `src/shared/schedule.ts`
- Create: `src/shared/schedule.test.ts`

**Interfaces:**
- Consumes: `routine` (`./routine`), `isHairDay` / `Category` / `DayData` / `FaceOrBodyDay` / `StepTuple` (`./types`).
- Produces: `resolveDay(category: Category, dayIndex: number, week: number): DayData` — the routine day with week-conditional steps substituted; returns the routine entry unchanged (same reference) for every non-conditional case.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { routine } from "./routine";
import { resolveDay } from "./schedule";
import { isHairDay } from "./types";

function faceDay(dayIndex: number, week: number) {
  const day = resolveDay("face", dayIndex, week);
  if (isHairDay(day)) throw new Error("expected a face day");
  return day;
}

describe("resolveDay — Wednesday AM serum", () => {
  it("is Vitamin C in weeks 1 and 2", () => {
    for (const week of [1, 2]) {
      expect(faceDay(2, week).am[2][0]).toBe("Serum Vitamin C — Cocoon Nghệ C22");
      expect(faceDay(2, week).am[2][1]).toContain("Tuần 1–2");
    }
  });
  it("is Niacinamide from week 3 on", () => {
    for (const week of [3, 4, 7]) {
      expect(faceDay(2, week).am[2][0]).toBe("Serum Niacinamide 15% — Cocoon");
    }
  });
});

describe("resolveDay — Sunday PM mask", () => {
  it("is Peppermint on odd cycle weeks (1, 3, 5, 7)", () => {
    for (const week of [1, 3, 5, 7]) {
      expect(faceDay(6, week).pm[3][0]).toBe("Mặt nạ Histolab Peppermint");
    }
  });
  it("is Natural White on even cycle weeks (2, 4, 6, 8)", () => {
    for (const week of [2, 4, 6, 8]) {
      expect(faceDay(6, week).pm[3][0]).toBe("Mặt nạ Histolab Natural White");
    }
  });
});

describe("resolveDay — everything else is untouched", () => {
  it("returns the exact routine object for a non-conditional face day", () => {
    expect(resolveDay("face", 0, 1)).toBe(routine.face.days[0]);
    expect(resolveDay("face", 2, 5)).toBe(routine.face.days[2]); // week 3+ Wednesday = steady state
  });
  it("never rewrites hair or body days", () => {
    expect(resolveDay("hair", 2, 1)).toBe(routine.hair.days[2]);
    expect(resolveDay("body", 6, 2)).toBe(routine.body.days[6]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/schedule.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/shared/schedule.ts`**

```ts
import { routine } from "./routine";
import { isHairDay, type Category, type DayData, type FaceOrBodyDay, type StepTuple } from "./types";

const WEEKS_1_2_WEDNESDAY_AM: StepTuple = [
  "Serum Vitamin C — Cocoon Nghệ C22",
  "Giai đoạn làm quen (Tuần 1–2) — Thứ 4 vẫn dùng Vitamin C, chưa chuyển sang Niacinamide",
];

const EVEN_CYCLE_SUNDAY_PM: StepTuple = [
  "Mặt nạ Histolab Natural White",
  "Mặt nạ tuần chẵn trong chu kỳ 4 tuần",
];

function withStep(day: FaceOrBodyDay, phase: "am" | "pm", index: number, step: StepTuple): FaceOrBodyDay {
  const next = [...day[phase]];
  next[index] = step;
  return phase === "am" ? { ...day, am: next } : { ...day, pm: next };
}

/**
 * The routine day for (category, dayIndex), with week-conditional steps
 * substituted. `routine.ts` holds the steady-state (week 3+) form; this patches
 * weeks 1–2 and the 4-week mask rotation on top. `week` is the 1-based program
 * week (from `programWeek`). Returns the routine entry unchanged — same object
 * reference — for every non-conditional case.
 */
export function resolveDay(category: Category, dayIndex: number, week: number): DayData {
  const day = routine[category].days[dayIndex];
  if (category !== "face" || isHairDay(day)) return day;

  // Wednesday (index 2) AM serum: Vitamin C in weeks 1–2, Niacinamide from week 3.
  if (dayIndex === 2 && week <= 2) {
    return withStep(day, "am", 2, WEEKS_1_2_WEDNESDAY_AM);
  }

  // Sunday (index 6) PM mask: Peppermint on odd cycle weeks, Natural White on even.
  const cyclePosition = ((week - 1) % 4) + 1;
  if (dayIndex === 6 && (cyclePosition === 2 || cyclePosition === 4)) {
    return withStep(day, "pm", 3, EVEN_CYCLE_SUNDAY_PM);
  }

  return day;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/shared/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (both configs — this is a `src/shared/` module) + commit**

```bash
npm run typecheck
git add src/shared/schedule.ts src/shared/schedule.test.ts
git commit -m "feat(schedule): resolveDay() for the week-conditional face steps"
```

---

### Task 5: `progress.ts` — check-off math

**Files:**
- Create: `src/shared/progress.ts`
- Create: `src/shared/progress.test.ts`

**Interfaces:**
- Consumes: `programWeek` / `weekdayDateIso` (`./date`), `resolveDay` (`./schedule`), `isHairDay` / `AppState` / `Category` / `CompletedStep` / `StepPhase` (`./types`).
- Produces:
  - `toggleCompletedStep(state: AppState, target: CompletedStep): AppState` — pure; adds `target` if absent, removes it if present; does not touch `updatedAt`
  - `isStepDone(completed: CompletedStep[], category: Category, dayIndex: number, phase: StepPhase, stepIndex: number, nowIso: string): boolean`
  - `phaseCompletion(completed: CompletedStep[], programStartDate: string, category: Category, dayIndex: number, phase: StepPhase, nowIso: string): { done: number; total: number }`
  - `dayCompletion(completed: CompletedStep[], programStartDate: string, category: Category, dayIndex: number, nowIso: string): { done: number; total: number }`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeDefaultState } from "./defaults";
import { dayCompletion, isStepDone, phaseCompletion, toggleCompletedStep } from "./progress";
import type { CompletedStep } from "./types";

const START = "2026-08-24"; // Monday, program week 1
const NOW = "2026-08-26"; // Wednesday of week 1

const wednesdayAm0: CompletedStep = { date: "2026-08-26", category: "face", phase: "am", stepIndex: 0 };

describe("toggleCompletedStep", () => {
  it("adds an absent entry and removes a present one", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const added = toggleCompletedStep(base, wednesdayAm0);
    expect(added.completedSteps).toEqual([wednesdayAm0]);
    const removed = toggleCompletedStep(added, wednesdayAm0);
    expect(removed.completedSteps).toEqual([]);
  });
  it("does not mutate the input or its updatedAt", () => {
    const base = makeDefaultState(new Date("2026-08-24T00:00:00Z"));
    const out = toggleCompletedStep(base, wednesdayAm0);
    expect(base.completedSteps).toEqual([]);
    expect(out.updatedAt).toBe(base.updatedAt);
  });
});

describe("isStepDone", () => {
  it("matches by date derived from dayIndex + nowIso", () => {
    expect(isStepDone([wednesdayAm0], "face", 2, "am", 0, NOW)).toBe(true);
    expect(isStepDone([wednesdayAm0], "face", 2, "am", 1, NOW)).toBe(false);
    // same slot, a different week -> different date -> not done
    expect(isStepDone([wednesdayAm0], "face", 2, "am", 0, "2026-09-02")).toBe(false);
  });
});

describe("phaseCompletion / dayCompletion", () => {
  it("counts done vs the resolved phase length", () => {
    const completed: CompletedStep[] = [
      { date: "2026-08-26", category: "face", phase: "am", stepIndex: 0 },
      { date: "2026-08-26", category: "face", phase: "am", stepIndex: 1 },
    ];
    const c = phaseCompletion(completed, START, "face", 2, "am", NOW);
    expect(c.done).toBe(2);
    expect(c.total).toBe(5); // Wednesday AM has 5 steps
  });
  it("dayCompletion sums am + pm for a face day", () => {
    const c = dayCompletion([], START, "face", 2, NOW);
    expect(c.done).toBe(0);
    expect(c.total).toBeGreaterThan(5); // 5 AM + the PM steps
  });
  it("dayCompletion uses the flat steps list for a hair day", () => {
    const hairNow = "2026-08-25"; // Tuesday of week 1
    const c = dayCompletion([], START, "hair", 1, hairNow);
    expect(c.total).toBe(2); // hair Tuesday has 2 steps
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/progress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/shared/progress.ts`**

```ts
import { programWeek, weekdayDateIso } from "./date";
import { resolveDay } from "./schedule";
import { isHairDay, type AppState, type Category, type CompletedStep, type StepPhase } from "./types";

function sameStep(a: CompletedStep, b: CompletedStep): boolean {
  return (
    a.date === b.date &&
    a.category === b.category &&
    a.phase === b.phase &&
    a.stepIndex === b.stepIndex
  );
}

/**
 * Add `target` if no equal entry exists, remove it if one does. Pure. Does not
 * stamp `updatedAt` — the caller's `update()` does that.
 */
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
  phase: StepPhase,
  stepIndex: number,
  nowIso: string,
): boolean {
  const date = weekdayDateIso(dayIndex, nowIso);
  return completed.some((entry) => sameStep(entry, { date, category, phase, stepIndex }));
}

function phaseLength(category: Category, dayIndex: number, phase: StepPhase, week: number): number {
  const day = resolveDay(category, dayIndex, week);
  if (isHairDay(day)) return phase === "steps" ? day.steps.length : 0;
  if (phase === "am") return day.am.length;
  if (phase === "pm") return day.pm.length;
  return 0;
}

export function phaseCompletion(
  completed: CompletedStep[],
  programStartDate: string,
  category: Category,
  dayIndex: number,
  phase: StepPhase,
  nowIso: string,
): { done: number; total: number } {
  const week = programWeek(programStartDate, nowIso);
  const total = phaseLength(category, dayIndex, phase, week);
  const date = weekdayDateIso(dayIndex, nowIso);
  let done = 0;
  for (let i = 0; i < total; i += 1) {
    if (completed.some((entry) => sameStep(entry, { date, category, phase, stepIndex: i }))) {
      done += 1;
    }
  }
  return { done, total };
}

export function dayCompletion(
  completed: CompletedStep[],
  programStartDate: string,
  category: Category,
  dayIndex: number,
  nowIso: string,
): { done: number; total: number } {
  const week = programWeek(programStartDate, nowIso);
  const day = resolveDay(category, dayIndex, week);
  const phases: StepPhase[] = isHairDay(day) ? ["steps"] : ["am", "pm"];
  let done = 0;
  let total = 0;
  for (const phase of phases) {
    const c = phaseCompletion(completed, programStartDate, category, dayIndex, phase, nowIso);
    done += c.done;
    total += c.total;
  }
  return { done, total };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/shared/progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + commit**

```bash
npm run typecheck
npm run test
git add src/shared/progress.ts src/shared/progress.test.ts
git commit -m "feat(progress): toggle + completion-count helpers"
```

---

### Task 6: Route untrusted reads through `migrate()`

**Files:**
- Modify: `src/state/storage.ts` (`readMirror` uses `migrate`)
- Modify: `src/state/useRemoteState.ts` (`fetchRemote` uses `migrate`; update the adjacent comment)
- Modify: `src/state/storage.test.ts` (add a v1-upgrade test)
- Modify: `src/state/useRemoteState.test.ts` (add a v1-remote-body-upgrade test)

**Interfaces:**
- Consumes: `migrate` (`../shared/types`).
- Produces: no new exports. `readMirror` and a successful `fetchRemote` now return a migrated (v2) `AppState`; a v1 body is upgraded rather than reported `"invalid"`.

- [ ] **Step 1: Write the failing tests**

In `src/state/storage.test.ts`, add inside `describe("mirror", ...)`:

```ts
it("upgrades a stored v1 blob to v2 on read", () => {
  const v1 = {
    version: 1,
    updatedAt: "2026-08-30T10:00:00.000Z",
    programStartDate: "2026-08-24",
    ui: { activeCategory: "face", activeDayByCategory: { face: 1, hair: 2, body: 0 } },
  };
  localStorage.setItem(MIRROR_KEY, JSON.stringify(v1));
  const read = readMirror();
  expect(read).not.toBeNull();
  expect(read?.version).toBe(2);
  expect(read?.completedSteps).toEqual([]);
  expect(read?.ui.activeDayByCategory.hair).toBe(2);
});
```

In `src/state/useRemoteState.test.ts`, add a test near the "repairs a corrupt remote blob" one:

```ts
it("upgrades a v1 remote body instead of treating it as invalid", async () => {
  const v1 = {
    version: 1,
    updatedAt: "2026-08-30T10:00:00.000Z",
    programStartDate: "2026-08-24",
    ui: { activeCategory: "face", activeDayByCategory: { face: 0, hair: 0, body: 0 } },
  };
  const fetchSpy = mockFetch(async (_url, init) =>
    init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(v1),
  );
  const { result } = renderHook(() => useRemoteState());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.state.version).toBe(2);
  expect(result.current.state.completedSteps).toEqual([]);
  // A v1 body is valid-after-migrate, so this is NOT the corrupt-blob repair
  // path: no forced PUT, status stays synced.
  const puts = fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(puts).toHaveLength(0);
  expect(result.current.status).toBe("synced");
});
```

> Note: if `mockFetch` / `jsonResponse` helper names differ in the file, match the existing ones — check the top of `useRemoteState.test.ts`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/state/storage.test.ts src/state/useRemoteState.test.ts`
Expected: FAIL — `readMirror` returns `null` for the v1 blob (old `isAppState` path); the remote v1 body is reported `"invalid"` and triggers a repair PUT.

- [ ] **Step 3: Implement**

In `src/state/storage.ts`:
- Change the import `import { isAppState, type AppState } from "../shared/types";` to `import { migrate, type AppState } from "../shared/types";`.
- In `readMirror`, replace `return isAppState(parsed) ? parsed : null;` with `return migrate(parsed);`.

In `src/state/useRemoteState.ts`:
- Change `import { isAppState, type AppState, type SyncStatus } from "../shared/types";` to `import { migrate, type AppState, type SyncStatus } from "../shared/types";`.
- In `fetchRemote`, replace:
  ```ts
  const body: unknown = await response.json();
  return isAppState(body) ? { ok: true, state: body } : { ok: "invalid" };
  ```
  with:
  ```ts
  const body: unknown = await response.json();
  const migrated = migrate(body);
  return migrated ? { ok: true, state: migrated } : { ok: "invalid" };
  ```
- Update the doc comment above `type RemoteResult` — the `"invalid"` case is now "reached the Worker, body is neither a current state nor an upgradable older one"; a v1 body is upgraded, not rejected.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/state/storage.test.ts src/state/useRemoteState.test.ts`
Expected: PASS (new tests + all existing).

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
npm run test
npm run typecheck
git add src/state/storage.ts src/state/useRemoteState.ts src/state/storage.test.ts src/state/useRemoteState.test.ts
git commit -m "feat(state): upgrade v1 blobs through migrate() on every untrusted read"
```

---

### Task 7: Worker `GET /state` upgrades and persists an old blob

**Files:**
- Modify: `worker/handlers.ts` (the `GET` branch)
- Modify: `worker/handlers.test.ts` (add two tests)

**Interfaces:**
- Consumes: `migrate` (`../src/shared/types`).
- Produces: no new exports. `GET /state` now migrates a stored blob before returning it, persisting the upgraded form when it changed; an unrecognisable blob falls through to reseed.

- [ ] **Step 1: Write the failing tests**

In `worker/handlers.test.ts`, add inside `describe("GET /state", ...)`:

```ts
it("upgrades and persists a stored v1 blob", async () => {
  const v1 = {
    version: 1,
    updatedAt: "2026-08-30T10:00:00.000Z",
    programStartDate: "2026-01-01",
    ui: { activeCategory: "face", activeDayByCategory: { face: 0, hair: 0, body: 0 } },
  };
  await env.STATE.put(STATE_KEY, JSON.stringify(v1));
  const body = await (await handleRequest(new Request("https://w.test/state"), env)).json();
  expect(body.version).toBe(2);
  expect(body.completedSteps).toEqual([]);
  expect(body.programStartDate).toBe("2026-01-01");
  // persisted, not just returned
  expect(JSON.parse(String(env.STATE.store.get(STATE_KEY))).version).toBe(2);
});

it("reseeds when the stored blob is unrecognisable", async () => {
  await env.STATE.put(STATE_KEY, JSON.stringify({ nonsense: true }));
  const response = await handleRequest(new Request("https://w.test/state"), env);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.version).toBe(2);
  expect(JSON.parse(String(env.STATE.store.get(STATE_KEY))).version).toBe(2);
});
```

In `describe("PUT /state", ...)` add:

```ts
it("rejects a v2 body with a malformed completedSteps", async () => {
  const state = { ...makeDefaultState(), completedSteps: [{ date: "x", category: "face", phase: "am" }] };
  const response = await handleRequest(putRequest(state, "secret"), env);
  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run worker/handlers.test.ts`
Expected: FAIL — the v1 blob is returned as-is (`version` stays 1); the nonsense blob is returned raw, not reseeded.

- [ ] **Step 3: Implement the `GET` branch**

In `worker/handlers.ts`:
- Add to imports: `import { migrate } from "../src/shared/types";` (keep the existing `isAppState` import — `PUT` still uses it).
- Replace the `if (request.method === "GET") { ... }` block with:

```ts
  if (request.method === "GET") {
    const stored = await env.STATE.get(STATE_KEY);
    if (stored) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(stored);
      } catch {
        parsed = null;
      }
      const migrated = migrate(parsed);
      if (migrated) {
        const serialized = JSON.stringify(migrated);
        if (serialized !== stored) {
          await env.STATE.put(STATE_KEY, serialized);
        }
        return new Response(serialized, {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders(env) },
        });
      }
      // Unrecognisable blob: fall through and reseed, matching the
      // "repair by overwrite" philosophy the frontend uses for a bad body.
    }
    const seeded = makeDefaultState();
    await env.STATE.put(STATE_KEY, JSON.stringify(seeded));
    return json(seeded, 200, env);
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run worker/handlers.test.ts`
Expected: PASS (new + existing, including the `version: 2` and renamed tests from Task 2).

- [ ] **Step 5: Typecheck (worker config included) + commit**

```bash
npm run typecheck
git add worker/handlers.ts worker/handlers.test.ts
git commit -m "feat(worker): migrate and persist an old state blob on GET"
```

---

### Task 8: `toggleStep` on the state context

**Files:**
- Modify: `src/state/AppStateProvider.tsx`
- Modify: `src/state/AppStateProvider.test.tsx`

**Interfaces:**
- Consumes: `toggleCompletedStep` (`../shared/progress`), `weekdayDateIso` + `todayIso` (`../shared/date`), `StepPhase` (`../shared/types`).
- Produces: `useAppState().toggleStep(category: Category, dayIndex: number, phase: StepPhase, stepIndex: number): void` — toggles the step for that weekday's date in the current week and rides the existing debounced PUT.

- [ ] **Step 1: Write the failing test**

In `src/state/AppStateProvider.test.tsx`, extend `Probe` and add a test:

```ts
// add to Probe's destructure: toggleStep
// add inside Probe's JSX:
//   <span data-testid="completed">{state.completedSteps.length}</span>
//   <button onClick={() => toggleStep("face", 2, "am", 0)}>toggle w-am-0</button>

it("toggles a completed step on and off through the context", async () => {
  render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("category")).toHaveTextContent("face"));
  expect(screen.getByTestId("completed")).toHaveTextContent("0");
  await userEvent.click(screen.getByText("toggle w-am-0"));
  expect(screen.getByTestId("completed")).toHaveTextContent("1");
  await userEvent.click(screen.getByText("toggle w-am-0"));
  expect(screen.getByTestId("completed")).toHaveTextContent("0");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/state/AppStateProvider.test.tsx`
Expected: FAIL — `toggleStep` is `undefined`.

- [ ] **Step 3: Implement**

In `src/state/AppStateProvider.tsx`:
- Imports:
  ```ts
  import { toggleCompletedStep } from "../shared/progress";
  import { todayIso, weekdayDateIso } from "../shared/date";
  import type { AppState, Category, StepPhase, SyncStatus } from "../shared/types";
  ```
- Add to `AppStateContextValue`:
  ```ts
  toggleStep: (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void;
  ```
- Add to the `useMemo` value object:
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

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/state/AppStateProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
npm run test
npm run typecheck
git add src/state/AppStateProvider.tsx src/state/AppStateProvider.test.tsx
git commit -m "feat(state): toggleStep on the app-state context"
```

---

### Task 9: `DayPanel` — checkboxes, per-card counts, resolved content

**Files:**
- Modify: `src/components/DayPanel.tsx`
- Modify: `src/components/CategorySection.tsx` (new props; pass them to `DayPanel`; change the `DayPanel` call from `day={...}` to `dayIndex={activeDay}`)
- Modify: `src/App.tsx` (drill `programStartDate` / `completedSteps` / `onToggleStep` into `CategorySection`)
- Modify: `src/components/CategorySection.test.tsx` (existing renders need the three new props)
- Create: `src/components/DayPanel.test.tsx`
- Modify: `src/styles.css` (append the step-check + card-progress rules)

**Interfaces:**
- Consumes: `resolveDay` (`../shared/schedule`), `isStepDone` / `phaseCompletion` (`../shared/progress`), `programWeek` / `todayIso` (`../shared/date`), `CompletedStep` / `StepPhase` (`../shared/types`).
- Produces:
  - `DayPanel` props: `{ category: Category; dayIndex: number; programStartDate: string; completedSteps: CompletedStep[]; onToggleStep: (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void; now?: Date }`
  - `CategorySection` props gain: `programStartDate: string; completedSteps: CompletedStep[]; onToggleStep: (...) => void` (same signature).

- [ ] **Step 1: Write the failing tests**

Create `src/components/DayPanel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DayPanel from "./DayPanel";

const WEEK1_NOW = new Date("2026-08-26T03:00:00Z"); // Wednesday, program week 1
const WEEK3_NOW = new Date("2026-09-09T03:00:00Z"); // Wednesday, program week 3
const START = "2026-08-24";

function renderPanel(overrides: Partial<React.ComponentProps<typeof DayPanel>> = {}) {
  const onToggleStep = vi.fn();
  render(
    <DayPanel
      category="face"
      dayIndex={2}
      programStartDate={START}
      completedSteps={[]}
      onToggleStep={onToggleStep}
      now={WEEK1_NOW}
      {...overrides}
    />,
  );
  return { onToggleStep };
}

describe("DayPanel", () => {
  it("shows Vitamin C on Wednesday AM in week 1 and Niacinamide in week 3", () => {
    const { unmount } = render(
      <DayPanel category="face" dayIndex={2} programStartDate={START} completedSteps={[]} onToggleStep={() => {}} now={WEEK1_NOW} />,
    );
    expect(screen.getByText("Serum Vitamin C — Cocoon Nghệ C22")).toBeInTheDocument();
    unmount();
    render(
      <DayPanel category="face" dayIndex={2} programStartDate={START} completedSteps={[]} onToggleStep={() => {}} now={WEEK3_NOW} />,
    );
    expect(screen.getByText("Serum Niacinamide 15% — Cocoon")).toBeInTheDocument();
  });

  it("renders a checkbox per step and calls onToggleStep with the slot", async () => {
    const { onToggleStep } = renderPanel();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    await userEvent.click(boxes[0]);
    expect(onToggleStep).toHaveBeenCalledWith("face", 2, "am", 0);
  });

  it("reflects completedSteps as checked and counts them per card", () => {
    renderPanel({
      completedSteps: [
        { date: "2026-08-26", category: "face", phase: "am", stepIndex: 0 },
        { date: "2026-08-26", category: "face", phase: "am", stepIndex: 1 },
      ],
    });
    const amCard = document.querySelector(".card.am");
    if (!amCard) throw new Error("expected an AM card");
    expect(within(amCard).getByText("2/5")).toBeInTheDocument();
    const amBoxes = within(amCard).getAllByRole("checkbox");
    expect(amBoxes[0]).toBeChecked();
    expect(amBoxes[2]).not.toBeChecked();
  });

  it("renders one card and a flat checkbox list for a hair day", () => {
    render(
      <DayPanel category="hair" dayIndex={0} programStartDate={START} completedSteps={[]} onToggleStep={() => {}} now={new Date("2026-08-24T03:00:00Z")} />,
    );
    expect(document.querySelector(".card.am")).toBeNull();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });
});
```

> `React` is available as a global JSX type here (the file is `.tsx`); if the repo's other test files import it explicitly, match that. `React.ComponentProps` needs `import type React from "react"` — add it if the constraint checker / tsc complains.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/DayPanel.test.tsx`
Expected: FAIL — `DayPanel` still takes `day`, has no checkboxes.

- [ ] **Step 3: Rewrite `src/components/DayPanel.tsx`**

```tsx
import type { ReactNode } from "react";
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { programWeek, todayIso } from "../shared/date";
import { isStepDone, phaseCompletion } from "../shared/progress";
import { resolveDay } from "../shared/schedule";
import { isHairDay, type Category, type CompletedStep, type StepPhase, type StepTuple } from "../shared/types";

type ToggleStep = (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void;

function Steps({
  steps,
  category,
  dayIndex,
  phase,
  completedSteps,
  nowIso,
  onToggleStep,
}: {
  steps: StepTuple[];
  category: Category;
  dayIndex: number;
  phase: StepPhase;
  completedSteps: CompletedStep[];
  nowIso: string;
  onToggleStep: ToggleStep;
}) {
  return (
    <ul className="steps">
      {steps.map(([product, note], index) => {
        const checked = isStepDone(completedSteps, category, dayIndex, phase, index, nowIso);
        return (
          <li key={`${product}-${index}`}>
            <label className="step-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleStep(category, dayIndex, phase, index)}
              />
              <span className="step-check-box" aria-hidden="true" />
            </label>
            <div className="icon-badge">
              <Icon icon={pickIcon(product)} />
            </div>
            <div>
              <strong>{product}</strong>
              {note ? <span className="note">{note}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Card({
  className,
  title,
  subtitle,
  done,
  total,
  children,
}: {
  className?: string;
  title: string;
  subtitle: string;
  done: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <div className={`card${className ? ` ${className}` : ""}`}>
      <div className="card-head">
        <Icon icon="flower" />
        <div>
          <p className="card-title">{title}</p>
          <p className="card-sub">{subtitle}</p>
        </div>
        <span className="card-progress">{done}/{total}</span>
      </div>
      {children}
    </div>
  );
}

const PANEL_COPY: Record<
  "face" | "body",
  { badgePrefix: string; am: { title: string; subtitle: string }; pm: { title: string; subtitle: string } }
> = {
  face: {
    badgePrefix: "Trọng tâm tối nay: ",
    am: { title: "Buổi sáng", subtitle: "Chăm da ban ngày" },
    pm: { title: "Buổi tối", subtitle: "Chăm da ban đêm" },
  },
  body: {
    badgePrefix: "",
    am: { title: "Sau khi tắm", subtitle: "Chăm thể ban ngày" },
    pm: { title: "Trước khi ngủ", subtitle: "Chăm thể ban đêm" },
  },
};

export default function DayPanel({
  category,
  dayIndex,
  programStartDate,
  completedSteps,
  onToggleStep,
  now = new Date(),
}: {
  category: Category;
  dayIndex: number;
  programStartDate: string;
  completedSteps: CompletedStep[];
  onToggleStep: ToggleStep;
  now?: Date;
}) {
  const nowIso = todayIso(now);
  const week = programWeek(programStartDate, nowIso);
  const day = resolveDay(category, dayIndex, week);

  if (isHairDay(day)) {
    const c = phaseCompletion(completedSteps, programStartDate, category, dayIndex, "steps", nowIso);
    return (
      <div className="panel active">
        <div className="badge-row">
          <span className="badge focus">{day.full}</span>
          <span className="badge">{day.type}</span>
        </div>
        <Card title="Chăm tóc hôm nay" subtitle={day.type} done={c.done} total={c.total}>
          <Steps
            steps={day.steps}
            category={category}
            dayIndex={dayIndex}
            phase="steps"
            completedSteps={completedSteps}
            nowIso={nowIso}
            onToggleStep={onToggleStep}
          />
        </Card>
      </div>
    );
  }

  const copy = category === "body" ? PANEL_COPY.body : PANEL_COPY.face;
  const am = phaseCompletion(completedSteps, programStartDate, category, dayIndex, "am", nowIso);
  const pm = phaseCompletion(completedSteps, programStartDate, category, dayIndex, "pm", nowIso);
  return (
    <div className="panel active">
      <div className="badge-row">
        <span className="badge focus">{day.full}</span>
        <span className="badge">
          {copy.badgePrefix}
          {day.focus}
        </span>
      </div>
      <Card className="am" title={copy.am.title} subtitle={copy.am.subtitle} done={am.done} total={am.total}>
        <Steps
          steps={day.am}
          category={category}
          dayIndex={dayIndex}
          phase="am"
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
        />
      </Card>
      <Card className="pm" title={copy.pm.title} subtitle={copy.pm.subtitle} done={pm.done} total={pm.total}>
        <Steps
          steps={day.pm}
          category={category}
          dayIndex={dayIndex}
          phase="pm"
          completedSteps={completedSteps}
          nowIso={nowIso}
          onToggleStep={onToggleStep}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Thread the props through `CategorySection` and `App`**

`src/components/CategorySection.tsx`:
- Add to imports: `import WeekProgress from "./WeekProgress";` — **skip this line in Task 9**; add it in Task 10. For now only wire `DayPanel`.
- Add to the component's prop type and destructure: `programStartDate: string; completedSteps: CompletedStep[]; onToggleStep: (category: Category, dayIndex: number, phase: StepPhase, stepIndex: number) => void;` (import `CompletedStep`, `StepPhase` from `../shared/types`).
- Replace `<DayPanel day={data.days[activeDay]} category={category} />` with:
  ```tsx
  <DayPanel
    category={category}
    dayIndex={activeDay}
    programStartDate={programStartDate}
    completedSteps={completedSteps}
    onToggleStep={onToggleStep}
  />
  ```

`src/App.tsx`:
- Destructure `toggleStep` from `useAppState()`.
- Pass to `<CategorySection>`: `programStartDate={state.programStartDate}`, `completedSteps={state.completedSteps}`, `onToggleStep={toggleStep}`.

- [ ] **Step 5: Fix `CategorySection.test.tsx`**

Every `render(<CategorySection ... />)` call needs the three new props. Add a helper at the top of the file and use it:

```tsx
const stateProps = {
  programStartDate: "2026-08-24",
  completedSteps: [],
  onToggleStep: () => {},
};
// then: render(<CategorySection category="body" activeDay={0} onSelectDay={() => {}} {...stateProps} />);
```

Apply `{...stateProps}` to all six renders. No assertions change.

- [ ] **Step 6: Append CSS to `src/styles.css`**

```css
/* --- step check-offs (progress tracking) --- */
ul.steps li{align-items:center;}
.step-check{flex:none;display:inline-flex;align-items:center;cursor:pointer;}
.step-check input{position:absolute;width:1px;height:1px;opacity:0;margin:0;}
.step-check-box{width:22px;height:22px;border-radius:8px;border:2px solid var(--line);background:var(--cream);transition:background .15s ease,border-color .15s ease;}
.step-check input:checked + .step-check-box{background:var(--rose);border-color:var(--rose);box-shadow:inset 0 0 0 3px var(--cream);}
.step-check input:focus-visible + .step-check-box{outline:2px solid var(--rose-deep);outline-offset:2px;}
.card.pm .step-check input:checked + .step-check-box{background:var(--pm-grad-1);border-color:var(--pm-grad-1);}
.card-progress{margin-left:auto;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--muted);}
.card.pm .card-progress{color:#fff;}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run test`
Expected: PASS — `DayPanel.test.tsx`, `CategorySection.test.tsx`, and the rest.
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/DayPanel.tsx src/components/DayPanel.test.tsx src/components/CategorySection.tsx src/components/CategorySection.test.tsx src/App.tsx src/styles.css
git commit -m "feat(daypanel): per-step checkboxes, per-card counts, resolved content"
```

---

### Task 10: `WeekProgress` strip

**Files:**
- Create: `src/components/WeekProgress.tsx`
- Create: `src/components/WeekProgress.test.tsx`
- Modify: `src/components/CategorySection.tsx` (render `<WeekProgress>` above `<DayTabs>`)
- Modify: `src/styles.css` (append the strip rules)

**Interfaces:**
- Consumes: `programWeek` / `weekdayIndex` / `todayIso` (`../shared/date`), `dayCompletion` (`../shared/progress`), `Category` / `CompletedStep` (`../shared/types`).
- Produces: `WeekProgress` props `{ category: Category; programStartDate: string; completedSteps: CompletedStep[]; now?: Date }`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/WeekProgress.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WeekProgress from "./WeekProgress";

const START = "2026-08-24"; // Monday, week 1
const WED_WEEK1 = new Date("2026-08-26T03:00:00Z");

describe("WeekProgress", () => {
  it("shows the current program week", () => {
    render(<WeekProgress category="face" programStartDate={START} completedSteps={[]} now={WED_WEEK1} />);
    expect(screen.getByText("Tuần 1")).toBeInTheDocument();
    // 5 weeks later
    render(
      <WeekProgress
        category="face"
        programStartDate={START}
        completedSteps={[]}
        now={new Date("2026-09-30T03:00:00Z")}
      />,
    );
    expect(screen.getByText("Tuần 6")).toBeInTheDocument();
  });

  it("renders seven day markers and marks a fully-done day", () => {
    // hair Tuesday (dayIndex 1) has exactly 2 steps; tick both for that week's Tuesday date
    const tueDate = "2026-08-25";
    const completedSteps = [
      { date: tueDate, category: "hair" as const, phase: "steps" as const, stepIndex: 0 },
      { date: tueDate, category: "hair" as const, phase: "steps" as const, stepIndex: 1 },
    ];
    render(
      <WeekProgress category="hair" programStartDate={START} completedSteps={completedSteps} now={WED_WEEK1} />,
    );
    const markers = screen.getAllByRole("listitem");
    expect(markers).toHaveLength(7);
    expect(markers[1].className).toContain("is-full"); // Tuesday
    expect(markers[0].className).toContain("is-empty"); // Monday
  });

  it("marks today's column", () => {
    render(<WeekProgress category="face" programStartDate={START} completedSteps={[]} now={WED_WEEK1} />);
    const markers = screen.getAllByRole("listitem");
    expect(markers[2].className).toContain("is-today"); // Wednesday
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/WeekProgress.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/WeekProgress.tsx`**

```tsx
import { programWeek, todayIso, weekdayIndex } from "../shared/date";
import { dayCompletion } from "../shared/progress";
import type { Category, CompletedStep } from "../shared/types";

const DAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function WeekProgress({
  category,
  programStartDate,
  completedSteps,
  now = new Date(),
}: {
  category: Category;
  programStartDate: string;
  completedSteps: CompletedStep[];
  now?: Date;
}) {
  const nowIso = todayIso(now);
  const week = programWeek(programStartDate, nowIso);
  const today = weekdayIndex(now);

  return (
    <div className="week-progress" role="group" aria-label={`Tiến độ tuần ${week}`}>
      <span className="week-progress-label">Tuần {week}</span>
      <ol className="week-progress-track">
        {DAY_SHORT.map((short, index) => {
          const { done, total } = dayCompletion(completedSteps, programStartDate, category, index, nowIso);
          const fill =
            total > 0 && done >= total ? "is-full" : done > 0 ? "is-partial" : "is-empty";
          return (
            <li
              key={short}
              className={`week-progress-marker ${fill}${index === today ? " is-today" : ""}`}
              aria-label={`${short}: ${done}/${total}`}
            >
              <span aria-hidden="true">{short}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 4: Render it in `CategorySection`**

`src/components/CategorySection.tsx`:
- `import WeekProgress from "./WeekProgress";`
- Immediately before `<DayTabs ... />`:
  ```tsx
  <WeekProgress
    category={category}
    programStartDate={programStartDate}
    completedSteps={completedSteps}
  />
  ```

- [ ] **Step 5: Append CSS to `src/styles.css`**

```css
/* --- week progress strip (progress tracking) --- */
.week-progress{display:flex;align-items:center;gap:12px;margin:0 4px 12px;}
.week-progress-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap;}
.week-progress-track{list-style:none;display:flex;gap:6px;flex:1;margin:0;padding:0;}
.week-progress-marker{flex:1;min-width:0;text-align:center;font-size:10px;font-weight:700;color:#b4a190;padding:5px 0;border-radius:9px;border:1px solid var(--line);background:var(--cream);}
.week-progress-marker.is-partial{border-color:var(--gold);color:var(--rose-ink);}
.week-progress-marker.is-full{background:linear-gradient(135deg,var(--rose),var(--rose-deep));border-color:transparent;color:#fff;}
.week-progress-marker.is-today{box-shadow:0 0 0 2px var(--rose-deep);}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run test`
Expected: PASS — `WeekProgress.test.tsx` + the `CategorySection` tests still green (they already pass `stateProps`; the strip renders with `completedSteps: []`).
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/WeekProgress.tsx src/components/WeekProgress.test.tsx src/components/CategorySection.tsx src/styles.css
git commit -m "feat(weekprogress): per-week completion strip above the day tabs"
```

---

### Task 11: Docs + full verification

**Files:**
- Modify: `CLAUDE.md`
- No code changes.

- [ ] **Step 1: Update `CLAUDE.md`**

In the **State and persistence** section, after the `isAppState()` paragraph, add a short paragraph:

> `completedSteps` on `AppState` is a flat dated log of checked steps
> (`{ date, category, phase, stepIndex }`), written via
> `useAppState().toggleStep(...)` and carried on the same debounced `PUT`.
> The visible checkboxes are the entries whose `date` falls in the current
> Mon–Sun week; older entries stay in the log for a later stats view.
> `AppState` is `version: 2`; `migrate()` in `src/shared/types.ts` upgrades a
> v1 blob (adds `completedSteps: []`) and is called on every untrusted read —
> the localStorage mirror, `fetchRemote`, and the Worker's `GET` (which also
> persists the upgrade). Add future migrations there; keep `isV1State` a
> frozen snapshot.

In the **Routine content and rendering** section, after the `StepTuple`
paragraph, add:

> Week-conditional steps live in `src/shared/schedule.ts`, not in `routine.ts`.
> `routine.ts` holds the steady-state (week 3+) form; `resolveDay(category,
> dayIndex, programWeek)` swaps in the weeks-1–2 Wednesday-AM Vitamin C step
> and the even-week Sunday-PM "Natural White" mask. `programWeek` /
> `weekCyclePosition` (`src/shared/date.ts`) are calendar Mon–Sun weeks from
> `programStartDate`. `src/shared/progress.ts` has the check-off math
> (`toggleCompletedStep`, `isStepDone`, `phaseCompletion`, `dayCompletion`).

In the **Out of scope here** section, update the parenthetical on progress
tracking to note it now exists (checkboxes + week strip + the Niacinamide/mask
resolver), and that streaks / a multi-week history view are still deferred.

- [ ] **Step 2: Full clean run**

```bash
npm run test
npm run typecheck
npm run build
```
Expected: all green; `dist/` builds.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```
In the browser (local-only mode is fine — the "Đồng bộ đang tắt" notice is expected):
1. Open **Cài đặt**, set the program start date to today → week strip shows **Tuần 1**. Wednesday face tab, morning card → serum reads **"Serum Vitamin C — Cocoon Nghệ C22"**.
2. Set the start date back ~3 weeks → strip shows **Tuần 3+**, Wednesday morning serum reads **"Serum Niacinamide 15% — Cocoon"**.
3. Walk the start date across four weeks → Sunday face evening mask alternates **Histolab Peppermint** (weeks 1, 3) / **Histolab Natural White** (weeks 2, 4).
4. Tick steps → the card's `done/total` and the week-strip marker for that day update; a fully-ticked day turns the marker solid.
5. Reload → ticks persist (localStorage mirror).
6. In DevTools, move the system clock forward past Sunday→Monday (or edit the mirror's dates) and reload → visible ticks clear, but `localStorage["skincare.state.v1"]` still lists last week's `completedSteps`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record progress tracking (completedSteps, schedule.ts, migrate seam)"
```

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch` to decide how to integrate `feat/progress-tracking` (merge to `main`, which triggers both deploy workflows; the Worker's `GET` upgrades the live KV blob on first read).

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
| --- | --- |
| Revision 1–5 (identity, flat array, scope, persisted tab, versioning) | Tasks 2, 5, 9, 10 (identity used in 5/9/10; array + version in 2) |
| Data model — `CompletedStep`, `AppState` v2, no cap | Task 2 |
| `isCompletedStep`, `isAppState` v2, `migrate` / `isV1State` | Task 2 |
| Date helpers (`weekdayIndexOfIso` … `weekdayDateIso`) | Task 1 |
| `schedule.ts` `resolveDay` + overrides table | Task 4 |
| `routine.ts` two content changes + note-box left as-is | Task 3 (note-box untouched by omission; Global Constraints forbids touching it) |
| `pickIcon` re-check for the mask strings | Task 4 Step 4 covers behaviour via `resolveDay` tests; **explicit `pickIcon` check** → added as note below |
| `progress.ts` four helpers | Task 5 |
| Provider `toggleStep` | Task 8 |
| `useRemoteState` / `storage` migrate wiring | Task 6 |
| Worker `GET` migrate + persist | Task 7 |
| `DayPanel` checkboxes + counts + resolved content | Task 9 |
| `WeekProgress` | Task 10 |
| `CategorySection` / `App` wiring | Tasks 9 (DayPanel), 10 (WeekProgress) |
| Styles | Tasks 9, 10 |
| Definition of done (suites, typecheck, manual) | Task 11 |
| Non-goals | Not implemented, by construction |

**Gap found & fixed:** the spec calls for an explicit `pickIcon` re-check for
`"Mặt nạ Histolab Peppermint"` / `"Mặt nạ Histolab Natural White"`. Add this to
**Task 4, Step 4** before commit: run
`npx vitest run src/icons/pickIcon.test.ts` and add one assertion there —
`expect(pickIcon("Mặt nạ Histolab Natural White")).toBe("mask")` — since
`pickIcon.ts:16` matches `n.includes("mặt nạ")`, this passes without a new
branch; the assertion locks it in.

**2. Placeholder scan:** No "TBD"/"handle errors"/"similar to Task N". Every
code step has literal code. The two forward-references ("skip the `WeekProgress`
import until Task 10", the `mockFetch` helper-name note) are explicit
instructions, not deferrals.

**3. Type consistency:** `ToggleStep` signature
`(category, dayIndex, phase, stepIndex) => void` is identical in Task 8
(context), Task 9 (`DayPanel` prop, `CategorySection` prop), and Task 10 leaves
it untouched. `CompletedStep` field order `{ date, category, phase, stepIndex }`
is consistent across Tasks 2, 5, 8, 9, 10. `phaseCompletion` /
`dayCompletion` param order `(completed, programStartDate, category, dayIndex,
[phase,] nowIso)` matches between Task 5 definition and Task 9/10 calls.
`resolveDay(category, dayIndex, week)` consistent Tasks 4, 5, 9.
`programWeek(startIso, nowIso)` consistent Tasks 1, 5, 9, 10.
