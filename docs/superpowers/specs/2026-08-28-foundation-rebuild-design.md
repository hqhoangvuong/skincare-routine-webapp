# Foundation Rebuild — Design

Status: approved, sub-project 1 of 5
Date: 2026-08-28

## Context: the full program

The current app is a single self-contained `skincare-routine.html` file (no
build tools, no persistence, no server). The goal is to turn it into a usable
daily app. That work decomposes into five independent sub-projects, each with
its own design → spec → plan → implementation cycle:

1. **Foundation rebuild** (this document) — React + Vite rewrite, persistent
   storage via a Cloudflare Worker, hosting on GitHub Pages.
2. **Progress tracking** — mark steps done per day, streaks, and
   auto-computing which week of the program you're in (so the routine
   automatically shows the right variant, e.g. the week-1–2 vs. week-3+
   Niacinamide schedule, and the alternating weekly mask).
3. **In-app content editor** — add/rename/remove products and steps from the
   UI, persisted as overrides on top of the shipped defaults.
4. **PWA / installable** — manifest + icons + service worker for offline use
   and "add to home screen." Also a hard prerequisite for notifications to
   work on iPhone at all.
5. **Push notifications** — Web Push subscription + a Cloudflare Worker cron
   job that sends a daily notification (e.g. "Tonight: AHA night 🌙") built
   from the same routine data.

Constraints established for the whole program:
- Single device/single user — no login, no multi-tenant data model.
- Everything should stay free to run.
- Push notifications must be *real* (fire even when the app/phone is closed),
  which requires a small always-on scheduler — a Cloudflare Worker on a cron
  trigger, sending Web Push. This is the one piece of "infrastructure" the
  project needs beyond static hosting.
- Persistent state should not live only in browser `localStorage` (it can be
  lost on cache clear / reinstall / browser switch) — it should be stored
  somewhere durable and free. Since a Cloudflare Worker is needed anyway for
  push, it doubles as a tiny storage API backed by Cloudflare KV, rather than
  bringing in a separate backend-as-a-service.
- Tech stack: React + Vite (not plain HTML/JS), plain CSS (porting the
  existing CSS-variable theming approach), no other framework additions
  unless a later sub-project needs one.
- Hosting: static site on GitHub Pages; the Worker on Cloudflare (Workers +
  KV, both free tier).

## This sub-project: Foundation rebuild

### Goal

Reproduce the current app's visual design and content, functionally
unchanged, as a React + Vite project with durable persistence and automated
deploys — with the internal seams (shared state shape, Worker API) that
sub-projects 2–5 will build on without requiring a breaking rework.

### Architecture

Two deployable pieces:

1. **Frontend** — a React + Vite static site. Built and deployed to GitHub
   Pages via a GitHub Actions workflow triggered on push to `main`.
2. **Backend** — one Cloudflare Worker exposing a minimal JSON API:
   - `GET /state` → returns the stored `AppState` blob (or a default empty
     one if nothing has been saved yet).
   - `PUT /state` → replaces the stored blob with the request body.
   Backed by a single Cloudflare KV namespace, one fixed key (e.g.
   `state:default`) — there is exactly one user, so no per-user keying is
   needed. Writes require a static secret token (a long random string)
   sent as a header; the Worker rejects writes without it. The token is
   baked into the frontend build via a Vite env var at build time.

   This token is **not real security** — it prevents casual/automated abuse
   of the public write endpoint, not a determined attacker who reads the
   deployed JS bundle. That's an accepted tradeoff for a personal skincare
   log with no sensitive data. If that changes, this is the first thing to
   revisit.

### Data model

```ts
type AppState = {
  version: 1;
  programStartDate: string; // ISO date, e.g. "2026-08-24"
  ui: {
    activeCategory: "face" | "hair" | "body";
    activeDayByCategory: Record<"face" | "hair" | "body", number>; // 0-6
  };
};
```

Deliberately minimal. The `version` field exists from day one so future
additions (sub-project 2 adds a `completedSteps` map, sub-project 3 adds an
`overrides` object for edited content) can be introduced as additive changes
with a version bump and a migration function in the storage hook, rather
than a breaking rewrite of the stored shape.

Routine content (products, days, steps — today's `faceProducts`, `faceDays`,
`hairProducts`, `hairDays`, `bodyProducts`, `bodyDays`) moves out of inline
`<script>` arrays into a `src/data/routine.ts` module, same shape as today
(arrays of products; arrays of day objects with `am`/`pm` or flat `steps`
tuples of `[name, note]`). This is static shipped data, distinct from the
per-user `AppState` above — sub-project 3 is what makes it user-editable.

### Components

Direct ports of the current markup/behavior into React, same visual output:

- `App` — top-level; wraps everything in `AppStateProvider`; renders
  `CategorySwitcher` and the active category's section.
- `AppStateProvider` / `useAppState()` — React Context exposing the
  `AppState` fields and setters; internally driven by `useRemoteState`
  (below). This is the shared seam later sub-projects extend.
- `CategorySwitcher` — the face/hair/body toggle buttons.
- `CategorySection` — hero header, product gallery, day tabs + panel, notes —
  parameterized by category so face/hair/body reuse one component with
  different data/theme class, matching today's shared CSS-variable theming
  (`.theme-yellow`, `.theme-almond`).
- `Gallery`, `DayTabs`, `DayPanel` — same responsibilities as today's
  `renderGallery` / `buildWeekTabs` output, as components instead of DOM
  string-building.
- Icon selection (`pickIcon`) ports as a plain utility function, unchanged
  logic.

### Persistence: `useRemoteState` hook

Owns the sync between `AppStateProvider` and the Worker:

- **On mount**: `GET /state` from the Worker. On success, populate Context.
  On failure (offline, Worker down, timeout), fall back to the last-known
  snapshot cached in `localStorage`, if any; otherwise use a default empty
  state.
- **On change**: debounce ~500ms, then `PUT /state` with the full current
  blob, and mirror the same blob into `localStorage` as the fallback cache
  regardless of whether the `PUT` succeeded.
- **No sync queue for v1**: if a `PUT` fails, it's simply superseded by the
  next change (the localStorage mirror always reflects the latest local
  state, and the next successful `PUT` — triggered by any subsequent change,
  or the next app load's mount cycle — carries it to the Worker). This is
  intentionally simple; a real offline write queue is not justified for a
  single-user app that's opened at least daily.

### Error handling

- **Worker unreachable at load**: use cached `localStorage` state; show a
  small, non-blocking "offline — showing last saved state" notice.
- **Worker unreachable on write**: state still updates locally and in
  `localStorage`; same non-blocking notice; no retry loop (see above).
- **First run ever (empty KV)**: Worker returns a default `AppState` with
  today's date as `programStartDate` and face/day-0 as the active
  selection.
- **Missing/invalid write token**: Worker returns 401 on `PUT`; frontend
  treats this the same as "unreachable" but with a distinct notice
  ("sync disabled — check setup") since this indicates real misconfiguration
  rather than a transient network issue.

### Testing

No test suite exists today. For this sub-project:
- Manual visual/behavioral comparison against the current
  `skincare-routine.html` (all three categories, all days, theming) is the
  primary check.
- Unit tests for `useRemoteState`'s fallback logic (mount success, mount
  failure → localStorage fallback, mount failure → default state, write
  failure → local state still updates) since that's the one piece of new
  logic with real edge cases.
- No tests planned for the Worker beyond manual `curl` verification of
  `GET`/`PUT` — it is intentionally tiny.

### Deploy

- **Frontend**: GitHub Actions workflow on push to `main` — `npm ci`,
  `npm run build`, publish `dist/` to GitHub Pages (via
  `actions/deploy-pages` or equivalent).
- **Worker**: deployed via `wrangler`. Also wired into a GitHub Action now
  (rather than left as a manual `wrangler deploy`), since sub-project 5 will
  extend this same Worker with a cron trigger and it's better to have the
  deploy path automated before that lands.

### Out of scope for this sub-project

- Marking steps complete, streaks, week-variant auto-switching → sub-project 2.
- Editing products/steps from the UI → sub-project 3.
- Manifest, service worker, installability → sub-project 4.
- Push subscriptions and the cron sender → sub-project 5.
