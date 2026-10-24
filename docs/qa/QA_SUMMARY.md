# QA summary

Run date: 24 October 2026. Branch `abubakar`. Scratch database and fake accounts only; no real money, card, wallet, or inbox.

## Counts

**API run over HTTP (`QA_TEST_RESULTS.md`, 57 recorded checks):**

| Status | Count | Note |
|---|---|---|
| PASS | 53 | includes the re-tests after each fix |
| FAIL | 2 | both are the **first-run records of defects that were then fixed and re-tested** (`A03-first`, `C04-first`) |
| BLOCKED | 0 | |
| NOT IMPLEMENTED | 2 | Arena Staff role (S01); indoor/outdoor filter (U02d) |

**Browser checklist (owner web, admin web, phone web build; 31 feature rows, every screen at 360/768/1024/1440 for web and 390 for the phone):** 0 FAIL, 0 console errors, 0 failed requests in the final run. The first run had 3 FAILs, found a real defect (BUG-3, fixed) and two harness timing problems; see below.

**Existing backend test suite:** 984 tests, all passing after the fixes (exit code 0), plus ruff, black and mypy clean (325 files).

## Defects (details in `QA_BUG_REPORT.md`)

| ID | Severity | Role | What | Status |
|---|---|---|---|---|
| BUG-1 | **Critical** | Admin | Three simultaneous force-refunds made three full refunds (6000 back on a 2000 payment) | Fixed (`1a32a76`), test added, re-tested |
| BUG-2 | Medium | All | With Redis down, every signed-in request (including booking) answered HTTP 500 | Fixed (`b21a8f1`, `a851fa4`): now 503, nothing booked, tests added, re-tested |
| BUG-3 | Medium | Player (phone) | Reloading an arena or booking page on the web build could land on Home | Fixed (last two commits), re-tested |

No Critical or High defect is open. Low/informational observations are listed in the bug report (for example a signed-but-malformed Stripe event answering 500; it needs the webhook secret to trigger).

## What was proven (with evidence)

- **Double booking:** 8 simultaneous requests for one slot gave exactly one success and seven 409s, one active booking row; also two players at the same instant. The database has a unique index as a second guard.
- **Payments:** only a correctly signed server callback with the right amount, for the right gateway and a known transaction, confirms a booking. Bad signature, wrong amount, other gateway, unknown transaction, browser "return" and another player's simulate call all failed to pay. Duplicate callbacks made no second payment. A late "paid" callback after the 24-hour hold expired did not bring the booking back.
- **Bank transfer:** receipt keeps it pending; owner approves or rejects; a player or another owner cannot.
- **Refunds:** one refund per cancelled booking even with two simultaneous cancels; force-refund once only (after BUG-1 fix); a simulated card refund stays `pending` and is never shown as done.
- **Tenant isolation:** owner B got 404 on all 12 attempts against owner A's arena, courts, slots, bookings, bank details, blocked dates and payments; lists and reports show only the owner's own data.
- **Roles:** admin routes refuse no token (401), player and owner (403); users cannot make themselves admin.
- **Reliability:** backend restart with a payment pending kept the booking and the payment, and the late callback confirmed once; Redis down gives health "degraded" and 503, not 500 and not a booking; no Redis lock keys left behind.
- **Cross-role consistency:** player, owner and admin lists show the same booking and amount; the owner payment report equals the payments table.

## What was not tested, and what is open

- Real Stripe hosted checkout, real JazzCash/EasyPaisa (simulators only; no merchant accounts exist), real bank money.
- Push notifications and real emails on a real phone or inbox; the native Android/iOS app on a device (tested as the web build).
- Reschedule, multi-slot groups, discount codes, equipment add-ons at booking time, maintenance slots: covered by the existing pytest suite only, not repeated over HTTP here.
- Load testing.
- The development-server's very first page load after a restart can be slow enough to show Home once; later loads are clean. This is a development-server compile delay, not seen in a built app, but it was not tried on a production build.
- Arena Staff role does not exist (so it could not be tested); owner-created walk-in bookings are not implemented.

## Readiness

For the booking and payment core, tenant isolation and role checks, the evidence is good: one critical money defect was found and fixed in this run. Before real users: connect real payment accounts and re-run U05 and the refund checks against their sandboxes; run the phone app on a real device; run the checklist once against a production build. Wording for approval: `BOOKING_TEMPORARILY_UNAVAILABLE` (see the bug report).

## How to repeat

Start the scratch stack (backend :8001 on `arenahub_scratch` with fake webhook secrets, web :3000, Expo web :8082), then:
`QA_TAG=<new prefix> node scripts/qa_api.mjs`, `node scripts/qa_restart.mjs` after restarting the backend, `node scripts/qa_redis_down.mjs` (second backend on :8002 with a closed Redis port), `node scripts/qa_report.mjs`, and `scripts/verify_checklist.mjs` for the browser pass. Environment variables are described at the top of each script.
