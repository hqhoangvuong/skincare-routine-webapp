# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal weekly skincare/hair/body-care routine tracker in Vietnamese, built as a React + Vite +
TypeScript frontend backed by a small Cloudflare Worker that stores the user's state (which category/day
tab is open, the program start date) in a single KV key. It deploys as two independent artifacts from one
repo: the frontend to GitHub Pages, the Worker to Cloudflare.

The routine content — every product name, every day's steps, every note — was ported verbatim from the
project's original prototype, a single self-contained `skincare-routine.html` file. That file has been
deleted (its job was to be the parity baseline for the rebuild; it is preserved in git history if you need
to diff against it), but the mindset it implies still matters: **this app has one real user with one real
routine.** Every Vietnamese string is a product she owns. Don't paraphrase, "improve," or regenerate
routine content from memory — if it needs to change, it changes because she said so.

## Running / developing

```
npm install
npm run dev            # Vite dev server (frontend only, http://localhost:5173)
npm run worker:dev      # wrangler dev, for the Worker API locally
npm run test            # vitest run — frontend + worker tests, one suite
npm run test:watch      # vitest, watch mode
npm run typecheck       # tsc --noEmit on both tsconfig.json and tsconfig.worker.json
npm run build           # typecheck, then vite build (fails the build on any TS error)
npm run worker:deploy   # wrangler deploy
```

There is no lint step. `strict: true` plus the test suite are the safety net.

With no `.env`/`.env.local` set (copy `.env.example` to start), `npm run dev` runs the frontend in
**local-only mode**: no `VITE_WORKER_URL` means the app never talks to a Worker, state lives only in
`localStorage`, and the UI shows the "sync đang tắt" notice. This is intentional — it keeps local dev
usable with no Cloudflare account. To exercise real sync locally, run `npm run worker:dev` in one terminal
and point `VITE_WORKER_URL` at it (`http://127.0.0.1:8787` by default) in `.env.local`.

## Architecture

```
src/
  main.tsx, App.tsx           React root and top-level layout
  styles.css                  the ported stylesheet (plain CSS, no framework)
  components/                 CategorySwitcher, CategorySection, Gallery, DayTabs,
                               DayPanel, SettingsPanel, SyncNotice — all presentational,
                               driven by props, no direct state access
  state/
    AppStateProvider.tsx      React Context; useAppState() is the one hook components use
    useRemoteState.ts         mount-time reconciliation, debounced writes, offline fallback
    storage.ts                localStorage mirror + reconcile() — pure, no React
  icons/                      icons.tsx (ICONS map) and pickIcon.ts (keyword matching)
  shared/                     IMPORTED BY BOTH THE FRONTEND AND THE WORKER — see below
    types.ts                  AppState, Category, DayData, isAppState() guard
    routine.ts                the shipped routine content (the ported data)
    date.ts                   timezone-pinned date helpers
    defaults.ts                makeDefaultState()
worker/
  handlers.ts                 routing, CORS, token check, KV access — all the logic
  index.ts                    default export only (see "Why index.ts is nearly empty")
```

### Routine content and rendering

- **Three categories, one shared layout.** `CategorySwitcher` toggles `state.ui.activeCategory` between
  `"face" | "hair" | "body"`. `CategorySection` renders whichever category is active — hero, product
  gallery, day tabs, and the active day's panel — using the same components for all three; only the data
  and the theme class differ.
- **Content is data, not markup.** `src/shared/routine.ts` exports `faceProducts`/`faceDays`,
  `hairProducts`/`hairDays`, `bodyProducts`/`bodyDays`, assembled into `routine: Record<Category,
  CategoryData>`. Face and body days have `{ am: StepTuple[], pm: StepTuple[] }`; hair days have a flat
  `steps: StepTuple[]`. A `StepTuple` is `[productName, note]`, where `note` is `""` when there isn't one.
  To change what's shown on a given day, edit the relevant entry in `faceDays`/`hairDays`/`bodyDays` in
  `routine.ts` — no component changes needed. `DayPanel.tsx` holds the per-category copy (card titles,
  subtitles, and the face-only "Trọng tâm tối nay: " badge prefix) in one `PANEL_COPY` lookup.
- **Theming via scoped CSS variables**, unchanged from the original: colors are defined once on `:root`
  (the face/rose palette) and overridden by `.theme-yellow` (hair) and `.theme-almond` (body) classes on
  the `<section class="category">` element. Add a new palette by defining a new `.theme-*` block that
  redeclares the same variable names — don't hardcode colors in component rules.
- **Icons are picked by keyword matching.** `pickIcon(name)` in `src/icons/pickIcon.ts` inspects the
  Vietnamese product name and returns an `IconKey` into the `ICONS` map in `src/icons/icons.tsx` (e.g.
  names containing `"tẩy da chết"` get the exfoliant icon). Branch order matters — several branches would
  match the same string and the first one wins — so when adding a new product name, check `pickIcon` to
  confirm it lands on an existing rule or falls back sensibly to `flower`; add a new branch only for a
  genuinely new product type, and add it in the right position relative to the existing ones.

### State and persistence

Nothing is rendered from local component state beyond which settings panel is open. Everything else —
active category, active day per category, `programStartDate` — lives in `AppState` (`src/shared/types.ts`)
and flows through one path:

- `useRemoteState()` (`src/state/useRemoteState.ts`) owns the `AppState`, exposes `update(mutate)`, and is
  the only thing that talks to `localStorage` or the Worker. Its initial state is the `localStorage`
  mirror (so the persisted selection paints immediately instead of after the round trip). On mount it
  does a `GET /state` and keeps whichever copy has the newer `updatedAt` (`storage.ts#reconcile`) — this
  is what stops a successful mount-time `GET` from silently discarding a newer local state whose last
  `PUT` failed. The local side of that reconcile is the *live* in-memory state whenever the user has
  already touched something (tracked by a `dirty` ref), not the pre-fetch mirror snapshot: otherwise a tap
  made during the round trip is erased from the screen and the mirror while its debounced `PUT` still
  reaches KV. `update()` itself is a pure `setState`; mirroring and the debounced (500ms) `PUT` happen in
  an effect keyed on the committed state, so nothing is persisted from a render React abandons or
  double-invokes. A `GET` that returns 200 with a body failing `isAppState()` is reported distinctly from
  a network failure (`fetchRemote` returns `{ ok: "invalid" }`) and is repaired by pushing the local copy
  over it, rather than being mislabelled "offline" and left corrupt.
- `AppStateProvider` (`src/state/AppStateProvider.tsx`) wraps `useRemoteState` in a Context and is the only
  place `setActiveCategory`/`setActiveDay`/`setProgramStartDate` are defined. Components call
  `useAppState()` and never touch `useRemoteState` or `storage.ts` directly.
- `SyncNotice` renders one of two non-blocking messages — `offline` ("Ngoại tuyến — đang hiển thị dữ liệu
  đã lưu", shown when a `GET`/`PUT` failed but the app still has a usable copy) or `unauthorized` ("Đồng bộ
  đang tắt — kiểm tra cấu hình", shown when `VITE_WORKER_URL` is unset or a `PUT` came back 401) — or
  nothing when synced. It is rendered exactly once, at the top of `App.tsx`. Do not also render it inside
  `SettingsPanel`; that was tried and reverted because two `role="status"` regions with identical text
  double-announce to screen readers.
- `isAppState()` in `src/shared/types.ts` is the single validator for an untrusted `AppState` blob — used
  by the frontend's `localStorage` mirror parse and by the Worker's `PUT` body check. It lives beside the
  type it guards specifically so the two deployables can't drift into accepting different shapes; if you
  ever find yourself writing a second shape check for `AppState`, import this one instead.

### The Worker

`worker/handlers.ts` is one file with all the logic: `GET /state` returns the stored blob, seeding and
persisting `makeDefaultState()` on first visit so `programStartDate` is fixed from that moment on; `PUT
/state` requires an `X-Write-Token` header matching the `WRITE_TOKEN` secret (401 otherwise) and validates
the body with `isAppState()` before writing (400 on a bad shape). Everything — including error responses —
carries CORS headers for `ALLOWED_ORIGIN` (a `wrangler.toml` var), because the Pages origin and the Worker
origin differ and `X-Write-Token` is a non-simple header that needs a real preflight.

One KV namespace, bound as `STATE`, one key: `state:default`. There's no per-user keying — this is a
single-user app.

**Why `index.ts` is nearly empty**: in the Workers modules format, every *named* export of the entry module
is interpreted by the runtime as a handler or binding, not just the code you meant to export. An early
version of this Worker exported `STATE_KEY` and `handleRequest` directly from `worker/index.ts` and
`wrangler dev` rejected the module. All logic and its named exports (`handleRequest`, `Env`, `StateStore`,
`STATE_KEY`) now live in `worker/handlers.ts`; `worker/index.ts` contains only `export default { fetch:
handleRequest }`. Keep it that way — don't add named exports back to `index.ts`.

### The `src/shared/` boundary

`src/shared/` is imported by both the frontend build and the Worker build (`wrangler`'s esbuild bundler
follows the relative import `../src/shared/...` from `worker/handlers.ts` without extra config). It exists
so the two deployables resolve `AppState`'s shape, the routine content, and "what day is it" from one
module that cannot drift — two independent copies of `isAppState()` or `todayIso()` would be free to
disagree, and the failure mode is silent (one side accepts a blob the other rejects, or the two sides
disagree about the date near midnight). If a type or helper needs to be used by both deployables, it
belongs in `src/shared/`, not duplicated. `tsconfig.worker.json` excludes `**/*.test.ts` from its
typecheck (Vitest still runs them) because the worker's `@cloudflare/workers-types` and the frontend's
`vitest/globals`/DOM types are not simultaneously satisfiable in one compilation.

### Dates and timezone

All date arithmetic is pinned to `Asia/Ho_Chi_Minh` (`src/shared/date.ts`, `TZ`), via
`Intl.DateTimeFormat(..., { timeZone: TZ })` rather than any bare local-time call (`new Date().getDay()`,
etc.). The frontend runs in the device's timezone and the Worker runs in UTC; left unpinned, the two would
disagree about what day it is for part of every 24 hours, which matters for `programStartDate` seeding and
will matter more once a later sub-project adds day-aware notifications. `todayIso`/`weekdayIndex` both take
an optional `now: Date` so tests are deterministic — don't remove that parameter to "simplify" a call site.

### No-cast constraint

No `as` casts, no `any`, no `@ts-ignore`, no non-null (`!`) assertions anywhere in `src/` or `worker/`,
including tests. Where external data needs narrowing (a `JSON.parse` result, a fetch response body), write
or reuse a type predicate (`isAppState`, `isHairDay`) instead of asserting past the compiler. If a cast
looks unavoidable, that's usually a sign the type at the boundary is wrong, not that the constraint should
bend — check `src/shared/types.ts` first for whether the shape already has a guard.

## Testing

`npm run test` runs the whole suite (frontend component/unit tests plus `worker/handlers.test.ts`) through
one Vitest config (`vite.config.ts`, `environment: "jsdom"`). Component tests use `@testing-library/react`;
the Worker tests exercise `handleRequest` directly against a minimal in-memory fake of `StateStore` (see
`worker/handlers.ts` — the Worker declares only the `get`/`put` surface it actually needs from KV, so a
plain fake satisfies it with no cast). There is no separate lint command; `strict: true` plus this suite is
the whole safety net, and `npm run build` runs `typecheck` first, so a type error blocks a build.

## Deployment

Two independent GitHub Actions workflows in `.github/workflows/`, both triggered on push to `main`:

- **`deploy-pages.yml`** — installs, runs `npm run test`, then `npm run build` with `BASE_PATH=
  /skincare-routine-webapp/` (the site is served from a GitHub Pages project path, not a domain root — see
  `vite.config.ts`'s `base: process.env.BASE_PATH ?? "/"`) and the `VITE_WORKER_URL`/`VITE_WRITE_TOKEN`
  build-time secrets, then deploys `dist/` via `actions/deploy-pages`.
- **`deploy-worker.yml`** — triggered on `main` pushes touching `worker/**`, `src/shared/**`, or
  `wrangler.toml`; runs the test suite, then `wrangler deploy` via `cloudflare/wrangler-action`.

`VITE_WRITE_TOKEN` is inlined into the public client bundle at build time — it prevents casual abuse of the
`PUT` endpoint, not a determined attacker reading the deployed JS. It is not a secret in the traditional
sense once the site is live; don't treat leaking it as more than a minor issue.

## Out of scope here, and where later work attaches

This is sub-project 1 of a five-part plan. Deliberately not built yet: progress tracking (checking off
individual steps, a `completedSteps` history that would also resolve the week‑1/2‑vs‑week‑3+ Niacinamide
rule the face note box currently just describes in prose), a content editor, a PWA manifest/service worker,
and push notifications/reminders. Don't add pieces of these speculatively — the seams are already in place
for them:

- `src/shared/` is the shared-module boundary those sub-projects are expected to extend (e.g. a
  `completedSteps` shape would live in `types.ts` beside `AppState`).
- `BASE_PATH` is already plumbed through `vite.config.ts` and the Pages workflow for a future manifest
  `start_url` and service worker scope to reuse.
- `weekdayIndex()` in `date.ts` exists for a later sub-project to build on even though nothing in this app
  calls it yet (the UI restores the persisted tab, not "today's" tab).
- `SettingsPanel` is the intended home for a future reminders toggle and test-send button — it's kept
  deliberately small (one date field) for exactly that reason.
