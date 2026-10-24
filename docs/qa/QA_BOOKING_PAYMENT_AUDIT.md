# QA: booking, payment and refund audit

All numbers below come from `qa_results.json` (see `QA_TEST_RESULTS.md` for each check). Database evidence was read straight from `arenahub_scratch`.

## How a slot is protected (read from the code, then proven)

1. **Redis lock** `lock:court:<court>:date:<date>:slot:<time>`, `SET NX PX 30000`. It is held only while the booking request runs (acquired, checked, saved, released), not during checkout.
2. **Row checks inside a database transaction** (the slot must still be available).
3. **A unique index in PostgreSQL**: `uq_bookings_active_slot_id` on `bookings(slot_id)` where status is not cancelled or rejected. Even if the lock and the checks were skipped, a second active booking for one slot cannot be saved.
4. The slot then shows `reserved` (waiting for payment) or `booked`. The hold for unpaid bookings is a **database state** (`pending_payment`), cancelled by a scheduled job after 24 hours. It is not a Redis key.

## Concurrency results

| Test | Result |
|---|---|
| U04: 8 requests at once from 3 players for one slot | `200, 409 x7`. Exactly one active booking row; slot `reserved`. No duplicate payment. |
| U04b: 2 players at the same instant | `200 / 409` |
| U04c: abandoned checkout | While held, the other player gets 409. After the player leaves checkout (release), the other player books it (200). |
| C01: payment window passes, then a late signed "paid" callback arrives | Sweep cancelled the booking and freed the slot; the late callback (HTTP 200, ignored) did not bring the booking back; another player then booked the slot. |
| U06b: two simultaneous cancels of one paid booking | `200` and `422`; one refund row; slot available again |
| A03: three simultaneous admin force-refunds | **First run: three refunds of 2000 on a 2000 payment (defect, Critical).** After the fix: `200, 409, 409`, one refund row. See `QA_BUG_REPORT.md`. |
| Pytest | `test_booking_race.py`: eight parallel players, eight parallel payment starts, three parallel force-refunds: one winner each |
| X04: Redis lock keys left after all the above | 0 |

## Payment matrix (what the server did)

| Case | Result |
|---|---|
| Stripe: valid signed `checkout.session.completed` | Payment `completed`, booking `confirmed` |
| Stripe: bad signature | 422, still `pending_payment` |
| Stripe: signed, but wrong amount | 422, still `pending_payment` |
| Stripe: duplicate event | 200, one payment row, nothing changes |
| Stripe: expired / cancelled checkout | Payment `failed`, booking cancelled, never confirmed |
| JazzCash and EasyPaisa (simulator): valid signed callback | Booking `confirmed`, one completed payment |
| ...bad signature / the other gateway's address / unknown transaction | 422 / 422 / 404; still `pending_payment` |
| ...duplicate callback | 200, still one completed payment |
| Browser "return" page, or another player's `simulate-confirm` | Does not pay (return page 422; simulate 404) |
| Bank transfer: receipt uploaded | `pending_approval`, not paid |
| ...player approves own receipt / another owner approves | 403 / 404 |
| ...owner approves | `confirmed` |
| ...owner rejects | Booking `rejected`, payment `failed`; approving it afterwards is refused (422) |
| Backend restart with a payment pending (C03) | Booking and payment still there; the late signed callback confirms once |

The `simulate-confirm` route works only when the app is in development mode (`is_dev`); in other modes it answers 404 (read from code, not re-run).

## Refunds

- Cancelling a paid booking more than 24 hours ahead made exactly one refund for the booking's share.
- The refund for a **card** payment stayed `pending`. Reason, from the backend log: the scratch payments are simulated, so Stripe's test API answers "No such payment_intent". The refund is therefore not shown as done. This is the "refund fails: no false confirmation" behaviour, seen by accident.
- Bank-transfer refunds are `pending` by design until the owner sends the money and marks it paid (covered by `test_owner_refunds.py`).
- A force refund of an already fully refunded payment answers 409.

## Cross-role consistency (U03, A03b, O04)

- The same booking and the same amount show for the player, the owner (`/owner/arenas/{id}/bookings`) and the admin (`/admin/bookings`, `/admin/payments`).
- Owner payment report (CSV) rows and total equal the payments table for that arena (O04).
- Player and owner both received a notice for the booking (U06a).

## Honest limits

- Card payments were confirmed by a signed callback, not by driving Stripe's hosted page.
- JazzCash and EasyPaisa are development simulators (no merchant account exists yet).
- The Redis lock lasts 30 seconds inside one request; a "lock expires during checkout" case does not exist in this design. What expires is the 24-hour database hold (C01).
