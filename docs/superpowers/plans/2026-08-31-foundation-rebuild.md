# Foundation Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the existing single-file skincare tracker, visually and behaviourally unchanged, as a React + Vite app whose UI state persists durably through a Cloudflare Worker, with automated deploys.

**Architecture:** One npm project at the repo root. The frontend is React + Vite building to `dist/` and published to GitHub Pages. The backend is a single Cloudflare Worker exposing `GET`/`PUT /state` over one KV key. Both import from `src/shared/` so routine data and date logic can never drift between them. All persistence flows through one hook (`useRemoteState`) behind one Context (`AppStateProvider`) — that is the seam sub-projects 2–5 extend.

**Tech Stack:** React 18, Vite 5, TypeScript (strict), plain CSS, Vitest + @testing-library/react, Cloudflare Workers + KV, wrangler 3, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-08-31-foundation-rebuild-spec.md](../specs/2026-08-31-foundation-rebuild-spec.md) — read it before Task 1, along with the [design doc](../specs/2026-08-28-foundation-rebuild-design.md) it implements.

## Global Constraints

Every task's requirements implicitly include these.

- **Node 20 LTS.** npm only; `package-lock.json` is committed.
- **TypeScript `strict: true`.** No `any` in committed code, no `@ts-ignore`.
- **Plain CSS only.** No framework, no CSS modules, no preprocessor.
- **No new runtime dependencies** beyond `react` and `react-dom`. No router, no state library, no date library.
- **This is a port, not a redesign.** Routine content, copy, and visual output must match `skincare-routine.html` exactly. Do not "improve" Vietnamese wording, reorder steps, or adjust colours.
- **Timezone is `Asia/Ho_Chi_Minh` everywhere.** No bare `new Date().getDate()`-style local-time arithmetic; go through `src/shared/date.ts`.
- **Base path.** `vite.config.ts` uses `base: process.env.BASE_PATH ?? "/"`. Never write an absolute asset path (`/foo.svg`) in markup or CSS.
- **`skincare-routine.html` stays in the repo until Task 12.** It is the comparison baseline; deleting it early destroys the only way to verify parity.
- **Commit after every task**, using the message given in that task's final step.

---

### Task 1: Project scaffold and timezone-pinned date helpers

Sets up the toolchain and delivers the first tested module. Scaffolding is folded in here because the date helpers are the first thing that needs a working test runner.

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.worker.json`, `index.html`, `.gitignore`, `.env.example`, `src/test-setup.ts`, `src/main.tsx`, `src/App.tsx`
- Create: `src/shared/date.ts`
- Test: `src/shared/date.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `TZ: string`, `todayIso(now?: Date): string` returning `"YYYY-MM-DD"`, `weekdayIndex(now?: Date): number` returning `0` for Monday through `6` for Sunday — all from `src/shared/date.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "skincare-routine-webapp",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.worker.json",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "worker:dev": "wrangler dev",
    "worker:deploy": "wrangler deploy"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.16.5",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.3",
    "vitest": "^2.0.5",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: Create the config files**

`vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`"node"` is required, not incidental: `vite.config.ts` reads `process.env.BASE_PATH` per the spec, and Vite's own type declarations reference `node:http`, `Buffer`, and the `NodeJS` namespace. `lib` is `ESNext` rather than `ES2022` because `@vitest/utils` references `Symbol.asyncDispose`. `@types/node` is a types-only devDependency and does not count against the "no new runtime dependencies" constraint.

`tsconfig.worker.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["worker", "src/shared"],
  "exclude": ["**/*.test.ts"]
}
```

The `exclude` is load-bearing. `src/shared` contains test files that import vitest; pulling vitest and tinybench types into a `@cloudflare/workers-types` context produces irreconcilable `EventTarget` conflicts. Worker test files are still executed by Vitest under the frontend config — they are simply not type-checked by this config.

`src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`.gitignore`:

```
node_modules/
dist/
.env
.env.local
.wrangler/
```

`.env.example`:

```
# Deployed Cloudflare Worker URL. If unset, the app runs local-only
# (localStorage) and shows the "sync disabled" notice.
VITE_WORKER_URL=
# Must match the Worker's WRITE_TOKEN secret.
VITE_WRITE_TOKEN=
```

- [ ] **Step 3: Create the minimal app entry so the dev server boots**

`index.html`:

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Routine Chăm Sóc Bản Thân — Lịch Tuần</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Copy the Google Fonts `<link>` from `skincare-routine.html` (in its `<head>`) verbatim into this `<head>` below the preconnects.

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return <div>Routine</div>;
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: completes, `package-lock.json` created.

- [ ] **Step 5: Write the failing test**

`src/shared/date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { todayIso, weekdayIndex } from "./date";

describe("todayIso", () => {
  it("returns the ICT date, not the UTC date, just after ICT midnight", () => {
    // 2026-08-30T17:30Z is 2026-08-31T00:30 in ICT (UTC+7)
    expect(todayIso(new Date("2026-08-30T17:30:00Z"))).toBe("2026-08-31");
  });

  it("still returns the earlier date just before ICT midnight", () => {
    // 2026-08-30T16:59Z is 2026-08-30T23:59 in ICT
    expect(todayIso(new Date("2026-08-30T16:59:00Z"))).toBe("2026-08-30");
  });
});

describe("weekdayIndex", () => {
  it("returns 0 for Monday", () => {
    // 2026-08-31 is a Monday
    expect(weekdayIndex(new Date("2026-08-31T03:00:00Z"))).toBe(0);
  });

  it("returns 6 for Sunday", () => {
    // 2026-08-30 is a Sunday
    expect(weekdayIndex(new Date("2026-08-30T03:00:00Z"))).toBe(6);
  });

  it("uses the ICT day, so late-UTC Sunday is already Monday", () => {
    expect(weekdayIndex(new Date("2026-08-30T17:30:00Z"))).toBe(0);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test -- src/shared/date.test.ts`
Expected: FAIL — cannot resolve `./date`.

- [ ] **Step 7: Write the implementation**

`src/shared/date.ts`:

```ts
export const TZ = "Asia/Ho_Chi_Minh";

// en-CA formats as YYYY-MM-DD, which is what we want to store.
const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
});

const MONDAY_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calendar date in Asia/Ho_Chi_Minh, as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return isoFormatter.format(now);
}

/** Weekday in Asia/Ho_Chi_Minh, 0 = Monday .. 6 = Sunday (matches the T2..CN tab order). */
export function weekdayIndex(now: Date = new Date()): number {
  return MONDAY_FIRST.indexOf(weekdayFormatter.format(now));
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + Vitest project with timezone-pinned date helpers"
```

---

### Task 2: Shared types and routine data port

Moves the routine content out of inline `<script>` arrays into a typed module both deployables can import.

**Files:**
- Create: `src/shared/types.ts`, `src/shared/routine.ts`
- Test: `src/shared/routine.test.ts`
- Reference (do not modify): `skincare-routine.html:359-444`

**Interfaces:**
- Consumes: nothing
- Produces: from `src/shared/types.ts` — `Category`, `StepTuple`, `FaceOrBodyDay`, `HairDay`, `DayData`, `AppState`, `SyncStatus`. From `src/shared/routine.ts` — `faceProducts`, `faceDays`, `hairProducts`, `hairDays`, `bodyProducts`, `bodyDays`, and `routine: Record<Category, CategoryData>` where `CategoryData = { products: string[]; days: DayData[] }`

- [ ] **Step 1: Write the types**

`src/shared/types.ts`:

```ts
export type Category = "face" | "hair" | "body";

/** [product name, note]. The note is "" when there isn't one. */
export type StepTuple = [product: string, note: string];

export type FaceOrBodyDay = {
  short: string;
  full: string;
  focus: string;
  am: StepTuple[];
  pm: StepTuple[];
};

/** Hair days are a flat list and use `type` where face/body use `focus`. */
export type HairDay = {
  short: string;
  full: string;
  type: string;
  steps: StepTuple[];
};

export type DayData = FaceOrBodyDay | HairDay;

export type CategoryData = {
  products: string[];
  days: DayData[];
};

export function isHairDay(day: DayData): day is HairDay {
  return "steps" in day;
}

export type AppState = {
  version: 1;
  /** ISO timestamp of the last local mutation; drives mount-time reconciliation. */
  updatedAt: string;
  /** ISO date, e.g. "2026-08-24". */
  programStartDate: string;
  ui: {
    activeCategory: Category;
    activeDayByCategory: Record<Category, number>;
  };
};

export type SyncStatus = "synced" | "offline" | "unauthorized";
```

- [ ] **Step 2: Write the failing test**

`src/shared/routine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { routine } from "./routine";
import { isHairDay } from "./types";

describe("routine data", () => {
  it("has all three categories with 7 days each", () => {
    for (const category of ["face", "hair", "body"] as const) {
      expect(routine[category].days).toHaveLength(7);
      expect(routine[category].products.length).toBeGreaterThan(0);
    }
  });

  // Every category, not just face — this is the only assertion standing
  // between a reordered day and a silently wrong routine.
  it.each(["face", "hair", "body"] as const)(
    "orders %s days from Monday (T2) to Sunday (CN)",
    (category) => {
      const shorts = routine[category].days.map((d) => d.short);
      expect(shorts).toEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    },
  );

  it("gives face and body days am/pm lists, and hair days a flat steps list", () => {
    expect(isHairDay(routine.face.days[0])).toBe(false);
    expect(isHairDay(routine.body.days[0])).toBe(false);
    expect(isHairDay(routine.hair.days[0])).toBe(true);
  });

  it("keeps every step as a [product, note] pair", () => {
    for (const category of ["face", "hair", "body"] as const) {
      for (const day of routine[category].days) {
        const steps = isHairDay(day) ? day.steps : [...day.am, ...day.pm];
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(step).toHaveLength(2);
          expect(typeof step[0]).toBe("string");
          expect(typeof step[1]).toBe("string");
          expect(step[0].length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("preserves the week-1-2 Niacinamide note on Wednesday morning", () => {
    const wednesday = routine.face.days[2];
    expect(isHairDay(wednesday)).toBe(false);
    if (isHairDay(wednesday)) return;
    const notes = wednesday.am.map((s) => s[1]).join(" ");
    expect(notes).toContain("Tuần 3");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/shared/routine.test.ts`
Expected: FAIL — cannot resolve `./routine`.

- [ ] **Step 4: Port the data**

Create `src/shared/routine.ts`. Copy the six array literals **verbatim** from `skincare-routine.html` — do not retype them, and do not alter a single Vietnamese string, note, or ordering:

- `faceProducts` — line 359
- `faceDays` — lines 362–385
- `hairProducts` — line 393
- `hairDays` — lines 396–411
- `bodyProducts` — line 419
- `bodyDays` — lines 422–444

Add types and the lookup record around them:

```ts
import type { CategoryData, Category, FaceOrBodyDay, HairDay } from "./types";

export const faceProducts: string[] = [/* verbatim from line 359 */];

export const faceDays: FaceOrBodyDay[] = [/* verbatim from lines 362-385 */];

export const hairProducts: string[] = [/* verbatim from line 393 */];

export const hairDays: HairDay[] = [/* verbatim from lines 396-411 */];

export const bodyProducts: string[] = [/* verbatim from line 419 */];

export const bodyDays: FaceOrBodyDay[] = [/* verbatim from lines 422-444 */];

export const routine: Record<Category, CategoryData> = {
  face: { products: faceProducts, days: faceDays },
  hair: { products: hairProducts, days: hairDays },
  body: { products: bodyProducts, days: bodyDays },
};
```

TypeScript will infer the step arrays as `string[][]`, which does not satisfy `StepTuple[]`. Fix it by annotating the arrays as shown above (the annotation propagates), not by adding `as` casts to individual steps.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Verify no content drifted**

Run: `npm run typecheck`
Expected: no errors. Then spot-check three strings against the original file — the Wednesday PM mask note, the Sunday PM mask alternation note, and the last body product — by eye.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: port routine content to typed src/shared/routine.ts"
```

---

### Task 3: Icon set and keyword matching

**Files:**
- Create: `src/icons/icons.tsx`, `src/icons/pickIcon.ts`
- Test: `src/icons/pickIcon.test.ts`
- Reference: `skincare-routine.html:290-322`

**Interfaces:**
- Consumes: nothing
- Produces: from `src/icons/icons.tsx` — the `IconKey` union type, `ICONS: Record<IconKey, (size: number) => JSX.Element>`, and the `Icon` component `({ icon, size }: { icon: IconKey; size?: number }) => JSX.Element`. From `src/icons/pickIcon.ts` — `pickIcon(name: string): IconKey`

- [ ] **Step 1: Write the failing test**

`src/icons/pickIcon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickIcon } from "./pickIcon";

describe("pickIcon", () => {
  it.each([
    ["Cicaplast Baume B5", "balm"],
    ["Tẩy trang Bioderma", "micellar"],
    ["Sữa rửa mặt Dermacos", "cleanser"],
    ["Toner Cocoon Sen", "toner"],
    ["Tẩy da chết Civasan 30g", "exfoliant"],
    ["Serum Niacinamide 15% — Cocoon", "serum"],
    ["Dầu gội Loreal Serioxyl Advanced", "toner"],
    ["Dầu xả Dove Derma Scalp", "toner"],
    ["Bơ ủ tóc Mielle", "cream"],
    ["Dầu khô đa năng Nuxe Huile Multi", "serum"],
    ["Winter Melon Gel Cream", "cream"],
    ["Mặt nạ Wonjin phục hồi 8 CICA relaxing", "mask"],
    ["Kem chống nắng SPF 30–50 PA+++", "sun"],
    ["Rửa mặt nhẹ bằng nước ấm", "water"],
    ["Để tóc nghỉ hoàn toàn", "flower"],
    // Synthetic input, not a real product: it is the only kind of string that
    // can distinguish "dau tested before kem" from the reverse. Without it,
    // swapping those two branches passes the whole suite.
    ["Dầu dưỡng dạng kem ban đêm", "serum"],
  ])("maps %s to the %s icon", (name, expected) => {
    expect(pickIcon(name)).toBe(expected);
  });

  it("does not treat sunscreen as a cream despite the word kem", () => {
    expect(pickIcon("Kem chống nắng SPF 30–50 PA+++")).toBe("sun");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/icons/pickIcon.test.ts`
Expected: FAIL — cannot resolve `./pickIcon`.

- [ ] **Step 3: Port the icon components**

Create `src/icons/icons.tsx`. Convert each entry of the `ICONS` map at `skincare-routine.html:290-302` from an SVG string to a function returning JSX. The original hardcodes `width="20" height="20"` and the gallery string-replaces it with `34`; parameterising `size` replaces that hack. Keep `fill="none"`, `stroke="currentColor"`, and every path/rect attribute exactly as in the original — `currentColor` is what makes icons adopt each category's theme.

```tsx
export type IconKey =
  | "balm" | "micellar" | "cleanser" | "toner" | "exfoliant" | "serum"
  | "cream" | "mask" | "sun" | "water" | "flower";

type IconFn = (size: number) => JSX.Element;

export const ICONS: Record<IconKey, IconFn> = {
  // Example shape — port every entry from skincare-routine.html:290-302 this way.
  cream: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="9" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7" y="5" width="10" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  // ...balm, micellar, cleanser, toner, exfoliant, serum, mask, sun, water, flower
};

export function Icon({ icon, size = 20 }: { icon: IconKey; size?: number }) {
  return ICONS[icon](size);
}
```

Note the JSX attribute renames: `stroke-width` becomes `strokeWidth`, `stroke-linecap` becomes `strokeLinecap`, `stroke-linejoin` becomes `strokeLinejoin`.

- [ ] **Step 4: Port the matcher**

`src/icons/pickIcon.ts` — the branch order is load-bearing (`dầu` must be tested before `kem`, and `chống nắng` is excluded from the cream branch), so keep it identical to `skincare-routine.html:304-322`:

```ts
import type { IconKey } from "./icons";

export function pickIcon(name: string): IconKey {
  const n = name.toLowerCase();
  if (n.includes("cicaplast") || n.includes("baume")) return "balm";
  if (n.includes("tẩy trang") || n.includes("bioderma")) return "micellar";
  if (n.includes("sữa rửa mặt") || n.includes("dermacos")) return "cleanser";
  if (n.includes("toner")) return "toner";
  if (n.includes("tẩy da chết") || n.includes("civasan")) return "exfoliant";
  if (n.includes("serum") || n.includes("niacinamide")) return "serum";
  if (n.includes("gội")) return "toner";
  if (n.includes("xả")) return "toner";
  if (n.includes("bơ")) return "cream";
  if (n.includes("dầu") || n.includes("oil")) return "serum";
  if ((n.includes("kem") || n.includes("cream") || n.includes("gel")) && !n.includes("chống nắng")) return "cream";
  if (n.includes("mặt nạ") || n.includes("mask")) return "mask";
  if (n.includes("chống nắng")) return "sun";
  if (n.includes("nước ấm") || n.includes("rửa mặt")) return "water";
  return "flower";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: port icon set and keyword matcher to React components"
```

---

### Task 4: Stylesheet port, app shell, and category switching

Delivers a running app with the real look and working category tabs, using local component state. Persistence arrives in Task 8.

**Files:**
- Create: `src/styles.css`, `src/components/CategorySwitcher.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/components/CategorySwitcher.test.tsx`
- Reference: `skincare-routine.html:9-156` (styles), `158-287` (markup), `452-460` (switcher behaviour)

**Interfaces:**
- Consumes: `Category` from `src/shared/types.ts`
- Produces: `CategorySwitcher({ active, onSelect }: { active: Category; onSelect: (c: Category) => void })`

- [ ] **Step 1: Port the stylesheet**

Copy `skincare-routine.html:10-155` (everything between the `<style>` tags) verbatim into `src/styles.css`. Two changes only:

1. Delete the `.category{display:none}` / `.category.active{display:block}` pair — React renders only the active section, so the display toggle is no longer how visibility works. Keep the `catfade` animation and apply it to `.category`.
2. Leave `.panel` / `.panel.active` alone for now; Task 5 handles the panel rendering.

Import it once, at the top of `src/main.tsx`:

```tsx
import "./styles.css";
```

- [ ] **Step 2: Write the failing test**

`src/components/CategorySwitcher.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CategorySwitcher from "./CategorySwitcher";

describe("CategorySwitcher", () => {
  it("marks the active category button as active", () => {
    render(<CategorySwitcher active="hair" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Tóc/ })).toHaveClass("active");
    expect(screen.getByRole("button", { name: /Da mặt/ })).not.toHaveClass("active");
  });

  it("calls onSelect with the clicked category", async () => {
    const onSelect = vi.fn();
    render(<CategorySwitcher active="face" onSelect={onSelect} />);
    // The body button reads "Da cơ thể", not "Cơ thể" — match the real label.
    await userEvent.click(screen.getByRole("button", { name: /Da cơ thể/ }));
    expect(onSelect).toHaveBeenCalledWith("body");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/components/CategorySwitcher.test.tsx`
Expected: FAIL — cannot resolve `./CategorySwitcher`.

- [ ] **Step 4: Write the component**

`src/components/CategorySwitcher.tsx`. Take the button labels and emoji from `skincare-routine.html:168-172` verbatim (`🌸 Da mặt`, and the hair and body buttons that follow it):

```tsx
import type { Category } from "../shared/types";

const BUTTONS: Array<{ cat: Category; icon: string; label: string }> = [
  { cat: "face", icon: "🌸", label: "Da mặt" },
  { cat: "hair", icon: "💛", label: "Tóc" },
  { cat: "body", icon: "🌰", label: "Da cơ thể" },
];

export default function CategorySwitcher({
  active,
  onSelect,
}: {
  active: Category;
  onSelect: (category: Category) => void;
}) {
  return (
    <div className="cat-switcher">
      {BUTTONS.map(({ cat, icon, label }) => (
        <button
          key={cat}
          type="button"
          className={`cat-btn${cat === active ? " active" : ""}`}
          data-cat={cat}
          onClick={() => onSelect(cat)}
        >
          <span className="ico">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Port the page chrome into `App.tsx`**

Port the top intro block and the footer from `skincare-routine.html:158-167` and the footer near line 285 verbatim, and hold the active category in local state for now:

```tsx
import { useState } from "react";
import CategorySwitcher from "./components/CategorySwitcher";
import type { Category } from "./shared/types";

export default function App() {
  const [activeCategory, setActiveCategory] = useState<Category>("face");

  return (
    <div className="wrap">
      {/* top intro block, ported verbatim */}
      <CategorySwitcher active={activeCategory} onSelect={setActiveCategory} />
      {/* Task 5 renders <CategorySection category={activeCategory} /> here */}
      {/* footer, ported verbatim */}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Eyeball it**

Run: `npm run dev`
Expected: the intro, the three category buttons with correct per-category active colours, and the footer — matching the top of the old page. The category body is empty; that is Task 5.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: port stylesheet, page chrome, and category switcher"
```

---

### Task 5: Category section — hero, gallery, day tabs, day panel

The bulk of the visual port. After this task the app renders everything the old page did.

**Files:**
- Create: `src/components/Gallery.tsx`, `src/components/DayTabs.tsx`, `src/components/DayPanel.tsx`, `src/components/CategorySection.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/CategorySection.test.tsx`
- Reference: `skincare-routine.html:174-287` (per-category markup), `323-357` (render helpers), `386-450` (panel templates)

**Interfaces:**
- Consumes: `routine` from `src/shared/routine.ts`; `Category`, `DayData`, `isHairDay` from `src/shared/types.ts`; `Icon`, `pickIcon` from Task 3
- Produces:
  - `Gallery({ products }: { products: string[] })`
  - `DayTabs({ days, activeDay, onSelect }: { days: DayData[]; activeDay: number; onSelect: (index: number) => void })`
  - `DayPanel({ day, category }: { day: DayData; category: Category })` — `category` selects the AM/PM card titles, which differ between face and body
  - `CategorySection({ category, activeDay, onSelectDay }: { category: Category; activeDay: number; onSelectDay: (index: number) => void })`

- [ ] **Step 1: Write the failing test**

`src/components/CategorySection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CategorySection from "./CategorySection";
import { routine } from "../shared/routine";

describe("CategorySection", () => {
  it("renders every product in the gallery", () => {
    render(<CategorySection category="body" activeDay={0} onSelectDay={() => {}} />);
    for (const product of routine.body.products) {
      expect(screen.getByText(product)).toBeInTheDocument();
    }
  });

  it("renders seven day tabs", () => {
    render(<CategorySection category="face" activeDay={0} onSelectDay={() => {}} />);
    expect(screen.getAllByRole("tab")).toHaveLength(7);
  });

  it("shows the active day's steps", () => {
    render(<CategorySection category="face" activeDay={4} onSelectDay={() => {}} />);
    // Friday PM is the AHA night
    expect(screen.getByText("Toner AHA Dermarium Rough Addition 8%")).toBeInTheDocument();
  });

  it("calls onSelectDay when another tab is clicked", async () => {
    const onSelectDay = vi.fn();
    render(<CategorySection category="face" activeDay={0} onSelectDay={onSelectDay} />);
    await userEvent.click(screen.getByRole("tab", { name: /T5/ }));
    expect(onSelectDay).toHaveBeenCalledWith(3);
  });

  it("renders hair days as one flat list, with no AM/PM cards", () => {
    render(<CategorySection category="hair" activeDay={1} onSelectDay={() => {}} />);
    expect(screen.getByText("Dầu Mielle Rosemary Mint Scalp & Hair Oil")).toBeInTheDocument();
    expect(document.querySelector(".card.am")).toBeNull();
  });

  it("applies the category's theme class", () => {
    const { container } = render(
      <CategorySection category="hair" activeDay={0} onSelectDay={() => {}} />,
    );
    expect(container.querySelector("section")).toHaveClass("theme-yellow");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/components/CategorySection.test.tsx`
Expected: FAIL — cannot resolve `./CategorySection`.

- [ ] **Step 3: Write `Gallery`**

`src/components/Gallery.tsx` — equivalent of `renderGallery` at `skincare-routine.html:327-336`, with the 34px size passed as a prop instead of string-replaced:

```tsx
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";

export default function Gallery({ products }: { products: string[] }) {
  return (
    <div className="gallery">
      {products.map((product) => (
        <div className="prod" key={product}>
          <Icon icon={pickIcon(product)} size={34} />
          <span>{product}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `DayTabs`**

`src/components/DayTabs.tsx` — equivalent of the tab bar built by `buildWeekTabs` at `skincare-routine.html:338-357`. Add the ARIA roles the old markup lacked; they are what the tests select on and they cost nothing visually:

```tsx
import type { DayData } from "../shared/types";

export default function DayTabs({
  days,
  activeDay,
  onSelect,
}: {
  days: DayData[];
  activeDay: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {days.map((day, index) => (
        <button
          key={day.short}
          type="button"
          role="tab"
          aria-selected={index === activeDay}
          className={`tab${index === activeDay ? " active" : ""}`}
          onClick={() => onSelect(index)}
        >
          {day.short}
          {/* Last word only: the source renders day.full.split(" ").pop(),
              so "Thứ Hai" shows as "Hai" and "Chủ Nhật" as "Nhật". */}
          <span className="d">{day.full.split(" ").pop()}</span>
        </button>
      ))}
    </div>
  );
}
```

Check the tab's inner markup against `buildWeekTabs` (`skincare-routine.html:338-357`) before finishing — the short label and the `.d` span must appear in the same order as the original.

- [ ] **Step 5: Write `DayPanel`**

`src/components/DayPanel.tsx` — merges `renderSteps` (`skincare-routine.html:323-325`) with the three per-category panel templates (`386-389`, `413-415`, `446-448`). Face and body share the AM/PM card pair; hair gets one card.

The three templates differ in two ways beyond structure, both easy to lose in a port — the face badge carries a prefix the others don't, and each category has its own card titles and subtitles. Verified against the source, they are:

| Category | Badge text | AM title / subtitle | PM title / subtitle |
| --- | --- | --- | --- |
| face | `Trọng tâm tối nay: {focus}` | `Buổi sáng` / `Chăm da ban ngày` | `Buổi tối` / `Chăm da ban đêm` |
| body | `{focus}` | `Sau khi tắm` / `Chăm thể ban ngày` | `Trước khi ngủ` / `Chăm thể ban đêm` |
| hair | `{type}` | single card: `Chăm tóc hôm nay` / `{type}` | — |

Put these in one lookup keyed by category rather than branching inline:

```tsx
import { Icon } from "../icons/icons";
import { pickIcon } from "../icons/pickIcon";
import { isHairDay, type DayData, type StepTuple } from "../shared/types";

function Steps({ steps }: { steps: StepTuple[] }) {
  return (
    <ul className="steps">
      {steps.map(([product, note], index) => (
        <li key={`${product}-${index}`}>
          <div className="icon-badge">
            <Icon icon={pickIcon(product)} />
          </div>
          <div>
            <strong>{product}</strong>
            {note ? <span className="note">{note}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function DayPanel({ day }: { day: DayData }) {
  if (isHairDay(day)) {
    return (
      <div className="panel active">
        <div className="badge-row">
          <span className="badge focus">{day.full}</span>
          <span className="badge">{day.type}</span>
        </div>
        <Card title="Chăm tóc hôm nay" subtitle={day.type}>
          <Steps steps={day.steps} />
        </Card>
      </div>
    );
  }

  const copy = PANEL_COPY[category];
  return (
    <div className="panel active">
      <div className="badge-row">
        <span className="badge focus">{day.full}</span>
        <span className="badge">{copy.badgePrefix}{day.focus}</span>
      </div>
      <Card className="am" title={copy.am.title} subtitle={copy.am.subtitle}>
        <Steps steps={day.am} />
      </Card>
      <Card className="pm" title={copy.pm.title} subtitle={copy.pm.subtitle}>
        <Steps steps={day.pm} />
      </Card>
    </div>
  );
}
```

where `PANEL_COPY` holds the face and body rows from the table above (`badgePrefix` is `"Trọng tâm tối nay: "` for face and `""` for body), and `Card` wraps the existing `.card` / `.card-head` / `.card-title` / `.card-sub` markup with the flower icon, matching `skincare-routine.html:388`. The hair card carries no `am`/`pm` class — the old page's single hair card has none either, and the Task 5 test asserts `.card.am` is absent for hair.

- [ ] **Step 6: Write `CategorySection`**

`src/components/CategorySection.tsx` — the hero, legend, note boxes, and recommendation blocks are static markup; port them verbatim per category from `skincare-routine.html:174-287`. Theme classes come from a lookup:

```tsx
import Gallery from "./Gallery";
import DayTabs from "./DayTabs";
import DayPanel from "./DayPanel";
import { routine } from "../shared/routine";
import type { Category } from "../shared/types";

const THEME_CLASS: Record<Category, string> = {
  face: "",
  hair: "theme-yellow",
  body: "theme-almond",
};

export default function CategorySection({
  category,
  activeDay,
  onSelectDay,
}: {
  category: Category;
  activeDay: number;
  onSelectDay: (index: number) => void;
}) {
  const data = routine[category];

  return (
    <section className={`category ${THEME_CLASS[category]}`.trim()}>
      {/* hero, legend, note boxes: ported verbatim for this category */}
      <Gallery products={data.products} />
      <DayTabs days={data.days} activeDay={activeDay} onSelect={onSelectDay} />
      <DayPanel day={data.days[activeDay]} category={category} />
    </section>
  );
}
```

- [ ] **Step 7: Wire it into `App.tsx`**

Add per-category day state alongside the category state from Task 4:

```tsx
const [activeDayByCategory, setActiveDayByCategory] = useState<Record<Category, number>>({
  face: 0,
  hair: 0,
  body: 0,
});
```

and render `<CategorySection category={activeCategory} activeDay={activeDayByCategory[activeCategory]} onSelectDay={(index) => setActiveDayByCategory((prev) => ({ ...prev, [activeCategory]: index }))} />`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Side-by-side check**

Run: `npm run dev`, and open `skincare-routine.html` in a second window. Walk all three categories and all seven tabs in each. Everything must match: steps, notes, icons, badges, card titles, hero copy, colours.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: port gallery, day tabs, and day panels for all three categories"
```

---

### Task 6: Default state and the localStorage mirror

Pure logic, no React. `reconcile` is the fix for the data-loss path the design review found, so its tests are the important ones.

**Files:**
- Create: `src/shared/defaults.ts`, `src/state/storage.ts`
- Test: `src/state/storage.test.ts`

**Interfaces:**
- Consumes: `AppState` from `src/shared/types.ts`; `todayIso` from `src/shared/date.ts`
- Produces: `makeDefaultState(now?: Date): AppState` from `src/shared/defaults.ts`; from `src/state/storage.ts` — `MIRROR_KEY: string`, `readMirror(): AppState | null`, `writeMirror(state: AppState): void`, and `reconcile(remote: AppState | null, local: AppState | null): { state: AppState; source: "remote" | "local" | "default" }`

- [ ] **Step 1: Write `makeDefaultState`**

`src/shared/defaults.ts`:

```ts
import { todayIso } from "./date";
import type { AppState } from "./types";

export function makeDefaultState(now: Date = new Date()): AppState {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    programStartDate: todayIso(now),
    ui: {
      activeCategory: "face",
      activeDayByCategory: { face: 0, hair: 0, body: 0 },
    },
  };
}
```

- [ ] **Step 2: Write the failing test**

`src/state/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { MIRROR_KEY, readMirror, reconcile, writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";
import type { AppState } from "../shared/types";

function stateAt(updatedAt: string, programStartDate = "2026-08-24"): AppState {
  return { ...makeDefaultState(), updatedAt, programStartDate };
}

beforeEach(() => {
  localStorage.clear();
});

describe("mirror", () => {
  it("round-trips a state through localStorage", () => {
    const state = stateAt("2026-08-30T10:00:00.000Z");
    writeMirror(state);
    expect(readMirror()).toEqual(state);
  });

  it("returns null when nothing is stored", () => {
    expect(readMirror()).toBeNull();
  });

  it("returns null rather than throwing on corrupt JSON", () => {
    localStorage.setItem(MIRROR_KEY, "{not json");
    expect(readMirror()).toBeNull();
  });
});

describe("reconcile", () => {
  it("prefers the remote copy when it is newer", () => {
    const remote = stateAt("2026-08-30T12:00:00.000Z");
    const local = stateAt("2026-08-30T10:00:00.000Z");
    expect(reconcile(remote, local)).toEqual({ state: remote, source: "remote" });
  });

  it("prefers the local copy when it is newer", () => {
    const remote = stateAt("2026-08-30T10:00:00.000Z");
    const local = stateAt("2026-08-30T12:00:00.000Z");
    expect(reconcile(remote, local)).toEqual({ state: local, source: "local" });
  });

  it("uses the remote copy when there is no mirror", () => {
    const remote = stateAt("2026-08-30T10:00:00.000Z");
    expect(reconcile(remote, null)).toEqual({ state: remote, source: "remote" });
  });

  it("uses the mirror when the remote read failed", () => {
    const local = stateAt("2026-08-30T10:00:00.000Z");
    expect(reconcile(null, local)).toEqual({ state: local, source: "local" });
  });

  it("falls back to a default when neither exists", () => {
    const result = reconcile(null, null);
    expect(result.source).toBe("default");
    expect(result.state.version).toBe(1);
    expect(result.state.ui.activeCategory).toBe("face");
  });

  it("prefers remote on an exact timestamp tie", () => {
    const remote = stateAt("2026-08-30T10:00:00.000Z", "2026-01-01");
    const local = stateAt("2026-08-30T10:00:00.000Z", "2026-02-02");
    expect(reconcile(remote, local).state.programStartDate).toBe("2026-01-01");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/state/storage.test.ts`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 4: Write the implementation**

`src/state/storage.ts`:

```ts
import { makeDefaultState } from "../shared/defaults";
import type { AppState } from "../shared/types";

export const MIRROR_KEY = "skincare.state.v1";

export function readMirror(): AppState | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMirror(state: AppState): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or blocked (private mode). The remote copy is the
    // durable one; losing the fallback cache is not worth surfacing.
  }
}

/**
 * Picks whichever copy is newer. This is what stops a successful mount-time
 * GET from silently discarding a newer local state whose last PUT failed.
 * Ties go to remote, which is arbitrary but stable.
 */
export function reconcile(
  remote: AppState | null,
  local: AppState | null,
): { state: AppState; source: "remote" | "local" | "default" } {
  if (remote && local) {
    return local.updatedAt > remote.updatedAt
      ? { state: local, source: "local" }
      : { state: remote, source: "remote" };
  }
  if (remote) return { state: remote, source: "remote" };
  if (local) return { state: local, source: "local" };
  return { state: makeDefaultState(), source: "default" };
}
```

ISO-8601 UTC timestamps compare correctly as strings, which is why no date parsing is needed here.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add default state and localStorage mirror with newest-wins reconciliation"
```

---

### Task 7: The `useRemoteState` sync hook

The one piece of genuinely new logic in this sub-project.

**Files:**
- Create: `src/state/useRemoteState.ts`
- Test: `src/state/useRemoteState.test.ts`

**Interfaces:**
- Consumes: `reconcile`, `readMirror`, `writeMirror` from `src/state/storage.ts`; `AppState`, `SyncStatus` from `src/shared/types.ts`
- Produces: `useRemoteState(): { state: AppState; update: (mutate: (prev: AppState) => AppState) => void; status: SyncStatus; loaded: boolean }`

- [ ] **Step 1: Write the failing test**

`src/state/useRemoteState.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteState } from "./useRemoteState";
import { writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";

const remoteState = { ...makeDefaultState(), updatedAt: "2026-08-30T10:00:00.000Z" };

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "https://worker.test");
  vi.stubEnv("VITE_WRITE_TOKEN", "secret");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("useRemoteState", () => {
  it("loads state from the worker on mount", async () => {
    mockFetch(async () => jsonResponse(remoteState));
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.updatedAt).toBe(remoteState.updatedAt);
    expect(result.current.status).toBe("synced");
  });

  it("falls back to the mirror when the worker is unreachable", async () => {
    writeMirror({ ...makeDefaultState(), updatedAt: "2026-08-29T10:00:00.000Z", programStartDate: "2026-07-01" });
    mockFetch(async () => {
      throw new TypeError("network error");
    });
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.programStartDate).toBe("2026-07-01");
    expect(result.current.status).toBe("offline");
  });

  it("falls back to a default when the worker fails and no mirror exists", async () => {
    mockFetch(async () => {
      throw new TypeError("network error");
    });
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.ui.activeCategory).toBe("face");
    expect(result.current.status).toBe("offline");
  });

  it("pushes the mirror to the worker when the local copy is newer", async () => {
    writeMirror({ ...makeDefaultState(), updatedAt: "2026-08-31T10:00:00.000Z", programStartDate: "2026-07-01" });
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.state.programStartDate).toBe("2026-07-01"));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://worker.test/state",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("debounces writes and sends the write token", async () => {
    const fetchSpy = mockFetch(async (_url, init) =>
      init?.method === "PUT" ? new Response(null, { status: 204 }) : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-01" }));
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-02" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const puts = fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "PUT");
    expect(puts).toHaveLength(1);
    expect((puts[0][1] as RequestInit).headers).toMatchObject({ "X-Write-Token": "secret" });
    expect(JSON.parse((puts[0][1] as RequestInit).body as string).programStartDate).toBe("2026-01-02");
  });

  it("keeps local state and mirrors it when the write fails", async () => {
    mockFetch(async (_url, init) => {
      if (init?.method === "PUT") throw new TypeError("network error");
      return jsonResponse(remoteState);
    });
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-01" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.state.programStartDate).toBe("2026-01-01");
    expect(result.current.status).toBe("offline");
    expect(JSON.parse(localStorage.getItem("skincare.state.v1")!).programStartDate).toBe("2026-01-01");
  });

  it("reports unauthorized when the worker rejects the token", async () => {
    mockFetch(async (_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({ error: "unauthorized" }, 401)
        : jsonResponse(remoteState),
    );
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, programStartDate: "2026-01-01" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.status).toBe("unauthorized");
  });

  it("reports unauthorized and never fetches when no worker URL is configured", async () => {
    vi.stubEnv("VITE_WORKER_URL", "");
    const fetchSpy = mockFetch(async () => jsonResponse(remoteState));
    const { result } = renderHook(() => useRemoteState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBe("unauthorized");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/state/useRemoteState.test.ts`
Expected: FAIL — cannot resolve `./useRemoteState`.

- [ ] **Step 3: Write the hook**

`src/state/useRemoteState.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { readMirror, reconcile, writeMirror } from "./storage";
import { makeDefaultState } from "../shared/defaults";
import type { AppState, SyncStatus } from "../shared/types";

const DEBOUNCE_MS = 500;

function workerUrl(): string | null {
  const base = import.meta.env.VITE_WORKER_URL;
  return base ? `${base.replace(/\/$/, "")}/state` : null;
}

async function putState(state: AppState): Promise<SyncStatus> {
  const url = workerUrl();
  if (!url) return "unauthorized";
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Write-Token": import.meta.env.VITE_WRITE_TOKEN ?? "",
      },
      body: JSON.stringify(state),
    });
    if (response.status === 401) return "unauthorized";
    return response.ok ? "synced" : "offline";
  } catch {
    return "offline";
  }
}

export function useRemoteState() {
  const [state, setState] = useState<AppState>(() => makeDefaultState());
  const [status, setStatus] = useState<SyncStatus>("synced");
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount: read both copies, keep the newer, and push local up if it won.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const url = workerUrl();
      const local = readMirror();
      let remote: AppState | null = null;
      let failed = false;

      if (url) {
        try {
          const response = await fetch(url);
          if (response.ok) remote = (await response.json()) as AppState;
          else failed = true;
        } catch {
          failed = true;
        }
      }

      if (cancelled) return;

      const { state: resolved, source } = reconcile(remote, local);
      setState(resolved);
      writeMirror(resolved);
      setLoaded(true);

      if (!url) setStatus("unauthorized");
      else if (failed) setStatus("offline");
      else if (source === "local") setStatus(await putState(resolved));
      else setStatus("synced");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((mutate: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = { ...mutate(prev), updatedAt: new Date().toISOString() };
      writeMirror(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void putState(next).then(setStatus);
      }, DEBOUNCE_MS);
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { state, update, status, loaded };
}
```

Note `update` stamps `updatedAt` itself — no caller should set it, or the reconciliation guarantee breaks.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS, 8 tests in this file.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add useRemoteState hook with debounced writes and offline fallback"
```

---

### Task 8: `AppStateProvider` and wiring the UI to persisted state

Replaces Task 4/5's local `useState` with the real thing. This Context is the seam sub-projects 2–5 extend.

**Files:**
- Create: `src/state/AppStateProvider.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/state/AppStateProvider.test.tsx`

**Interfaces:**
- Consumes: `useRemoteState` from Task 7
- Produces: `AppStateProvider({ children }: { children: ReactNode })` and `useAppState(): { state: AppState; status: SyncStatus; loaded: boolean; setActiveCategory: (c: Category) => void; setActiveDay: (c: Category, day: number) => void; setProgramStartDate: (iso: string) => void }`

- [ ] **Step 1: Write the failing test**

`src/state/AppStateProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStateProvider, useAppState } from "./AppStateProvider";

function Probe() {
  const { state, setActiveCategory, setActiveDay } = useAppState();
  return (
    <div>
      <span data-testid="category">{state.ui.activeCategory}</span>
      <span data-testid="day">{state.ui.activeDayByCategory[state.ui.activeCategory]}</span>
      <button onClick={() => setActiveCategory("hair")}>to hair</button>
      <button onClick={() => setActiveDay("hair", 4)}>hair day 4</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppStateProvider", () => {
  it("exposes state and updates the active category", async () => {
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("category")).toHaveTextContent("face"));
    await userEvent.click(screen.getByText("to hair"));
    expect(screen.getByTestId("category")).toHaveTextContent("hair");
  });

  it("tracks the active day per category", async () => {
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("category")).toHaveTextContent("face"));
    await userEvent.click(screen.getByText("hair day 4"));
    expect(screen.getByTestId("day")).toHaveTextContent("0"); // face is still active
    await userEvent.click(screen.getByText("to hair"));
    expect(screen.getByTestId("day")).toHaveTextContent("4");
  });

  it("throws a useful error when used outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AppStateProvider/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/state/AppStateProvider.test.tsx`
Expected: FAIL — cannot resolve `./AppStateProvider`.

- [ ] **Step 3: Write the provider**

`src/state/AppStateProvider.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRemoteState } from "./useRemoteState";
import type { AppState, Category, SyncStatus } from "../shared/types";

type AppStateContextValue = {
  state: AppState;
  status: SyncStatus;
  loaded: boolean;
  setActiveCategory: (category: Category) => void;
  setActiveDay: (category: Category, day: number) => void;
  setProgramStartDate: (iso: string) => void;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { state, update, status, loaded } = useRemoteState();

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      status,
      loaded,
      setActiveCategory: (category) =>
        update((prev) => ({ ...prev, ui: { ...prev.ui, activeCategory: category } })),
      setActiveDay: (category, day) =>
        update((prev) => ({
          ...prev,
          ui: {
            ...prev.ui,
            activeDayByCategory: { ...prev.ui.activeDayByCategory, [category]: day },
          },
        })),
      setProgramStartDate: (iso) => update((prev) => ({ ...prev, programStartDate: iso })),
    }),
    [state, status, loaded, update],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside an AppStateProvider");
  return value;
}
```

- [ ] **Step 4: Rewrite `App.tsx` to consume the context**

Remove both `useState` calls added in Tasks 4 and 5 and read from `useAppState()` instead. Wrap the tree in `main.tsx`:

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>,
);
```

`CategorySwitcher`, `DayTabs`, `CategorySection`, and `DayPanel` keep their existing props — `App` is the only component that talks to the context. Keeping the presentational components context-free is what lets sub-project 3 render them in an editing mode later.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS. The Task 4 and 5 component tests must still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: persist active category and day through AppStateProvider"
```

---

### Task 9: Sync notice and settings panel

**Files:**
- Create: `src/components/SyncNotice.tsx`, `src/components/SettingsPanel.tsx`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/components/SyncNotice.test.tsx`, `src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `useAppState` from Task 8; `SyncStatus` from `src/shared/types.ts`
- Produces: `SyncNotice({ status }: { status: SyncStatus })`; `SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void })`

- [ ] **Step 1: Write the failing tests**

`src/components/SyncNotice.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SyncNotice from "./SyncNotice";

describe("SyncNotice", () => {
  it("renders nothing when synced", () => {
    const { container } = render(<SyncNotice status="synced" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline message", () => {
    render(<SyncNotice status="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Ngoại tuyến");
  });

  it("shows a distinct message for a configuration problem", () => {
    render(<SyncNotice status="unauthorized" />);
    expect(screen.getByRole("status")).toHaveTextContent("kiểm tra cấu hình");
  });
});
```

`src/components/SettingsPanel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel";
import { AppStateProvider } from "../state/AppStateProvider";

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("VITE_WORKER_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SettingsPanel", () => {
  it("edits the program start date", async () => {
    render(
      <AppStateProvider>
        <SettingsPanel open onClose={() => {}} />
      </AppStateProvider>,
    );
    const input = await screen.findByLabelText(/Ngày bắt đầu/);
    // fireEvent.change, not userEvent.type — typing into a date input is
    // unreliable in jsdom because it has no date-picker behaviour.
    fireEvent.change(input, { target: { value: "2026-07-01" } });
    await waitFor(() => expect(input).toHaveValue("2026-07-01"));
    expect(JSON.parse(localStorage.getItem("skincare.state.v1")!).programStartDate).toBe("2026-07-01");
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AppStateProvider>
        <SettingsPanel open={false} onClose={() => {}} />
      </AppStateProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/components/SyncNotice.test.tsx src/components/SettingsPanel.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `SyncNotice`**

```tsx
import type { SyncStatus } from "../shared/types";

const MESSAGES: Record<Exclude<SyncStatus, "synced">, string> = {
  offline: "Ngoại tuyến — đang hiển thị dữ liệu đã lưu",
  unauthorized: "Đồng bộ đang tắt — kiểm tra cấu hình",
};

export default function SyncNotice({ status }: { status: SyncStatus }) {
  if (status === "synced") return null;
  return (
    <div className={`sync-notice sync-notice--${status}`} role="status">
      {MESSAGES[status]}
    </div>
  );
}
```

- [ ] **Step 4: Write `SettingsPanel`**

```tsx
import { useAppState } from "../state/AppStateProvider";
import SyncNotice from "./SyncNotice";

export default function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, status, setProgramStartDate } = useAppState();
  if (!open) return null;

  return (
    <div className="settings">
      <label className="settings-field" htmlFor="program-start">
        Ngày bắt đầu routine
      </label>
      <input
        id="program-start"
        type="date"
        value={state.programStartDate}
        onChange={(event) => setProgramStartDate(event.target.value)}
      />
      <SyncNotice status={status} />
      <button type="button" onClick={onClose}>
        Đóng
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add the styles and mount it**

Add `.sync-notice`, `.sync-notice--offline`, `.sync-notice--unauthorized`, `.settings`, and `.settings-field` rules to `src/styles.css`, built from the existing variables (`--blush-deep` background, `--rose-ink` text, `18px` radius) so the new surfaces match the rest of the page. Give `--unauthorized` a stronger border so it reads as a real problem rather than a transient one.

In `App.tsx`, add a settings button to the header, hold `const [settingsOpen, setSettingsOpen] = useState(false)`, and render `<SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />` plus a top-level `<SyncNotice status={status} />`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add sync status notice and settings panel with program start date"
```

---

### Task 10: The Cloudflare Worker

**Files:**
- Create: `worker/index.ts`, `worker/handlers.test.ts`, `wrangler.toml`
- Modify: `vite.config.ts` (add `worker/` to the Vitest include path)

**Interfaces:**
- Consumes: `makeDefaultState` from `src/shared/defaults.ts`; `AppState` from `src/shared/types.ts`
- Produces: `handleRequest(request: Request, env: Env): Promise<Response>` and `type Env = { STATE: KVNamespace; WRITE_TOKEN: string; ALLOWED_ORIGIN: string }` from `worker/index.ts`; `STATE_KEY = "state:default"`

- [ ] **Step 1: Write the failing test**

`worker/handlers.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { handleRequest, STATE_KEY, type Env } from "./index";
import { makeDefaultState } from "../src/shared/defaults";

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

let env: Env & { STATE: ReturnType<typeof fakeKv> };

beforeEach(() => {
  env = {
    STATE: fakeKv(),
    WRITE_TOKEN: "secret",
    ALLOWED_ORIGIN: "https://example.github.io",
  } as unknown as Env & { STATE: ReturnType<typeof fakeKv> };
});

describe("GET /state", () => {
  it("seeds KV with a default state on first read", async () => {
    const response = await handleRequest(new Request("https://w.test/state"), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ version: 1 });
    // The seed must be persisted, not just returned — otherwise every load
    // mints a fresh programStartDate and the week number never advances.
    expect(env.STATE.store.get(STATE_KEY)).toBeTruthy();
  });

  it("returns the same programStartDate on a second read", async () => {
    const first = await (await handleRequest(new Request("https://w.test/state"), env)).json();
    const second = await (await handleRequest(new Request("https://w.test/state"), env)).json();
    expect(second.programStartDate).toBe(first.programStartDate);
  });

  it("returns the stored state when one exists", async () => {
    const stored = { ...makeDefaultState(), programStartDate: "2026-01-01" };
    await env.STATE.put(STATE_KEY, JSON.stringify(stored));
    const body = await (await handleRequest(new Request("https://w.test/state"), env)).json();
    expect(body.programStartDate).toBe("2026-01-01");
  });
});

describe("PUT /state", () => {
  function putRequest(body: unknown, token?: string) {
    return new Request("https://w.test/state", {
      method: "PUT",
      headers: token ? { "X-Write-Token": token } : {},
      body: JSON.stringify(body),
    });
  }

  it("stores the body with a valid token", async () => {
    const state = { ...makeDefaultState(), programStartDate: "2026-02-02" };
    const response = await handleRequest(putRequest(state, "secret"), env);
    expect(response.status).toBe(204);
    expect(JSON.parse(env.STATE.store.get(STATE_KEY)!).programStartDate).toBe("2026-02-02");
  });

  it("rejects a missing token", async () => {
    const response = await handleRequest(putRequest(makeDefaultState()), env);
    expect(response.status).toBe(401);
    expect(env.STATE.store.size).toBe(0);
  });

  it("rejects a wrong token", async () => {
    const response = await handleRequest(putRequest(makeDefaultState(), "nope"), env);
    expect(response.status).toBe(401);
  });

  it("rejects a body that is not a version 1 state", async () => {
    const response = await handleRequest(putRequest({ hello: "world" }, "secret"), env);
    expect(response.status).toBe(400);
  });
});

describe("CORS", () => {
  it("answers the preflight with the allowed headers", async () => {
    const response = await handleRequest(
      new Request("https://w.test/state", { method: "OPTIONS" }),
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.github.io");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-Write-Token");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  });

  it("sets CORS headers on success, error, and 404 responses alike", async () => {
    const ok = await handleRequest(new Request("https://w.test/state"), env);
    const unauthorized = await handleRequest(
      new Request("https://w.test/state", { method: "PUT", body: "{}" }),
      env,
    );
    const missing = await handleRequest(new Request("https://w.test/nope"), env);
    for (const response of [ok, unauthorized, missing]) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.github.io");
    }
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 2: Point Vitest at the worker directory**

In `vite.config.ts`, set `test.include` to `["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"]`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- worker/handlers.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 4: Write the Worker**

`worker/index.ts`:

```ts
import { makeDefaultState } from "../src/shared/defaults";
import type { AppState } from "../src/shared/types";

export const STATE_KEY = "state:default";

export type Env = {
  STATE: KVNamespace;
  WRITE_TOKEN: string;
  ALLOWED_ORIGIN: string;
};

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Write-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function isAppState(value: unknown): value is AppState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as AppState).version === 1 &&
    typeof (value as AppState).updatedAt === "string"
  );
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (pathname !== "/state") {
    return json({ error: "not found" }, 404, env);
  }

  if (request.method === "GET") {
    const stored = await env.STATE.get(STATE_KEY);
    if (stored) {
      return new Response(stored, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }
    // Seed and persist, so programStartDate is fixed from the first visit.
    const seeded = makeDefaultState();
    await env.STATE.put(STATE_KEY, JSON.stringify(seeded));
    return json(seeded, 200, env);
  }

  if (request.method === "PUT") {
    if (request.headers.get("X-Write-Token") !== env.WRITE_TOKEN) {
      return json({ error: "unauthorized" }, 401, env);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid state" }, 400, env);
    }
    if (!isAppState(body)) {
      return json({ error: "invalid state" }, 400, env);
    }
    await env.STATE.put(STATE_KEY, JSON.stringify(body));
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  return json({ error: "not found" }, 404, env);
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Write `wrangler.toml`**

```toml
name = "skincare-state"
main = "worker/index.ts"
compatibility_date = "2026-08-01"

[vars]
ALLOWED_ORIGIN = "https://<user>.github.io"

[[kv_namespaces]]
binding = "STATE"
id = "<kv-namespace-id>"
```

Replace both placeholders with the real values from the prerequisites in the spec. `WRITE_TOKEN` is deliberately absent — it is a secret, set with `wrangler secret put WRITE_TOKEN`, never committed.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS, 10 tests in the worker file.

- [ ] **Step 7: Verify against a real Worker**

Run: `npm run worker:dev`, then in another terminal:

```bash
curl -i http://localhost:8787/state
```

Expected: `200` with a JSON `AppState`, and a second identical call returns the same `programStartDate`.

```bash
curl -i -X PUT http://localhost:8787/state -H 'Content-Type: application/json' -d '{"version":1,"updatedAt":"2026-08-31T00:00:00.000Z","programStartDate":"2026-07-01","ui":{"activeCategory":"face","activeDayByCategory":{"face":0,"hair":0,"body":0}}}'
```

Expected: `401` (no token locally unless you set one via `.dev.vars`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Cloudflare Worker state API with CORS and first-run seeding"
```

---

### Task 11: CI workflows for Pages and the Worker

**Files:**
- Create: `.github/workflows/deploy-pages.yml`, `.github/workflows/deploy-worker.yml`

**Interfaces:**
- Consumes: `npm run test`, `npm run build`, `wrangler.toml` from earlier tasks
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the Pages workflow**

`.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test
      - run: npm run build
        env:
          BASE_PATH: /skincare-routine-webapp/
          VITE_WORKER_URL: ${{ secrets.VITE_WORKER_URL }}
          VITE_WRITE_TOKEN: ${{ secrets.WRITE_TOKEN }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Tests run before the build, so a red suite blocks the deploy.

- [ ] **Step 2: Write the Worker workflow**

`.github/workflows/deploy-worker.yml`:

```yaml
name: Deploy Worker

on:
  push:
    branches: [main]
    paths:
      - "worker/**"
      - "src/shared/**"
      - "wrangler.toml"
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

The `src/shared/**` path filter matters: the Worker imports shared modules, so a change there must redeploy it. Sub-project 5 depends on this being right — a routine change that reaches the site but not the Worker is exactly the drift the push design warns about.

- [ ] **Step 3: Push and watch both workflows**

```bash
git add -A
git commit -m "ci: add GitHub Actions workflows for Pages and Worker deploys"
git push origin main
```

Expected: both workflows go green, and the Pages URL serves the app. If assets 404, `BASE_PATH` does not match the repo name — fix it in the workflow, not by hardcoding paths.

---

### Task 12: Parity verification and retiring the old file

The last task. Nothing here is optional — this is what makes the port trustworthy.

**Files:**
- Delete: `skincare-routine.html`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Work the parity checklist**

Open the deployed site and `skincare-routine.html` side by side, and confirm every item in the spec's "Definition of done" section 4:

- all three categories switch and carry their own palette
- all 7 day tabs in each category render the same steps, notes, and card structure
- every gallery product shows the same icon as before
- hero copy, note boxes, legend dots, and footer are unchanged

Record anything that differs and fix it before continuing. Do not proceed with a known difference.

- [ ] **Step 2: Verify persistence**

Switch to hair, select T5, reload. Expected: hair/T5 restored. Then open the site in a fresh browser profile and confirm it still shows hair/T5 — proving the state came from the Worker rather than `localStorage`.

- [ ] **Step 3: Verify offline behaviour**

In devtools, block the Worker URL. Reload. Expected: the app renders from the mirror and shows `Ngoại tuyến — đang hiển thị dữ liệu đã lưu`. Change the active day while blocked, reload — the change survives. Unblock, change the day again, and confirm a fresh profile now sees it.

- [ ] **Step 4: Verify the settings field**

Set the program start date to a past date, reload, confirm it persisted, and confirm `curl <worker-url>/state` returns the same value.

- [ ] **Step 5: Delete the old file and rewrite `CLAUDE.md`**

Remove `skincare-routine.html`. Rewrite `CLAUDE.md` so it describes the current project: React + Vite + TypeScript, `npm run dev` / `test` / `build`, the `src/shared` boundary and why it exists, the Worker API and its one KV key, where routine content lives, how theming works, and the fact that all persistence goes through `useRemoteState`. Delete the claims that are no longer true — "single self-contained HTML file", "no build tools", "no test suite", "no git repo initialized".

- [ ] **Step 6: Final verification**

Run: `npm run test && npm run build`
Expected: all tests pass; build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: retire single-file prototype and update project docs"
git push origin main
```

---

## Notes for whoever executes this

- **Tasks 2, 4, and 5 are transcription, not authorship.** Copy from `skincare-routine.html`; do not regenerate content from memory. Every Vietnamese string in this app is a real product the user owns.
- **The tests in Tasks 6 and 7 are the ones that matter.** They encode the two design-review fixes (newest-wins reconciliation, persisted first-run seed). If a test there seems awkward to satisfy, the implementation is probably wrong — do not relax the test.
- **Do not add features from sub-projects 2–5.** No checkboxes, no streaks, no manifest, no service worker, no push. The seams are in place for them; that is enough.
