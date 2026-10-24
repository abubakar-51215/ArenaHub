# QA bug report

Every defect found in this run, with how to repeat it, the cause, and what was done. Wording that is new is listed at the end for approval.

## Defects found and fixed

### BUG-1 (Critical, admin): simultaneous force-refunds pay the same booking back several times

- **Role:** admin (needs the admin account; two clicks, a retry or two admins at once).
- **Test:** A03 first run (`A03-first` in the results).
- **Repeat:** pay a booking of 2000 by card; send three `POST /admin/bookings/{id}/force-refund` at the same time.
- **What happened:** all three answered 200; three refund rows of 2000 were made for one payment of 2000 (6000 back on 2000).
- **Cause:** `force_refund` read the booking and payment without locking them, then checked "is money left?" and wrote the refund. All three checks ran before any of them saved.
- **Fix:** commit `1a32a76`. The payment row, then the booking row, are locked before the check (the same order the payment webhook uses). The second and third now wait, see nothing left, and answer 409.
- **Regression test:** `tests/modules/test_booking_race.py::test_three_admins_force_refunding_at_once_make_one_refund` (fails without the fix, passes with it).
- **Retest:** `A03` after the fix: `200, 409, 409`, one refund row.

### BUG-2 (Medium, all roles): Redis down gave "Internal server error" on every signed-in request

- **Test:** C04 first run (`C04-first`).
- **Repeat:** start the backend with Redis unreachable; sign in (works), then call any route that needs a signed-in user, for example `POST /bookings`.
- **What happened:** HTTP 500 "Internal server error". Nothing was double-booked (0 active rows), but the phone would show a broken screen.
- **Cause:** the check "was this token signed out?" lives in Redis and raised an unhandled error. Taking the booking lock would have raised the same way.
- **Fix:** commits `a851fa4` (signed-in check) and `b21a8f1` (booking lock). With no Redis the request is refused, not let through (a signed-out token cannot be told from a good one), but as HTTP 503. Releasing a lock that cannot be reached no longer hides the result (the lock expires by itself after 30 seconds).
- **Regression tests:** `tests/modules/test_lock_redis_down.py` (4 tests).
- **Retest:** `C04` after the fix: health 503 (`redis: error`), sign-in and search still 200, booking 503, nothing booked.

### BUG-3 (Medium, player, phone app): reloading an arena page (or opening a link with a saved sign-in) could land on Home

- **Test:** the browser checklist, items Get Directions, Pass screen and WebSocket live update (3 FAILs in the first browser run).
- **Repeat:** sign in on the phone web build, then load `/arena/<id>` directly (a page reload, or a link opened on a cold start).
- **What happened:** the screen showed Home instead of the arena, and the address bar read `/?id=<arena id>`.
- **Cause:** the earlier cold-start fix opens a kept link unless the app "is already on it". When the signed-in screens appear, the router can still report the old path for a moment and then falls back to Home; the one check saw the old path, skipped the open, and nothing opened the link afterwards.
- **Fix:** commit `81d784e` ("Check twice that the phone app ended on a kept link..."). The check now runs twice (350 ms and 1.4 s); the second one opens the link if the app did not end up on it. A debug line proved the cause (path equal to the link at the first check, then Home).
- **Retest:** 4 of 4 reloads reached the arena page and "Get Directions" showed (one earlier attempt right after the first compile of the app bundle stayed on Home; later runs were clean). Then the full browser checklist was run again (see `QA_SUMMARY.md`).

## Observations, not fixed

| # | Severity | What | Why it is not changed |
|---|---|---|---|
| OBS-1 | Low | A **validly signed** Stripe event that lacks the `object` field makes the library raise, and the webhook answers 500. A real Stripe event always has it, and signing needs the webhook secret. | Cannot be triggered without the secret. Worth a catch for tidiness later. |
| OBS-2 | Info | The `simulate-confirm` and dev card-page routes exist and work only in development mode. | By design. Confirmed in code that other modes answer 404; not re-run in a non-dev mode. |
| OBS-3 | Info | Refund for a simulated card payment stays `pending` (Stripe test API has no such payment). | Correct: it is not shown as refunded. |
| OBS-4 | Info | A backwards date range on an admin report returns an empty file instead of an error. | Harmless; an empty CSV is a fair answer. |
| OBS-5 | Info | Indoor/outdoor search, owner-created walk-in bookings, Arena Staff role: not implemented. | Known scope limits, not defects. |

## Mistakes in the test script itself (not product bugs), fixed before the final run

A password reset signs the account out everywhere (expected) and killed the script's own token; booking create answers 200 not 201; the group-detail answer has one `status` instead of a list; fake Stripe events needed the `object` field a real event has; receipts must be uploaded first (a link to another site is refused, correctly); the sign-in routes allow 20 calls a minute, so the "same message for unknown email" check needed a fresh minute and a fresh fake address. None of these hid a product problem.

## New wording (needs approval)

- `BOOKING_TEMPORARILY_UNAVAILABLE`: "Booking is not available for a moment. Please try again shortly." (`backend/app/core/messages.py`). Shown only if the lock service fails in the middle of a booking.
- The signed-in-check failure reuses the existing default "This service is not available right now".
