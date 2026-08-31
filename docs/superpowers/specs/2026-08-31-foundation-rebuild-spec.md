# Foundation Rebuild — Spec

Status: ready to plan, sub-project 1 of 5
Date: 2026-08-31
Design: [Foundation rebuild design](./2026-08-28-foundation-rebuild-design.md)
(including the 2026-08-31 amendments for `updatedAt`, first-run seeding, and
the settings surface)

This spec resolves the implementation decisions the design deliberately left
open. Where the design says *what* and *why*, this says *which exact thing*.
Anything not listed here follows the design document unchanged.

## Prerequisites (performed by the repo owner, not by the implementation)

These are the only manual setup steps; everything else is automated.

1. A GitHub repository named `skincare-routine-webapp` exists and is set as
   the `origin` remote. (Today the repo is local-only.)
2. The local branch is renamed `master` → `main`, since the deploy workflows
   trigger on `main`.
3. GitHub Pages is enabled for the repo with **Source: GitHub Actions**.
4. A Cloudflare account exists, with a KV namespace created and its id noted.
5. The following repository secrets are set in GitHub → Settings → Secrets
   and variables → Actions:
   - `CLOUDFLARE_API_TOKEN` — scoped to Workers Scripts:Edit + Workers KV:Edit
   - `CLOUDFLARE_ACCOUNT_ID`
   - `WRITE_TOKEN` — a long random string, generated once
   - `VITE_WORKER_URL` — the deployed Worker's URL
6. The same `WRITE_TOKEN` value is set as a Worker secret:
   `wrangler secret put WRITE_TOKEN`.

## Toolchain

| Concern | Decision |
| --- | --- |
| Node | 20 LTS, pinned in CI via `actions/setup-node` with `node-version: 20` |
| Package manager | npm (`package-lock.json` committed, CI uses `npm ci`) |
| Build | Vite 5 + `@vitejs/plugin-react` |
| Language | TypeScript, `strict: true` |
| Styling | Plain CSS in `src/styles.css`, ported verbatim from the existing `<style>` block. No CSS framework, no CSS modules, no preprocessor. |
| Test runner | Vitest with `environment: "jsdom"` |
| Component tests | `@testing-library/react` + `@testing-library/jest-dom` |
| Worker runtime | Cloudflare Workers, ES modules syntax (`export default { fetch }`) |
| Worker deploy | `wrangler` (v3) |

No state-management library, no router, no component library, no date library
(the one date helper needed is ~10 lines — see "Dates and timezone").

## Repository layout

A single npm project at the root, with the Worker as a subdirectory sharing
the root `node_modules` and lockfile. No workspaces, no monorepo tooling.

```
/
  index.html                  Vite entry
  package.json                one package for frontend + worker scripts
  tsconfig.json               frontend (DOM libs)
  tsconfig.worker.json        worker (@cloudflare/workers-types)
  vite.config.ts              includes Vitest config
  wrangler.toml               worker config, at root so it can reach src/shared
  src/
    main.tsx                  React root
    App.tsx
    styles.css                the ported stylesheet
    components/
      CategorySwitcher.tsx
      CategorySection.tsx
      Gallery.tsx
      DayTabs.tsx
      DayPanel.tsx
      SettingsPanel.tsx
      SyncNotice.tsx
    state/
      AppStateProvider.tsx    Context + useAppState()
      useRemoteState.ts       the sync hook
      storage.ts              localStorage mirror + reconcile(), pure
    icons/
      icons.tsx               the ICONS map, ported
      pickIcon.ts             keyword matching, ported
    shared/                   IMPORTED BY BOTH FRONTEND AND WORKER
      types.ts                AppState, Category, DayData, ...
      routine.ts              the shipped routine content
      date.ts                 timezone-pinned date helpers
      defaults.ts             makeDefaultState()
  worker/
    handlers.ts               routing, CORS, token check, KV access
    index.ts                  default export only (see note below)
    handlers.test.ts
```

**Why `src/shared/` rather than a separate package**: sub-project 5 requires
the Worker and the frontend to resolve today's routine from *one* module that
cannot drift. Wrangler bundles with esbuild and follows relative imports
outside `worker/` without extra configuration, so `import { ... } from
"../src/shared/routine"` just works. Vite needs no change either — the path is
inside the project root. This costs nothing now and removes the drift risk
called out as the highest-stakes constraint in the push-notifications design.

## GitHub Pages base path

The site is served from `https://<user>.github.io/skincare-routine-webapp/`,
not from a domain root. Therefore:

- `vite.config.ts` sets `base: process.env.BASE_PATH ?? "/"`.
- The Pages workflow sets `BASE_PATH=/skincare-routine-webapp/` before
  `npm run build`. Local dev and tests keep `/`.
- No absolute asset paths (`/foo.svg`) anywhere in markup or CSS — all asset
  references go through Vite imports so `base` is applied automatically.
- Sub-project 4 reuses `BASE_PATH` for the manifest `start_url` and the
  service worker scope, and sub-project 5 for `clients.openWindow()`.

If a custom domain is added later, unset `BASE_PATH` in the workflow; nothing
else changes.

## Worker API contract

Base URL: the `workers.dev` URL (or a custom route). One KV namespace bound as
`STATE`, one key: `state:default`.

### `GET /state`

- No authentication (read-only, non-sensitive).
- If `state:default` exists: `200` with the stored JSON.
- If it does not exist: build `makeDefaultState()`, **write it to KV**, then
  `200` with that blob.
- Response header `Content-Type: application/json`.

### `PUT /state`

- Requires header `X-Write-Token` matching the `WRITE_TOKEN` secret.
  Mismatched or absent: `401` with body `{"error":"unauthorized"}`.
- Body must parse as JSON and have `version === 1` and a string `updatedAt`.
  Otherwise `400` with `{"error":"invalid state"}`. No deeper validation —
  the frontend is the only writer.
- On success: overwrite `state:default`, return `204`.

### `OPTIONS *` (CORS preflight)

Required, because the Pages origin and the Worker origin differ and
`X-Write-Token` is a non-simple header. Every response — including errors —
carries:

```
Access-Control-Allow-Origin: <ALLOWED_ORIGIN>
Access-Control-Allow-Methods: GET, PUT, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Write-Token
Access-Control-Max-Age: 86400
```

`ALLOWED_ORIGIN` is a `wrangler.toml` var, set to the Pages origin
(`https://<user>.github.io`). During local development it is `*`; the
committed value is the real origin.

### Anything else

`404` with `{"error":"not found"}`.

## Frontend environment variables

| Variable | Where | Value |
| --- | --- | --- |
| `VITE_WORKER_URL` | build-time, from GH secret | e.g. `https://skincare-state.<sub>.workers.dev` |
| `VITE_WRITE_TOKEN` | build-time, from GH secret `WRITE_TOKEN` | the shared token |
| `BASE_PATH` | build-time, workflow literal | `/skincare-routine-webapp/` |

A `.env.example` documents all three. `.env` and `.env.local` are gitignored.
If `VITE_WORKER_URL` is absent at runtime the app runs in local-only mode
(localStorage alone) and shows the "sync disabled" notice — this keeps
`npm run dev` usable with no Cloudflare account.

## Dates and timezone

All date arithmetic is pinned to `Asia/Ho_Chi_Minh` in both deployables. The
frontend runs in the device's zone and the Worker runs in UTC; left
unspecified they disagree about what "today" is for the 7 hours between
00:00 and 07:00 ICT, which would put the app and the nightly notification
(sub-project 5) on different days — and, across a week boundary, on different
week numbers.

`src/shared/date.ts` exports:

```ts
export const TZ = "Asia/Ho_Chi_Minh";
export function todayIso(now?: Date): string;     // "YYYY-MM-DD" in TZ
export function weekdayIndex(now?: Date): number; // 0 = Monday .. 6 = Sunday
```

Implemented with `Intl.DateTimeFormat(..., { timeZone: TZ })`, which is
available in both the browser and the Workers runtime. Both accept an
injected `now` so tests are deterministic. `weekdayIndex` is Monday-based to
match the existing `T2..CN` tab order; it is unused by the UI in this
sub-project (which restores the persisted tab, not today's) but is needed by
`makeDefaultState()` and is the helper sub-project 2 builds on.

## Settings surface

Per the design amendment, one small panel, reachable from a control in the
app header (not inside a category hero, so it stays category-agnostic).
Contents for this sub-project:

- A labelled date input bound to `AppState.programStartDate`.

The sync status line is deliberately NOT repeated here. `SyncNotice` is
rendered once, at the top level of the app, where it is visible without
opening settings. Rendering it a second time inside the panel would put two
`role="status"` live regions with identical text on the page at once, which
announces twice to screen-reader users and reads as a duplicate on screen.

Nothing else. Sub-project 5 adds the reminders toggle and test-send button to
this panel.

## Sync status notice

One component, three states, rendered as a small non-blocking bar. Copy is
Vietnamese to match the app:

| State | Trigger | Copy |
| --- | --- | --- |
| `offline` | `GET` or `PUT` failed (network/5xx/timeout) | `Ngoại tuyến — đang hiển thị dữ liệu đã lưu` |
| `unauthorized` | `PUT` returned 401, or `VITE_WORKER_URL` unset | `Đồng bộ đang tắt — kiểm tra cấu hình` |
| `synced` | last `PUT` succeeded | no bar rendered |

The `unauthorized` state is visually distinct from `offline` (per the design)
because it means misconfiguration rather than a transient network problem.

## Definition of done

The sub-project is complete when all of the following hold:

1. `npm run test` passes, covering at minimum:
   - `todayIso` / `weekdayIndex` against injected instants either side of the
     ICT midnight boundary
   - `pickIcon` for each keyword branch plus the flower fallback
   - `reconcile(remote, local)`: remote newer, local newer, only remote, only
     local, neither
   - `useRemoteState`: mount success; mount `GET` failure with a mirror
     present; mount failure with no mirror; local-newer triggers a `PUT`;
     `PUT` failure leaves local state intact and surfaces `offline`; 401
     surfaces `unauthorized`
   - Worker handlers against a fake KV: seeding on empty `GET`, `PUT` with
     good/missing/wrong token, CORS headers on every response shape
2. `npm run build` succeeds with `strict: true` and no TypeScript errors.
3. Both GitHub Actions workflows have run green on `main`, and the deployed
   Pages URL loads the app.
4. Manual parity check against `skincare-routine.html`, all of:
   - all three categories switch and carry their own palette
     (rose / `.theme-yellow` / `.theme-almond`)
   - all 7 day tabs render in each category, with the same steps, notes, and
     AM/PM card structure (`steps` rather than AM/PM for hair)
   - the gallery renders every product with the same icon as the old page
   - hero copy, note boxes, legend dots, and footer are unchanged
5. Reload persistence: switch to hair, pick T5, reload — the app returns to
   hair/T5. Confirm the same in a fresh browser profile (proving it came from
   the Worker, not `localStorage`).
6. Offline behaviour: with the Worker URL blocked in devtools, the app still
   loads from the mirror and shows the `offline` bar; changes made offline
   survive a reload; when the Worker is reachable again the next change
   propagates.
7. `programStartDate` can be edited in settings, survives a reload, and is
   what `GET /state` returns.
8. `skincare-routine.html` is deleted in the final commit of the sub-project,
   and `CLAUDE.md` is rewritten to describe the React/Vite/Worker project.
   (It stays in the repo until item 4 passes — it is the comparison baseline.)

## Explicitly out of scope

Unchanged from the design: progress tracking, the content editor, PWA
manifest/service worker, and push. Additionally out of scope here:

- Any backup/export of `AppState` beyond the single KV key. (Raised in review;
  deferred deliberately. Revisit once `completedSteps` history from
  sub-project 2 makes the blob genuinely irreplaceable — at that point a
  rotating snapshot key is the cheap answer.)
- Reconciling the static Vietnamese prose in the note boxes with the
  week-1–2 rule it describes. That prose duplicates what sub-project 2's
  resolver will own; it ports verbatim here and gets revisited there.
- Changing any routine content. This sub-project is a port; the data moves
  modules but not values.
