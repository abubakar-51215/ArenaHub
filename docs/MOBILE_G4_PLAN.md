# G4 plan: Booking summary, Payment, Booking confirmed

Status: BUILT (see "G4 decisions" in MOBILE_REQUIREMENTS.md). This note is the plan it was built from. Source frames: `design/prototypes/arena-hub-player-app.html` (Booking summary, Payment, Booking confirmed). Text and numbers only.
Rule kept: a pop-up, sheet or screen that is not in a prototype file needs a frame first.

---

## 0. How a booking is made today (backend facts)

- `POST /bookings` takes up to **8 slot ids** (same court), an optional `promo_code`, optional equipment, and a `payment_type` (full or advance).
- It creates **one booking row per slot**. All rows share one `booking_group_id`. The mobile app uses the group id as the "booking" (payment, confirmation).
- Slots are reserved **at creation**. There is no short hold timer; the only expiry is the **24 h stale-payment sweeper** that cancels unpaid groups.
- Price lines the backend returns: `slots_subtotal`, `equipment_total`, `discount_amount`, `total`. **No tax, no service fee.** Advance payment uses the arena's `advance_percentage` of the total.
- Payment is per group: `POST /payments/initiate` (409 if one already exists for the group), receipt upload for bank transfer, owner approval, webhooks for gateways.
- Today the app creates the booking when the person taps **Continue** on the summary, so the promo code can only be given there, before the Payment screen.

## 1. Booking summary

Frame shows: arena, court, date, time range, price lines, promo code, a "Tax & service" line, advance/full choice, Continue.

| Frame item | Data exists? | Gap and smallest fix |
|---|---|---|
| Arena name, court name, sport | Yes (arena/court endpoints, passed from Pick a slot) | none |
| Date, start–end (range label) | Yes (`slots` JSON from Pick a slot; `rangeLabel` in `lib/slots.ts`) | none |
| Slot total | Yes (sum of slot prices) | none |
| Discount code | Only at booking creation | Add `POST /bookings/preview` (slot ids, promo code) returning the four price lines with no reservation. Lets the code be applied or refused on the summary. |
| Fees / "Tax & service" | **No. Backend has none.** | Drop the line (recommended). Do not show 0 or an invented number. |
| Total | Yes at creation; not before | Same preview endpoint |
| Advance vs full | Yes (`payment_type`, arena advance %) | Keep as two rows if the arena has an advance %; hide if 0 |
| Slot still free | Not checked until creation | Preview also re-checks the slots (see states) |

Several consecutive slots: Pick a slot sends the chosen ids; one `POST /bookings` call with all ids; the summary shows one line "Slot total (3 hrs)" not one line per slot.

Smallest fix summary: **1 new endpoint** (`POST /bookings/preview`), and the booking is created when the person taps **Pay** (not Continue). That removes unpaid reservations from people who back out.

## 2. Payment

Frame must show **exactly four options**: Card (`stripe`), Bank transfer (`manual`), JazzCash (`jazzcash`), EasyPaisa (`easypaisa`). `mock` is never listed. **Nothing preselected**; Pay is disabled until one is chosen. **No Cash on arrival.** The frame's saved Visa, linked wallet number and "cash at arena" rows are not supported and are dropped.

What happens after tapping Pay today, and the smallest fix:

| Option | Today | Smallest fix |
|---|---|---|
| Card (stripe) | **Fails (HTTP 500)** with the placeholder key | See card explanation below: show it disabled with "Card payments are not available yet" until a real key exists |
| Bank transfer (manual) | **Works.** Person uploads a receipt, owner approves, booking confirms | Add the "awaiting proof / awaiting approval" state frame and show bank details text |
| JazzCash | **Placeholder.** The simulator only completes through the dev-only `simulate-confirm`; the app calls it right after initiating, so it **fails outside dev** | Until real gateway work: show "Coming soon" (disabled) or keep in dev only. Real fix is the gateway work, kept last |
| EasyPaisa | **Same as JazzCash** | Same |

Card 500 explained: with a placeholder key like `sk_test_xxx` the code treats the key as real and calls Stripe. Stripe rejects it with an `AuthenticationError`, which nothing catches, so the API returns 500. With **no** key at all the provider simulates, which is why it only breaks with a placeholder.
Safe behaviour while no real key exists: the backend treats keys matching the placeholder pattern (or empty) as "not configured", and `GET /payments/methods` returns `stripe` as `available: false`. Payment initiate for `stripe` then returns a clean 503 with the message "Card payments are not available yet", never a 500. The app shows the Card row greyed with that text.

Smallest changes: (a) a methods endpoint that says which of the four are available; (b) catch the Stripe auth error and map it to a clear 503; (c) stop calling `simulate-confirm` from the app outside dev. Real gateway work (Stripe live, JazzCash, EasyPaisa signatures and webhooks) stays last.

## 3. Booking confirmed

| Item | Can show today? | Gap and smallest fix |
|---|---|---|
| Arena, court | Yes | none |
| Date, times | Yes | none |
| Amounts (total, paid, due) | Yes | none |
| Booking code | Not stored | Show `AHB-` plus first 6 characters of the group id, upper case. Computed on the phone, no backend change (recommended) |
| QR code | Not in the app | Optional: QR of the booking code (needs one small library). The frame says "works offline"; that is only true if the code is on the phone |
| Add to calendar | No (`expo-calendar` not installed) | Option A: install `expo-calendar`. Option B: share an `.ics` file. Recommend B first |
| Share | No | Native share sheet with a text summary (no new library) |
| Get directions | Arena has address; no coordinates in the frame flow | Dropped (Location block is later work, needs a frame) |
| Cancel / reschedule rules | Backend has cancel rules (refund by time) | Show as plain text from a small `GET /bookings/{id}/cancellation-policy` or fixed copy; needs the user's wording |
| Reminder copy | Frame says "two hours before"; backend sends 24 h and 1 h | Change the copy to match the backend (1 h) |
| Invite players | Not supported | Drop (recommended) |

## 4. States and frames

"Needs frame" = not in any prototype file, so it waits for the user.

| State | Behaviour proposed | Needs frame? |
|---|---|---|
| Loading (summary, confirmed) | Skeleton rows, same as other screens | No (existing skeleton pattern) |
| Error loading | Existing full-screen error with Try again | No (existing pattern) |
| Slot lost between Pick a slot and Pay | Preview/create returns 409; toast "That time was just taken" and go back to Pick a slot | Toast pattern exists; **screen wording needs a frame** |
| Discount code applied | Green line under the code, price lines update | **Yes** |
| Discount code refused | Red message under the field (invalid, expired, minimum not met) | **Yes** |
| Expired hold timer | No hold exists today; only if a short hold is added | **Yes, only if the hold is approved** |
| Payment pending: awaiting bank transfer proof | Screen with bank details, upload receipt, status | **Yes** |
| Awaiting owner approval | Status on the confirmed screen | **Yes** |
| Payment failed | Message, try another method, booking kept for 24 h | **Yes** |
| Double-tap on Pay | Button disables and shows spinner after first tap; backend 409 on a second initiate handled as "already started" | No (no new UI) |
| Back button during payment | Confirm sheet "Leave payment? Your booking stays for 24 h" | **Yes** (new sheet, uses existing sheet pattern) |
| Card not available | Disabled row with text | **Yes** (row state) |
| Gateway "Coming soon" | Disabled row | **Yes** (row state) |
| Toast uses | Slot taken, copy done, network error | Pattern exists |

## 5. Questions for the user (recommended answer first)

1. Create the booking when the person taps **Pay** instead of Continue, with a new preview endpoint for prices? **Yes.**
2. Add a short hold timer (for example 10 minutes) instead of only the 24 h sweeper? **No for now**; keep 24 h, drop the timer from the frames.
3. Drop the "Tax & service" line? **Yes**, the backend has none.
4. Keep the advance/full choice? **Yes**, but only when the arena has an advance %.
5. Card: show disabled with "Card payments are not available yet" until a real key? **Yes.**
6. JazzCash and EasyPaisa: show disabled "Coming soon" outside dev? **Yes.**
7. Booking code format `AHB-` plus 6 characters of the group id? **Yes.**
8. Calendar: share an `.ics` file now and install `expo-calendar` later? **Yes.**
9. Invite players: drop? **Yes.**
10. Reminder copy: say 1 hour to match the backend? **Yes.**
11. Cancel/reschedule rules as text: please supply the wording, or approve using the backend's refund rules as written? **Approve backend rules.**
12. QR block: keep with the booking code only? **Yes**, and drop the "works offline" words.

## 6. Frames needed from the user

Discount applied; discount refused; awaiting bank transfer proof; awaiting owner approval; payment failed; leave-payment sheet; slot-lost wording; Card-not-available and Coming-soon row states; hold-expired (only if a hold is approved). Location block (Get Directions) stays later work.

## 7. Order of work

1. Backend: methods endpoint, Stripe error mapping, preview endpoint, small tests on the test database.
2. App: summary, payment, confirmed using the frames that exist.
3. Missing-state frames from the user, then those states.
4. Real gateway work last.
