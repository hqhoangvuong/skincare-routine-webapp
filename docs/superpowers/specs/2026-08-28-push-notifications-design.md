# Push Notifications — Design

Status: approved, sub-project 5 of 5
Date: 2026-08-28
Depends on: [Foundation rebuild](./2026-08-28-foundation-rebuild-design.md), [PWA / installable](./2026-08-28-pwa-installable-design.md) (required for iOS), [Progress tracking](./2026-08-28-progress-tracking-design.md) (shared routine resolver)

## Goal

Send a real push notification every evening — "Tối nay: `<tonight's face
focus>` 🌙" — that fires even when the app/phone is closed, so the routine
surfaces itself instead of relying on remembering to open the app.

## Scope decisions

- **Covers face routine only.** Face is the routine with real time-sensitive
  active-ingredient sequencing (BHA/AHA/Azelaic nights) that's easy to get
  wrong if skipped or reordered; hair/body are simpler and not tied to a
  specific night's chemistry. Not extending to hair/body avoids multiple
  nightly notifications for a personal app that only needs one clear
  nudge.
- **Fires daily at 8:00 PM Asia/Ho_Chi_Minh (ICT, UTC+7)** — expressed as a
  Cloudflare Cron Trigger in UTC: `0 13 * * *`.

## Sending mechanism — the highest-risk piece of this sub-project

Real Web Push requires VAPID-signed requests (RFC 8292) and encrypted
payloads (RFC 8291). Node's `web-push` package depends on Node's crypto
module, which is not available in the Workers runtime. The plan is to use
a Workers/edge-native library built on the standard WebCrypto API (which
Workers do support natively) rather than hand-rolling ECDSA signing and
`aes128gcm` encryption from scratch.

**Documented fallback**: if no such library proves workable during
implementation, fall back to a third-party push-sending service (e.g.
OneSignal's free tier). This is explicitly the fallback, not the plan,
because it adds a separate account and a client-side SDK beyond the
GitHub + Cloudflare setup used everywhere else in this project. This
sub-project's implementation plan should try the Workers-native approach
first and only fall back if it's genuinely blocked.

## Keys

A VAPID keypair is generated once (offline, e.g. via a small script or
existing CLI tool). The private key is stored as a Cloudflare Worker
secret (`wrangler secret put VAPID_PRIVATE_KEY`); the public key is baked
into the frontend build via a Vite env var (same mechanism the foundation
uses for the write-token) since the browser's `PushManager.subscribe()`
call needs it.

## Subscribe flow

- A settings toggle, "Enable reminders," is added to the app (placement:
  a small settings area, not cluttering the category heroes).
- Turning it on: requests `Notification` permission → on grant, calls
  `PushManager.subscribe()` with the VAPID public key → `POST`s the
  resulting subscription object to a new Worker endpoint, `POST
  /subscribe`, protected by the same write-token as `PUT /state`.
- The Worker stores the subscription under one fixed KV key (e.g.
  `subscription:default`) — single user, so subscribing again (e.g. after
  reinstalling the PWA) simply overwrites the previous entry; there's
  nothing to reconcile.
- Turning it off: unsubscribes locally (`PushSubscription.unsubscribe()`)
  and tells the Worker to clear the stored subscription.

## Sending (the cron job)

On each scheduled trigger, the Worker:
1. Reads the stored subscription from KV. If none, no-op.
2. Reads the app's `programStartDate` (from the same `AppState` blob used
   by `GET/PUT /state`) to compute today's week number.
3. Resolves today's face-routine data using the **same** `resolveDay`
   function and `routine.ts` data used by the frontend (imported from one
   shared module in the repo, not duplicated/reimplemented in the Worker —
   this is the one thing that must not drift out of sync between the two
   deployables).
4. Sends a push with body `"Tối nay: <day.focus> 🌙"` (matching the app's
   existing Vietnamese phrasing style, e.g. "Trọng tâm tối nay: ...").

## Notification click behavior

A `notificationclick` handler in the service worker (added alongside the
PWA sub-project's service worker) calls `clients.openWindow(startUrl)`.
Because the app already defaults to opening on today's actual weekday tab
(sub-project 2), no extra deep-linking logic is needed — the default
landing behavior is already correct.

## Subscription health

If a send attempt gets an HTTP 410 (Gone) from the push service — meaning
the subscription is no longer valid (browser reset, long-expired, etc.) —
the Worker clears it from KV rather than retrying forever into a void.
The frontend's "Enable reminders" toggle reflects current subscription
status, fetched alongside the existing `GET /state` call (the response
gains one additional field, e.g. `hasActiveSubscription: boolean`), so a
silently-gone-stale subscription is visible next time the app is opened
and can be re-enabled with one tap.

## Manual test support

A "Send test notification now" button in the settings area, calling a new
Worker endpoint (`POST /notify-test`, same write-token) that runs the same
send logic as the cron job on demand. Push is notoriously hard to debug
blind (failures are silent by default), so having an on-demand trigger
matters more here than for any other sub-project.

## Testing

- Manual: subscribe → send test → receive notification → tap → app opens
  to today, on both Android Chrome and iOS Safari (installed to home
  screen).
- Manual: locally invoke the Worker's scheduled handler via `wrangler`'s
  dev tooling (`wrangler dev --test-scheduled` or equivalent) rather than
  waiting for a real cron fire during development.
- Unit test for the message-building step (`day.focus` → notification
  body string) since that's plain, easily-isolated logic; the actual
  push-sending crypto is treated as a thin, mostly-untested integration
  with the chosen library (verified manually as above).

## Out of scope

- Notifications for hair/body routines.
- Multiple reminder times per day, or user-configurable send time (fixed
  at 8:00 PM ICT for v1 — revisit only if that turns out to be the wrong
  time in practice).
- Any notification history/log beyond what's needed to debug a failed
  send during development.
