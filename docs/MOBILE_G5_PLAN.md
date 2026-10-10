# G5 plan: My bookings, booking detail, cancel, reschedule, the old balance screen

Status: PLAN ONLY. Nothing is built. Source frame: `design/prototypes/arena-hub-player-app.html`, screen "My bookings" (the only G5 frame that exists). Text and numbers only.
Rule kept: a pop-up, sheet or screen that is not in a prototype file needs a frame first.

---

## 0. What the My bookings frame draws

- Header "My bookings" with a bell on the right; tab bar "Bookings" selected.
- A three-way switch: Upcoming, Past, Cancelled (the app today has two: Upcoming, Past).
- Booking cards, one per booking: sport picture 54 px, arena name, a status badge (Confirmed, Awaiting payment), the line "Thu 22 May · 6:00 – 7:00 PM", then small tags: "View pass" and "Invite" on a confirmed one, "Pay ₨ 1,800" (amber) on an unpaid one.
- A block "You keep coming back to": the arena, "14 bookings · last on 15 May" and a lime "Rebook" button.
- Not drawn: Past and Cancelled lists, empty, loading, error, any detail screen, cancel, reschedule, refund status, the report.

## 1. Where the app stands today (facts)

- The tab is old styling: plain tabs, plain cards, system `Alert` for cancel, no Cancelled tab.
- `GET /bookings` returns **one row per slot**, newest created first, 50 per page, one optional status filter. A 3-hour booking is 3 rows. The frame shows one card per booking, so the rows must be grouped by `booking_group_id`.
- Past and Cancelled are not separated by the server. "Past" today means "any status that is not pending or confirmed", so a confirmed booking whose time has passed stays under Upcoming until the server marks it completed.
- Cancel is per row (`POST /bookings/{id}/cancel`). Reschedule is per row (`POST /bookings/{id}/reschedule`, one new slot of the same court, any time before the start, no limit on how often).
- Refund: on cancel the server picks the refund percentage from the arena policy (`refund_policy`, default 100 % more than 6 h before, else 0 %) and refunds `payment.amount x percentage` for the row. Refund rows have a status: pending, processed, failed. A booking that is only waiting (unpaid) is cancelled with 0 %.
- Reschedule price: a dearer slot leaves a balance to pay (the old balance screen); a cheaper slot refunds the difference automatically.
- The old balance screen `/payment/[groupId]` (balance=1) still uses the dev simulator for card and wallets. With the four-option rules of G4 it cannot work online, so it must change.
- `GET /reports/my-bookings?format=csv|pdf&date_from&date_to` exists (up to 5,000 rows; columns Date, Time, Status, Payment Status, Amount; no arena or court name). No mobile screen calls it.
- Receipt PDF: `GET /payments/{id}/receipt.pdf` exists and the old card downloads it.
- QR: the server makes a QR image when a booking is confirmed (`qr_code_url`). The G4 Confirmed frame has no QR, so "View pass" has no screen to open.

## 2. My bookings

Data that exists: bookings rows with dates, times, amounts, status, payment status; arena name and photo from the arena endpoint; court and sport from the courts endpoint.

Missing and the smallest fix:

| Need | Gap | Smallest fix |
|---|---|---|
| One card per booking | list is per slot | New `GET /bookings/groups?tab=upcoming|past|cancelled&page=` returning one item per group: arena name, arena photo, court name, sport, date, start, end, slot count, status, payment status, pay now, due at arena, refund amount and refund status, booking code. Sorted by start date (upcoming: soonest first; past and cancelled: latest first). |
| Upcoming vs Past | server cannot tell | The same endpoint decides: Upcoming = pending_payment, pending_approval or confirmed with the end time in the future; Past = completed, or confirmed and ended; Cancelled = cancelled or rejected. |
| "Awaiting payment" with "Pay ₨ 1,800" | Payment screen only works for a fresh checkout | Payment gets a resume mode (open with a `groupId`): no booking is created, the amount comes from the group details; the rest is the same. The 24 h sweeper still cancels it. |
| "Awaiting approval" | exists as status `pending_approval` | Badge "Awaiting approval" (amber), no extra tag. |
| "You keep coming back to" | no data | Counted from the same endpoint on the phone (arena with most past or confirmed bookings, count, last date); "Rebook" opens that arena. Needs no backend change if the list endpoint can return all groups for the player (page size up to 100). |
| Bell | notifications screen exists | Bell opens it (already built). |

## 3. Booking detail (no frame)

A tap on a card should open a detail screen: arena, court, date, time, price lines, booking code, payment method and status, the cancellation rules text (already made by the server for G4), refund status if cancelled, and the buttons Cancel, Reschedule, Receipt, Add to calendar. **No frame exists.** Data: `GET /bookings/group/{id}` (built in G4) covers all of it except the refund amount and status.
Smallest fix: add `refund_amount`, `refund_status` and `can_cancel`, `can_reschedule` to that response.

## 4. Cancel and the refund amount

- Today: system alert "This may be subject to the arena refund policy." with no number.
- Wanted: a sheet that shows the refund amount before the person confirms ("You will get ₨ X back" or "No refund after this time"), a red "Cancel booking" and a plain "Keep booking".
- Smallest backend fixes:
  1. `GET /bookings/group/{id}/cancel-preview` returning refund percentage, refund amount (captured payment x percentage), what was paid, and the rule text.
  2. `POST /bookings/group/{id}/cancel` that cancels every row of the group in one go and refunds once. **Needed because per-row cancel computes the refund from the whole group payment for each row**, so cancelling the first slot of a 3-slot booking can refund the full payment. A test must prove one refund of the right size for a 3-slot group before this ships.
- Awaiting approval (receipt sent, nothing confirmed): nothing is captured, so the sheet says "No money has been taken" and cancelling releases the times; the owner is told to ignore the receipt. Needs a one-line owner notice (existing `booking_cancelled` notice covers it).
- Refund status shown on a cancelled card and in the detail: "Refund ₨ X, on its way" (pending), "Refunded ₨ X" (processed), "Refund needs help, contact the arena" (failed or manual). Bank-transfer refunds stay pending until the owner marks them paid, so the text must not promise a day.

## 5. Reschedule (the existing screen has no frame)

- Today: one new slot on the same court for one booking row; the screen is old styling.
- Wanted: pick a new day and time on the Pick a slot pattern; show the price difference before confirming ("₨ 200 more to pay at the arena" or "₨ 200 back to you"); confirm; success toast.
- Smallest fixes:
  1. `POST /bookings/group/{id}/reschedule` taking the same number of consecutive new slots on the same court, so a 2-hour booking moves as a whole (per-row reschedule would split it).
  2. `POST /bookings/group/{id}/reschedule-preview` returning the new total, paid so far, balance to pay, or refund due. No reservation.
  3. A limit: for example a booking can be moved only until the free-cancellation time, and only once. **Needs your decision** (question 6).
- The balance: with a dearer slot the balance is due "at the arena" (the existing behaviour) and the app does not ask for an online balance payment until a real gateway exists. The old balance screen is then not needed and is removed in G5; only a text line "₨ X to pay at the arena" shows.

## 6. Booking-history report (download)

- Backend exists (csv or pdf). Missing: arena name and court name columns, a period choice and the mobile UI.
- Wanted: on My bookings or Profile, a "Download my bookings" row; choose period (this month, last 3 months, all) and format (PDF, CSV); the file opens in the share sheet.
- Smallest fix: add Arena and Court columns to `player_bookings_report`; the phone saves the file with the same approach as the receipt (file-system write then share sheet).
- **No frame exists** for where it lives or its sheet.

## 7. States and frames

"Needs frame" = not in any prototype file.

| State | Behaviour proposed | Needs frame? |
|---|---|---|
| Upcoming list | Cards as in the frame | No |
| Past list | Same card, badge "Completed", tag "Rebook" instead of "View pass"; "Rate" tag when no review yet | **Yes** (the tags) |
| Cancelled list | Same card, badge "Cancelled" (red) and the refund line | **Yes** |
| Awaiting payment | Amber "Pay ₨ X" tag, as drawn | No |
| Awaiting approval | Amber badge | **Yes** (badge text only; low risk) |
| Refund status | Line under the date on a cancelled card | **Yes** |
| Empty (per tab) | Icon, title, one line, "Find a court" button | **Yes** (three texts) |
| Loading | Skeleton cards, same as other screens | No (existing pattern) |
| Error | Full-screen error with Try again | No (existing pattern) |
| List page two | Load more at the end of the list | No |
| Booking detail | New screen | **Yes** |
| View pass (QR) | New screen with the QR and booking code | **Yes** |
| Cancel sheet with refund amount | New sheet on the Leave payment pattern | **Yes** |
| Cancel done | Toast "Booking cancelled. Refund ₨ X on its way." | No (toast pattern) |
| Reschedule flow | New screen and price-difference line | **Yes** |
| Reschedule slot taken | Toast, same as Pick a slot | No |
| Report download | Row, sheet (period and format), toast | **Yes** |
| Invite | Dropped in G4 (decision 64); the tag stays out | No |
| Pay at the arena balance after reschedule | One text line | **Yes** (wording) |

## 8. Questions for you (recommended answer first)

1. One card per booking (group) through a new grouped list endpoint? **Yes.**
2. Cancelled tab included, as the frame shows? **Yes.**
3. Cancel the whole booking only (no cancelling a single hour of a multi-hour booking)? **Yes**, and fix the refund calculation with a test.
4. Show the refund amount in the cancel sheet before confirming? **Yes**, from the arena policy.
5. Reschedule moves the whole booking, same court only? **Yes.**
6. Limit reschedule to before the free-cancellation time, one time per booking? **Yes** (needs a new rule; say if you prefer no limit).
7. A dearer new time leaves the extra to pay at the arena (no online balance payment until real gateways exist)? **Yes**; the old balance screen is removed.
8. "View pass": build a pass screen with the QR, or drop the tag? **Drop for now**; draw a frame later if you want it.
9. "You keep coming back to": build it, counted on the phone? **Yes.**
10. Past tab: "Rate" tag to review after a completed booking? **Later**, with the Reviews group (G7).
11. Report: download from the My bookings header, PDF by default with CSV as a second choice? **Yes**, and add arena and court columns.
12. Notifications bell stays as drawn and opens the existing screen? **Yes.**

## 9. Frames needed from you

Past card tags, Cancelled card with refund line, empty state per tab, Booking detail, Cancel sheet with the refund amount, Reschedule screen with the price line, "Pay at the arena" balance wording, Report download row and sheet, View pass (only if question 8 is "build"). Loading, error, list paging and toasts reuse existing patterns.

## 10. Order of work (after frames and answers)

1. Backend with tests: grouped list, group cancel with the right refund, cancel preview, group reschedule and preview, report columns.
2. My bookings list with the frame (Upcoming, Awaiting payment, Cancelled) and the resume mode of Payment.
3. Cancel sheet and refund status, then reschedule, then detail and report from your frames.
4. Remove the old balance screen and its simulator call.
5. Real payment gateways stay last.

## 11. Open items from the restyle checklist that belong here

`components/booking-card.tsx` image fallback (lineSoft, should be ink), My bookings tab control (the segmented track with the white active button), reschedule `slotDisabled` (dashed look). All three are fixed by this group.
