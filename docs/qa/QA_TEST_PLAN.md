# QA test plan: ArenaHub end-to-end

Date of the run: 24 October 2026. Branch `abubakar`.

## What was tested, and how

| Layer | How it was tested | Script / source |
|---|---|---|
| Backend API, all roles, with real PostgreSQL and real Redis | 57 recorded checks over HTTP against a scratch backend (port 8001, database `arenahub_scratch`, Redis db 5) | `scripts/qa_api.mjs`, `scripts/qa_restart.mjs`, `scripts/qa_redis_down.mjs` |
| Browser: owner web, admin web, phone app (Expo web build) | The existing browser checklist: every screen at 360/768/1024/1440 (web) and 390 (phone), console errors, failed requests, sideways scroll, small text and taps | `scripts/verify_checklist.mjs` |
| Backend logic in depth (hundreds of cases: refunds, groups, reschedule, discounts, slots, notices, hostile input) | The existing pytest suite | `backend/tests/` (ran in full, no failures) |

Report files, all in `docs/qa/`:
`QA_TEST_PLAN.md` (this file), `QA_TEST_RESULTS.md` (every check), `QA_BUG_REPORT.md`, `QA_ROLE_PERMISSIONS.md`,
`QA_BOOKING_PAYMENT_AUDIT.md`, `QA_SUMMARY.md`. The raw results are in `qa_results.json`.

## Setup used

- PostgreSQL, Redis, FastAPI backend (scratch copy), Next.js web, Expo web build: all running on this PC.
- Accounts (all fake `@example.com`): admin, owner A, owner B, players A, B, C, plus short-lived users for sign-up, suspension and escalation checks.
- Arena A (owner A) with two courts and hourly slots on a day four days ahead; Arena B (owner B) for the tenant checks.
- Payment callbacks were signed with **fake secrets** that the scratch backend was started with. The project's Stripe key is a test-mode key (checked: test mode only); no real card, wallet or bank was used.
- Mail: reserved `@example.com` addresses are never really emailed. One-time codes were read from the scratch backend's development log.
- The "payment window passed" case used `backend/scripts/run_sweeps.py --advance-hours 25`, which only moves the clock the scheduled jobs use.
- To stand in for "the game was played", one booking was marked `completed` with SQL on the scratch database before the review check.

## Roles in the application (inspected first)

Player, Owner, Admin. There is **no Arena Admin / Staff role** (the `UserRole` enum has three values; see S01). That scenario group is marked NOT IMPLEMENTED, not faked.

## Known scope limits, recorded as limits and not as defects

- Indoor/outdoor search: no such arena field exists (U02d).
- Owner-created walk-in / phone / cash bookings: not implemented; the owner bookings endpoint is list-only. Not tested.
- Reports are CSV/PDF exports (not on-screen charts).

## Not covered by this run (needs a real service, device or inbox)

- A real Stripe hosted checkout page, real JazzCash/EasyPaisa, real bank money: only signed server callbacks and the development simulators were driven.
- Push notifications and real emails arriving on a real phone or in a real inbox. (The logo email was checked separately in an earlier step.)
- The native Android/iOS app on a real device. The phone app was tested as its web build.
- Multi-slot groups, reschedule, discount codes, equipment add-ons at booking time, maintenance slots: these are covered by the existing pytest suite, not re-run through HTTP here.
- Load / performance testing.

## Order of the run

1. Inventory of roles and routes (`docs/ROUTES_AND_ROLES.md`, code).
2. Environment health (API, database and Redis all `ok` on `/health`).
3. Player, owner, admin flows over HTTP.
4. Concurrency and payment integrity (U04, U05, C01, A03).
5. Tenant and role security (O03, A01, A02, X01 to X05).
6. Backend restart (C03) and Redis down (C04).
7. Browser checklist.
8. Defects found were fixed in separate commits with a regression test each, then re-tested (see `QA_BUG_REPORT.md`).
