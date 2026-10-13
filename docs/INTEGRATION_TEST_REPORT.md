# Integration test report — all three apps together

Date: 13 October 2026 (Karachi time). Branch: `prototype-screens`.

## What was tested

The real backend, the owner and admin web app, and the phone app (web build) ran together on one computer:

- Backend on port 8000, using a fresh scratch database (`arenahub_scratch`) built from the migrations. The dev database was not touched.
- Owner and admin web app on port 3000 (Next.js dev server).
- Phone app as a web build on port 8081 (Expo).
- Playwright browsers: the player on a 390×844 phone screen, the owner and the admin on 1440×900 web screens. Each person had their own network address, so rate limits behaved like separate devices.
- Sign-in codes were read from the backend log.

The scripts that drove the test live outside the repository and are not committed.

**Data set.** 1 admin, 2 owners and 4 players (Ayesha Khan, Bilal Ahmed, Sana Malik, Usman Tariq). There were 3 arenas:

- **Kickoff Arena**, Lahore, futsal: Court A at ₨ 2,000 with an evening peak rule (×1.25) and a Saturday rule (×1.5); Court B at ₨ 2,500.50; 50% advance; one blocked day.
- **Smash Point Padel**, Lahore: full payment.
- **Karachi Cricket Hub**: owned by the second owner, no photo.

There were two discount codes: SAVE10 (10%, 2 uses) and OLD5 (expired). Each arena had one bank account.

**How it was judged.** Every step checked a number or a piece of text, not just "page opened". After each change the other apps were checked for when they showed it: **live** (no refresh), **on refresh**, or **never**.

## Summary

244 checked steps across S1–S14: **241 pass, 3 fail.** S15 swept 372 screens.

| Scenario | Apps touched | Result | Bugs found | Fixed | Left (severity) |
|---|---|---|---|---|---|
| S1 Arena life | owner web, admin web, admin phone, player phone | 31 / 31 pass | 0 | — | — |
| S2 Booking and bank transfer | player phone, owner web, admin web | 24 / 24 pass | 2 | 2 | — |
| S3 Money everywhere | all, plus owner CSV | 18 / 18 pass | 3 | 3 | money format differs between apps (minor) |
| S4 Cancel, reschedule, refunds | all | 20 / 20 pass | 1 | 1 | refund notices have no date (minor) |
| S5 Matches | player phone, admin | 12 / 12 pass | 2 | 2 | — |
| S6 Reviews | player phone, owner web, admin | 11 / 12 | 1 | 0 | no Reviews badge or notice for owners (minor) |
| S7 Complaints | player phone, admin web and phone | 8 / 8 pass | 0 | — | editing a reply sends a second notice (minor) |
| S8 Accounts | all | 14 / 14 pass | 0 | — | — |
| S9 Owner tools | owner web, player phone, admin | 14 / 15 | 2 | 1 | discount use not given back (major) |
| S10 Notifications | all | 15 / 15 pass | 1 | 1 | — |
| S11 Live updates, refresh, links | all | 16 / 16 pass | 1 | 1 | — |
| S12 Sessions and security | all, plus API | 25 / 25 pass | 0 | — | rate limiter trusts a header anyone can send (major, before going live) |
| S13 Failures | player phone, owner web | 14 / 15 | 3 | 0 | text file picked as receipt (minor, web build only); "Try again" lands on Home (minor) |
| S14 Data edges | all | 19 / 19 pass | 1 | 1 | other phone admin lists stop at 50 (minor) |
| S15 Every screen, every width | all, 372 screens | 0 sideways scroll, 0 console errors, 1 page with failed requests | 3 | 1 | text under 14px (major, design choice); small web controls on touch tablets (minor); pricing page request count (minor) |

## Fixed in this test (one commit each, each with a test or a check)

| Commit | What was wrong | Found in |
|---|---|---|
| `b63474a` | Owner and admin web showed a different booking reference (#BK-…) from the player's AHB-xxxxxx. | S2, S3 |
| `abcd558` | A booking of several hours sent one notice per hour. A rejected receipt just said "Payment failed" with no reason. | S2 |
| `2b445db` | The phone rounded paisa away: ₨ 2,501 instead of ₨ 2,500.50. | S3 |
| `eecfd23` | Booking reports (CSV and PDF) had no booking code or time, so they could not be matched to the apps. | S3 |
| `e1ae925` | A cancelled booking left its match open. A rescheduled booking left its match at the old time. | S5 |
| `72a9c56` | Hours created before an owner blocked a day could still be booked. Leaving checkout sent one notice per hour. | S9 |
| `bae23fa` | The owner got no notice when a receipt arrived for them to check. | S10 |
| `3c5e998` | On the web, opening a link while signed out landed on the dashboard after sign-in, not the page that was opened. | S11 |
| `b444f5c` | Phone admin Users showed only the first 50 people, with no way to see more. | S14 |
| `3adf7f9` | The phone search field took taps only on its text line, not the whole box. The web "Sign in" link was 40px wide on phones. | S15 |

## Left open: cause and proposed fix

### Major

1. **Discount use is not given back** (S9).
   - *What happens:* when a player leaves checkout, or a hold runs out, the code stays used. Two people who never pay can use up SAVE10.
   - *Cause:* the booking does not record which code it used, so there is nothing to give back.
   - *Proposed fix:* add a `discount_code_id` column on bookings (needs a migration). When a group is released, expired, or rejected before payment, take one off `used_count`.
   - *Not done here because:* it touches money rules and needs a migration.
2. **Rate limiter trusts `X-Forwarded-For`** (S12; this test used it on purpose to act as separate devices).
   - *What happens:* anyone can send that header and get a fresh limit on every request.
   - *Proposed fix:* read the header only when the request comes from the configured proxy address, and otherwise use the connection address.
   - Belongs on the list in `BEFORE_GOING_LIVE.md`.
3. **Text under 14px** (S15).
   - *Where:* both apps use 9–12px for small labels. Examples: the phone tab bar is 11px, sport chips 10.5px, weekday letters on the slot strip 9px; owner web eyebrow labels and schedule hours are 9.5–10px.
   - *Why not changed here:* this is a design-system choice touching most screens. Your call.
   - *Proposed fix:* set a floor of 12px now (and 14px for anything a person must read to act), starting with the 9–10px cases.

### Needs your decision (money rule, not changed)

- **Arena suspension refunds per booking, not per booking group** (S5). The totals are right, but a player with a 3-hour booking gets three refund rows.

### Minor

- **Owner Reviews** (S6): no badge for reviews waiting for a reply, and no notice when a review arrives. *Proposed fix:* a count on the Reviews link (like Bookings has) and a "New review" notice.
- **Phone admin lists stop at 50** (S14): Arenas, Complaints and Refunds. Users was fixed. *Proposed fix:* the same "Show more" as Users.
- **Picking a text file as the receipt** (S13, web build only): Expo's image picker throws an uncaught error and the screen gets stuck. On a real phone the gallery only offers photos. *Proposed fix:* on web, use our own `<input type="file" accept="image/jpeg,image/png,image/webp">`.
- **After the server comes back** (S13): "Try again" on the Log in screen signs back in but opens Home, not the screen the player was on. *Proposed fix:* keep the last route and reopen it.
- **Small web controls on touch tablets** (S15): at 768px and wider, buttons, fields and sidebar links are 30–40px tall. That is fine for a mouse. The 44px sizes only apply below 768px. *Proposed fix:* a separate `@media (pointer: coarse)` rule giving buttons, inputs and icon buttons a 44px minimum height.
- **Pricing Rules page** (S15): sends one request per court. At sweep speed this hit the 100-per-minute limit (429). An owner with many courts moving quickly could see it too. *Proposed fix:* one endpoint that returns all of the owner's rules.
- **Last hour of the day:** an arena open until 23:59 gets its last slot at 22:00–23:00, so the 23:00 hour is never offered. That is also why a booking crossing midnight could not be tested. *Proposed fix:* treat a 23:59 closing time as midnight when making slots.
- **Refund notices have no date** for the booking they belong to (S4).
- **Editing a complaint reply sends a second notice** (S7).
- **Admin "resend code" within 60 seconds** gives a plain success and no new code (S8). It should say "wait N seconds".
- **Empty upload message** (S13): an empty file says "File content does not match the declared image type." Better: "The file is empty."
- **Slot screen deep link**: opening `/court/{id}/slots` without `arenaId` shows "—" for the arena on Review booking.

## Where the apps disagree or confuse

1. **Money:** the web writes "Rs. 2,000"; the phone writes "₨ 2,000". Both now keep paisa.
2. **CSV export:** shows raw status words (`confirmed`, `pending_payment`) where the screens say "Confirmed" and "Awaiting payment".
3. **Opening a notice:** on the phone it opens the booking or match. In the owner web notification list it only marks it read.
4. **Where receipts are checked:** on owner **Bookings**. **Payments** holds refunds and bank accounts. Owners may look for receipts under Payments.
5. **Owner Schedule:** labels blocks by court, not by player, so a booking cannot be recognised from the schedule alone.
6. **When changes show up:**

| Change | Where it shows | When |
|---|---|---|
| A player takes or frees an hour | other players' slot list | live |
| Booking confirmed or rejected | player's awaiting screen | live (checks every 15 s) |
| Booking confirmed or cancelled | player Bookings | live |
| Receipt sent | owner web Bookings | on refresh |
| New booking | owner web bell | on refresh |
| Approved in another tab | owner web Bookings | on refresh |
| Arena sent for approval | admin web Approvals | on refresh |
| Arena approved | owner web status | live |
| Arena rejected | owner web Arenas | on refresh |
| New complaint | admin web Complaints | live |

## Final checks

| Check | Result |
|---|---|
| Backend test suite | 396 tests, all pass |
| ruff (check and format) | clean (203 files formatted) |
| Phone: tsc | clean |
| Phone: eslint | 0 errors (3 old warnings in a generated type file and two one-off scripts) |
| Phone: check scripts (brand-motion, deeplink, karachi, keyboard, nearme, text, worklet) | all pass |
| Web: tsc and eslint | clean |
| Web: check scripts (after-login, no-admin-links) | pass |
| Web: `next build` | builds (dev server stopped first, restarted after) |

## What this test cannot prove (needs a real phone)

- Push notifications arriving on a locked phone, and tapping one to open the app.
- The real camera and gallery picker, and photo sizes taken on a phone.
- The Android back button, opening the app from a link in another app, and the app coming back from the background with an expired token.
- Real network changes (Wi-Fi to mobile data, airplane mode) and the offline banner reacting to them.
- The on-screen keyboard covering fields, haptics, location permission for "near me", and the phone's own text size setting.
- Real email delivery. Codes were read from the log; notice emails are not logged.
- Card and JazzCash payments (not available here). Bank transfer was tested with an uploaded receipt only, with no real money.

## Appendix: every checked step
### S1 — 31 of 31 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| owner creates an arena | 201 pending | 201 pending | PASS | POST /owner/arenas |
| court and bank account added | 201, 201 | 201, 201 | PASS |  |
| admin gets ONE "New arena waiting" | 1 notice "Clifton Futsal 370 asked to be listed." | 1 "Clifton Futsal 370 asked to be listed." | PASS | GET /notifications (admin) |
| Overview count goes up by one | 1 | 1 | PASS | GET /admin/phone/overview |
| admin web Approvals list shows it | listed | refresh | PASS | web /admin/arenas |
| phone admin tab badge shows the waiting count | Approvals, 1 waiting | Approvals, 1 waiting (never) | PASS | phone /admin |
| admin web reject: the arena is rejected with the reason | rejected / reason | rejected / Please add a photo of each pitch. | PASS | admin web Reject dialog |
| owner gets ONE "not approved" notice with the reason | "Clifton Futsal 370 was not approved. Reason: Please add a photo of each pitch." | Clifton Futsal 370 was not approved. Reason: Please add a photo of each pitch. | PASS |  |
| owner web Arenas shows the rejected status | Rejected | refresh | PASS | web /owner/arenas |
| owner web shows the reason on the Arenas list | reason visible | true | PASS | web /owner/arenas |
| owner edits and resubmits | 200, 200 pending | 200, 200 pending | PASS |  |
| admin gets a second "New arena waiting" (one per submission) | 2 in total for this arena | 2 | PASS |  |
| admin phone approve: the arena is approved | approved | approved | PASS | phone /admin/approvals/:id |
| owner gets ONE approved notice | "Clifton Futsal 370 is approved. Players can find and book it." | Clifton Futsal 370 is approved. Players can find and book it. | PASS |  |
| owner web status changes | Taking bookings | live | PASS | web /owner/arenas |
| admin web Pending list drops it | gone | live | PASS | web /admin/arenas |
| search API: listed with price 3500, futsal, Karachi | min_price 3500.00, futsal, Karachi | 3500.00, futsal, Karachi | PASS |  |
| player Home shows it with "₨ 3,500" and "Futsal" | Clifton Futsal Club ... Futsal ₨ 3,500 | listed, ₨ 3,500 | PASS | phone / |
| player search results show it with Clifton and Futsal | listed, Clifton, Futsal | true,true,true | PASS | phone /results?q=Clifton |
| near-me search (Clifton, 10 km) includes it with a distance | listed with distance_km | 0.1 | PASS | GET /arenas?near_lat=&near_lng= |
| a player has a confirmed booking there | confirmed | 200 | PASS |  |
| admin suspends with a reason | 200 | 200 | PASS |  |
| owner gets ONE suspended notice with the reason | reason in body | ArenaHub suspended Clifton Futsal 370. Players cannot find or book it, and its upcoming bookings were cancelled with a full refund. Reason: Gate closed during booked games. | PASS |  |
| player search no longer shows it | not listed | not listed | PASS |  |
| the player booking is cancelled with a full refund | cancelled, refund 3500 | cancelled, refund 3500.00 (pending) | PASS |  |
| player gets ONE cancel and ONE refund notice ("₨ 3,500") | 1 + 1, ₨ 3,500 | 1 + 1: A refund of ₨ 3,500 has been initiated for your booking. | PASS |  |
| player Bookings screen updates | booking leaves Upcoming | live | PASS | phone /bookings |
| owner sees the bank-transfer refund to send | 1 pending refund 3500 | 3500.00,3500.00,3500.00,3500.00 | PASS |  |
| reactivate brings it back to search | 200, listed | 200, listed | PASS |  |
| owner gets ONE "live again" notice | 1 | 1 | PASS |  |
| no console errors or failed requests in the open apps | 0 / 0 | owner:0/0 admin:0/0 player:0/0 adminPhone:0/0 | PASS | {"owner":[],"admin":[],"player":[],"adminPhone":[]} |

### S2 — 24 of 24 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| the 10 AM slot is free on 2026-10-16 | available | available | PASS | GET /courts/9b10d47e-1bea-48a5-a6ab-721aa1e6fb2f/slots |
| second player sees "10 AM, ₨ 2,000" free | pill present | 1 | PASS | phone /court/:id/slots |
| Review booking shows the arena, court, time and ₨ 2,000 | Kickoff Arena, Court A, 10 AM, ₨ 2,000 | true,true,true | PASS | phone /booking/:courtId |
| Pay button shows the amount to pay now | Pay ₨ 1,000 (50% advance) or ₨ 2,000 | Pay ₨ 1,000 | PASS | phone /booking/payment |
| bank screen shows the booking code AHB-xxxxxx | AHB-xxxxxx | AHB-41761E | PASS | phone /booking/bank/:groupId |
| the booking exists awaiting payment | pending_payment | pending_payment | PASS |  |
| second player: the slot turns Held/Taken without a refresh | 10 AM, Held | 10 AM, Held (live) | PASS | live over the slot socket |
| second player cannot tap it | disabled | true | PASS |  |
| after Send receipt the player waits for approval | /booking/awaiting/… | /booking/awaiting/41761ea8-e0fc-43a8-b4b7-9dec0dfe381f | PASS | phone  |
| owner web Bookings shows the code with "receipt to review" | listed | refresh | PASS | web /owner/bookings |
| owner Schedule shows a Court A block in the week (blocks are labelled by court) | at least 2 "Court A" (row label + block) | 26 | PASS | web /owner/calendar |
| owner web Approve confirms the booking | confirmed | confirmed | PASS | owner web Bookings, Approve |
| player gets ONE "Booking confirmed" | 1 | 1 | PASS |  |
| the player awaiting screen moves on to confirmed | live | live | PASS | phone /booking/awaiting |
| player Upcoming shows it as Confirmed | AHB-41761E Confirmed | true | PASS | phone /bookings |
| owner dashboard: bookings this month +1 and revenue + the amount paid | 50, +1000 | 49 -> 50, 55301.50 -> 56301.50 | PASS |  |
| admin payments lists it with the same amount and Completed | ₨ 1,000 completed | 1000.00 completed | PASS | GET /admin/payments |
| admin web Payments shows Ayesha Khan and Kickoff Arena | row present | true | PASS | web /admin/payments |
| admin Overview bookings today (only counts today) | unchanged unless the game is today | 0 -> 0 | PASS |  |
| owner web Reject: the booking is rejected | rejected | rejected | PASS | owner web Bookings, Reject |
| player 2 sees "Receipt not accepted" and the reason | Receipt not accepted + reason | true,true | PASS | phone /booking/detail/:id |
| the rejected slot is free again for others | available | available | PASS |  |
| player 2 gets ONE notice about the rejected receipt | 1 | Receipt not accepted: Kickoff Arena did not accept your receipt for AHB-8D4362. Reason: The amount on the receipt does not match. | PASS |  |
| no console errors or failed requests | 0 / 0 | owner:0/0 admin:0/0 player:0/0 p2:0/0 | PASS | [] |

### S3 — 18 of 18 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| discount SAVE10, weekday 11 AM: total 1800.00, paid 900.00, balance 900.00 match in every app | player total = owner Bookings = admin Bookings; paid = admin Payments = payment history | player 1800.00/900.00/900.00 \| owner 1800.00 \| admin 1800.00 \| admin pay 900.00 \| history 900.00 | PASS |  |
| discount SAVE10, weekday 11 AM: paid + balance = total | 1800.00 | 900.00 + 900.00 | PASS |  |
| discount SAVE10, weekday 11 AM: the owner CSV has the booking with the same amount | 1800.00 | AHB-80E476,2026-10-14,11:00-12:00,Kickoff Arena,Court A,Usman Tariq,confirmed,completed,1800.00 | PASS |  |
| evening peak 8 PM (x1.25): total 2500.00, paid 1250.00, balance 1250.00 match in every app | player total = owner Bookings = admin Bookings; paid = admin Payments = payment history | player 2500.00/1250.00/1250.00 \| owner 2500.00 \| admin 2500.00 \| admin pay 1250.00 \| history 1250.00 | PASS |  |
| evening peak 8 PM (x1.25): paid + balance = total | 2500.00 | 1250.00 + 1250.00 | PASS |  |
| evening peak 8 PM (x1.25): the owner CSV has the booking with the same amount | 2500.00 | AHB-BC7DE6,2026-10-14,20:00-21:00,Kickoff Arena,Court A,Usman Tariq,confirmed,completed,2500.00 | PASS |  |
| Saturday day rate 2 PM (x1.5): total 3000.00, paid 1500.00, balance 1500.00 match in every app | player total = owner Bookings = admin Bookings; paid = admin Payments = payment history | player 3000.00/1500.00/1500.00 \| owner 3000.00 \| admin 3000.00 \| admin pay 1500.00 \| history 1500.00 | PASS |  |
| Saturday day rate 2 PM (x1.5): paid + balance = total | 3000.00 | 1500.00 + 1500.00 | PASS |  |
| Saturday day rate 2 PM (x1.5): the owner CSV has the booking with the same amount | 3000.00 | AHB-91F5AE,2026-10-17,14:00-15:00,Kickoff Arena,Court A,Usman Tariq,confirmed,completed,3000.00 | PASS |  |
| paisa: Court B 2500.50, 50% advance: total 2500.50, paid 1250.25, balance 1250.25 match in every app | player total = owner Bookings = admin Bookings; paid = admin Payments = payment history | player 2500.50/1250.25/1250.25 \| owner 2500.50 \| admin 2500.50 \| admin pay 1250.25 \| history 1250.25 | PASS |  |
| paisa: Court B 2500.50, 50% advance: paid + balance = total | 2500.50 | 1250.25 + 1250.25 | PASS |  |
| paisa: Court B 2500.50, 50% advance: the owner CSV has the booking with the same amount | 2500.50 | AHB-187DF8,2026-10-14,15:00-16:00,Kickoff Arena,Court B,Usman Tariq,confirmed,completed,2500.50 | PASS |  |
| discount: 10% off ₨ 2,000 = ₨ 1,800, advance half = ₨ 900 | 1800.00 / 900.00 | 1800.00 / 900.00 | PASS |  |
| evening peak 8 PM = 2,000 x 1.25 = ₨ 2,500 | 2500.00 | 2500.00 | PASS |  |
| Saturday 2 PM = 2,000 x 1.5 = ₨ 3,000 | 3000.00 | 3000.00 | PASS |  |
| paisa: 2,500.50, advance half = 1,250.25, balance 1,250.25 | 2500.50 / 1250.25 / 1250.25 | 2500.50 / 1250.25 / 1250.25 | PASS |  |
| phone booking detail prints the paisa amounts | ₨ 2,500.50 / ₨ 1,250.25 | ₨ 2,500.50 ₨ 1,250.25 ₨ 1,250.25 | PASS | phone /booking/detail/:id |
| owner web Bookings prints the paisa total | Rs. 2,500.50 | Rs. 2,500.50 Rs. 3,000 Rs. 2,500 Rs. 1,800 Rs. 2,000 Rs. 2,000 Rs. 3,000 Rs. 2,000 Rs. 3,000 Rs. 2,000 | PASS | web /owner/bookings |

### S4 — 20 of 20 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| reschedule cheaper: preview refunds the difference | old 2500, new 2000, refund 500 | old 2500.00, new 2000.00, refund 500.00 | PASS |  |
| reschedule cheaper: the booking moved and shows the new total | 10:00:00, total 2000 | 200 10:00:00, total 2000.00 | PASS |  |
| reschedule cheaper: the owner owes ₨ 500 (pending bank-transfer refund) | 500 pending | 500.00 pending | PASS |  |
| a second reschedule is refused | 4xx | 422 A booking can be rescheduled only once. | PASS |  |
| reschedule dearer: preview shows ₨ 1,000 more due at the arena, no refund | new 3000, balance 1000, refund 0 | new 3000.00, balance 1000.00, refund 0.00 | PASS |  |
| reschedule dearer: player and owner show the same new total and balance | player 3000 / due 1000 = owner 3000 | player 3000.00 / due 1000.00, owner 3000.00 | PASS |  |
| cancel more than 24 h before: 100% refund | preview 100% 2000 = refund 2000 | preview 100% 2000.00, after 2000.00 | PASS |  |
| cancel 6 to 24 h before: 50% refund | 50% of 2000.00 | preview 50% 1000.00, after 1000.00 | PASS |  |
| cancel with a receipt waiting: the full amount is a pending refund | receipt_waiting, refund 2000 | true, 2000.00 pending | PASS |  |
| admin refunds (owner1 arenas) = owner Refunds list | 30 | 30 | PASS | GET /owner/refunds vs GET /admin/refunds |
| owner web Refunds tab badge = pending refunds | Refunds30 | Refunds30 | PASS | web /owner/payments |
| owner sidebar Payments badge = pending refunds | Payments30 | Payments30 | PASS | web /owner (sidebar) |
| phone admin Refunds shows a Mark as paid for every pending bank-transfer refund | 34 | 34 | PASS | phone /admin/payments?tab=refunds |
| owner marks one paid, once only | first new, second already | false, true | PASS |  |
| admin marks another paid, once only | first new, second already | false, true | PASS |  |
| admin cannot pay again what the owner marked paid | already | true | PASS |  |
| owner Refunds badge drops by 2 | Refunds28 | Refunds28 | PASS | web /owner/payments |
| player gets exactly one "refund completed" per refund paid, with "₨" | 2, ₨ amounts | Your refund of ₨ 1,000 has been completed. \| Your refund of ₨ 2,000 has been completed. | PASS |  |
| no raw values in any of the player notices | none | none | PASS |  |
| one cancel notice per cancelled booking (this run) | 3 | 3 | PASS |  |

### S5 — 12 of 12 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| creator posts a match on a confirmed booking | 201 | 201 | PASS |  |
| another player sees it under Open matches (Lahore) | listed | true | PASS | phone /play |
| second player joins; a double tap is refused | 200 then 409 | 200 then 409 | PASS |  |
| leave and join again, then a third joins: full | 200, 200, full | 200, 200, full | PASS |  |
| a fourth player is refused: the match is full | 409 | 409 This match is full. | PASS |  |
| the match shows 3 / 3 players | 3/3 | 3/3 | PASS |  |
| creator: one notice per join (3 joins), one leave, one full | 3, 1, 1 | 3, 1, 1 | PASS |  |
| each joiner: one "full" | 1, 1 | 1, 1 | PASS |  |
| creator cancels: each other player one notice, the creator none | 1, 1, 0 | 1, 1, 0 | PASS |  |
| match notices read Futsal, a Karachi date and a 12-hour time | The Futsal match at Kickoff Arena on Ddd D Mmm at H:MM AM | The Futsal match at Kickoff Arena on Thu 15 Oct at 8:00 AM was cancelled. | PASS |  |
| a match at a suspended arena is hidden from Open matches | listed, then hidden | listed, then hidden | PASS |  |
| the suspension cancelled the booking, and the match with it | match cancelled | cancelled | PASS |  |

### S6 — 11 of 12 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| player posts a review | 201 | 201 | PASS |  |
| player edits it | 200, 5 stars | 200, 5 | PASS |  |
| rating and count agree on the summary and the search card | summary = card | summary 5 (1), card 5 (1) | PASS |  |
| owner web Reviews lists it and the average | Good lights, great staff. + average | true, avg 5.0 | PASS | web /owner/reviews |
| owner sidebar Reviews shows a badge for reviews needing a reply | Reviews1 (or more) | Reviews | **FAIL** | web /owner (sidebar) |
| owner replies | 200 | 200 | PASS |  |
| another player sees the review and the owner reply on the phone | both texts | true, true | PASS | phone /arena/:id/reviews |
| another player reports it; a second report is refused or harmless | 200 then 4xx/200 | 200 then 200 | PASS |  |
| admin web Reviews queue shows the report | review and reason listed | true, true | PASS | web /admin/reviews |
| admin dismisses: the queue clears and the review stays | dismissed, not in queue, still on the arena | 200, cleared | PASS |  |
| player deletes it: count and rating go back everywhere | count 0 | 200, summary 0, card 0 (null) | PASS |  |
| owner web Reviews no longer lists it | gone | gone | PASS | web /owner/reviews |

### S7 — 8 of 8 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| player sends a complaint | 201 | 201 | PASS |  |
| admin gets ONE "New complaint" | 1 "Sana Malik wrote to support." | 1 "Sana Malik wrote to support." | PASS |  |
| admin open-complaints count +1 (phone tab badge) | 1 | 1 | PASS |  |
| admin web Complaints lists it | listed | live | PASS | web /admin/complaints |
| admin replies, then edits the reply | 200, 200 | 200, 200 | PASS |  |
| player sees the edited reply | the edited text | We are sorry. The arena has fixed the lock. | PASS |  |
| player notices: one per reply (2 replies) | 2 (a reply and an edit each tell the player) | 2 | PASS |  |
| another player and an owner cannot read it | 404 and 403 | 404 and 403 | PASS |  |

### S8 — 14 of 14 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| phone admin suspends a player: the saved session stops at once | 401 | 401 Account is not active. | PASS | phone /admin/users/:id |
| the player signing in is told the account is suspended | Your account has been suspended. | Your account has been suspended. | PASS |  |
| phone Log in shows the suspended message | Your account has been suspended. | true | PASS | phone /login |
| a wrong password still says invalid credentials | Invalid email/phone or password. | Invalid email/phone or password. | PASS |  |
| web admin suspends an owner: the saved session stops | 401 | 401 | PASS | web /admin/owners |
| owner web Log in shows the suspended message | Your account has been suspended. | true | PASS | web /login |
| reactivation: both can sign in again | tokens for both | 200/200, true/true | PASS |  |
| delete account is refused while a booking is coming up | 4xx with a plain reason | 409 You still have upcoming or unpaid bookings. Cancel them or wait until they are done, then delete your account. | PASS |  |
| change password with the emailed code: the old one stops, the new one works | 401 old, 200 new | 200/200, old 401, new 200 | PASS |  |
| change email with a code sent to the new address; sign in with it | 200, 200, 200 | 200, 200, 200 | PASS |  |
| the admin sees the new email | s8.player.86438.new@it.pk | s8.player.86438.new@it.pk | PASS |  |
| admin code: a wrong code is refused | 4xx | 422 Invalid or expired verification code. | PASS |  |
| admin code: resend right away is held back (one a minute) | refused or no new code | 200 If a new code can be sent, it is on its way. | PASS |  |
| admin code: an expired code is refused | 4xx | 422 Invalid or expired verification code. | PASS |  |

### S9 — 14 of 15 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| a new court shows for players; switched off it is hidden | listed, then hidden | listed, 200 hidden | PASS |  |
| a switched-off court does not set the "from" price | from 2000 (not 1800) | 2000.00 | PASS |  |
| equipment shows for players with its price | Futsal ball 200 | Futsal ball 200.00,Futsal ball 200.00,Futsal ball 200.00 | PASS |  |
| two balls add ₨ 400 to the total | 2000 + 400 = 2400 | 2000.00 + 400.00 = 2400.00 | PASS |  |
| asking for more balls than the owner has is refused | 4xx | 422 Not enough 'Futsal ball' available. | PASS |  |
| blocked day 2026-10-19: no free slots on Court A and Court B | 0 and 0 | 0 and 0 | PASS |  |
| the 7-day strip says 0 open on the blocked day (Court B, slots made before the block) | 0 open | [{"date":"2026-10-19","open_count":0}] | PASS |  |
| SAVE10 works for its second use, then is used up | 1800, then refused | 200, then refused That code is not valid or has expired. | PASS |  |
| an expired code is refused with a plain message | not applied + message | refused That code is not valid or has expired. | PASS |  |
| owner sees SAVE10 used 2 of 2 | 2/2 | 2/2 | PASS |  |
| leaving checkout gives the use back | 1/2 | 2/2 | **FAIL** |  |
| a deactivated account is hidden from players; the other shows | only HBL | HBL | PASS |  |
| bookings CSV: rows, codes and amount sum = owner Bookings table | 20 rows, 46401.50 | 20 rows, 46401.50, codes match true | PASS |  |
| the PDF opens (starts with %PDF) and the occupancy CSV has a header | %PDF, header | %PDF, Arena,Court,Sellable Slots,Booked,Occupancy %,Busiest Hour | PASS |  |
| owner profile name change shows for the admin | Owner One Khan | 200 Owner One Khan | PASS |  |

### S10 — 15 of 15 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| receipt sent: does the owner get a notice to review it? | 1 notice | Receipt to check | PASS |  |
| approve a 2-hour booking: player gets exactly one notice | Booking confirmed | Booking confirmed | PASS |  |
| approve: owner gets exactly one notice | New booking received | New booking received — You have 2 new confirmed bookings. | PASS |  |
| cancel a 2-hour paid booking: player gets one cancel and one refund notice | Booking cancelled + Refund initiated | Refund initiated + Booking cancelled | PASS |  |
| cancel: owner gets one "refund to send" notice (not one per hour) | 1 notice | A refund is waiting for you — Bilal Ahmed cancelled a booking at Smash Point Padel. Send ₨ 6,000 back by bank transfer, then mark it as paid. | PASS |  |
| owner marks the refund paid: player gets one "refund completed" per refund | 1 | 1: Refund completed — Your refund of ₨ 6,000 has been completed. | PASS |  |
| no raw values in 52 notices (player + owner) | 0 with raw values | 0 | PASS |  |
| phone Home bell shows the same unread count as the server | Notifications, 4 unread | Notifications, 4 unread | PASS | phone / |
| tapping "Booking confirmed" opens that booking | /booking/… | /booking/detail/2e76e7e7-e641-49e1-a837-8ca30d980b5e | PASS | phone /notifications |
| opening a notice marks it read (one fewer unread) | 3 | 3 | PASS |  |
| phone Mark all read: 0 unread on the server and the bell dot goes | 0, "Notifications" | 0, "Notifications" | PASS |  |
| owner web bell shows the same unread count as the server | Notifications, 3 unread | Notifications, 3 unread | PASS | web /owner |
| owner notifications page lists the new notices in words | New booking received | true | PASS | web /owner/notifications |
| owner web Mark all read: server 0 and the bell updates without reload | 0, "Notifications" | 0, "Notifications" | PASS |  |
| owner web bell after a new booking (while open) | live or on refresh | on refresh | PASS | web /owner |

### S11 — 16 of 16 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| another player takes an hour: the open slot list changes | live | live | PASS | phone /court/:id/slots |
| the hour is given back: it shows open again | live | live | PASS | phone /court/:id/slots |
| reload keeps you on /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d | same address, shows "Kickoff Arena" | /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d content ok | PASS | phone /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d |
| reload keeps you on /booking/detail/7818a45e-04e5-420b-a533-6f07ae65f51d | same address, shows "/AHB-/" | /booking/detail/7818a45e-04e5-420b-a533-6f07ae65f51d content ok | PASS | phone /booking/detail/7818a45e-04e5-420b-a533-6f07ae65f51d |
| reload keeps you on /notifications | same address, shows "Notifications" | /notifications content ok | PASS | phone /notifications |
| reload keeps you on /owner/bookings | same address, shows "Bookings" | /owner/bookings content ok | PASS | web /owner/bookings |
| reload keeps you on /owner/payments | same address, shows "Payments" | /owner/payments content ok | PASS | web /owner/payments |
| reload keeps you on /owner/calendar | same address, shows "Court A" | /owner/calendar content ok | PASS | web /owner/calendar |
| reload keeps you on /admin/arenas/all | same address, shows "Kickoff Arena" | /admin/arenas/all content ok | PASS | web /admin/arenas/all |
| reload keeps you on /admin/users | same address, shows "Ayesha Khan" | /admin/users content ok | PASS | web /admin/users |
| web signed out, open /owner/payments: sign in first, then back to Payments | /login… then /owner/payments | /login?next=%2Fowner%2Fpayments then /owner/payments | PASS | web /owner/payments |
| phone signed out, open an arena link: Log in first, then the arena opens | Log in, then Kickoff Arena | Log in at /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d, then /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d shows arena | PASS | phone /arena/:id |
| phone signed out, open /notifications: asked to log in, no data shown | Log in screen or prompt | /notifications log-in prompt | PASS |  |
| web Back and Forward: Bookings ⇄ Payments, content matches the address | /owner/bookings, /owner/payments | /owner/bookings, /owner/payments | PASS | web /owner |
| phone browser Back: reviews → arena | /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d | /arena/c5396df7-bc88-47ea-8bd7-9569d26f1e1d | PASS | phone  |
| same owner, two tabs: approved by API, the other tab shows Confirmed | live or on refresh | listed true/true (AHB-325920 SM Sana Malik +92 300 00•••• Court A Kickoff Arena Tue 20 O), then on refresh | PASS | web /owner/bookings |

### S12 — 25 of 25 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| an expired access token is refused by the API | 401 | 401 Token has expired. | PASS |  |
| phone with an expired token: renews quietly, Bookings opens (no Log in) | Bookings screen | /bookings stays signed in | PASS | phone /bookings |
| owner web with an expired token: renews quietly, Bookings opens | /owner/bookings with rows | /owner/bookings rows shown | PASS | web /owner/bookings |
| a refresh token used twice: refused, and the newer one stops too (stolen-token guard) | 200, 401, 401 | 200, 401, 401 | PASS |  |
| log out on the web: this tab goes to sign in; the server refuses the old tokens | /login, 401, 401 | /login, 401, 401 | PASS | web /owner |
| the other tab: its next step does not show owner data | sign in, or no data | /login?next=%2Fowner%2Fpayments no data | PASS | web /owner/payments |
| API lock: player → owner bookings | 403 | 403 You do not have permission to perform this action | PASS |  |
| API lock: player → admin users | 403 | 403 You do not have permission to perform this action | PASS |  |
| API lock: owner → admin users | 403 | 403 You do not have permission to perform this action | PASS |  |
| API lock: owner → admin payments | 403 | 403 You do not have permission to perform this action | PASS |  |
| API lock: admin → make a booking | 403 | 403 Only players can create bookings. | PASS |  |
| API lock: owner1 → edit owner2 arena | 403 or 404 | 403 You do not own this arena. | PASS |  |
| API lock: owner1 → owner2 arena courts | 403 or 404 | 403 You do not own this arena. | PASS |  |
| API lock: owner1 → owner2 bank accounts | 403 or 404 | 403 You do not own this arena. | PASS |  |
| API lock: owner1 → owner2 discounts | 403 or 404 | 403 You do not own this arena. | PASS |  |
| API lock: owner1 → owner2 bookings by arena filter | 403 or 404 or 200 | 403 You do not own this arena. | PASS |  |
| API lock: owner1 → owner2 court slots | 403 or 404 | 403 You do not own this arena. | PASS |  |
| API lock: no token → my bookings | 401 | 401 Authentication required. | PASS |  |
| owner2's arena is unchanged after owner1's tries | no "hacked" | Floodlit courts, parking and a small cafe. | PASS |  |
| API lock: owner1 → approve a payment at owner2's arena | 403 or 404 (or 4xx) | 403 You do not own this arena. | PASS |  |
| API lock: a player opening another player's booking | 403 or 404 | 404 | PASS |  |
| route lock: owner session opens /admin | /admin/login… | /admin/login | PASS | web /admin |
| route lock: admin session opens /owner/bookings | /login… | /login?next=%2Fowner%2Fbookings | PASS | web /owner/bookings |
| a player signing in on the owner web is turned away | This dashboard is for arena owners… | /login message shown | PASS | web /login |
| a player opening /admin/users on the phone sees no admin data | redirected, no user list | / no admin data | PASS | phone /admin/users |

### S13 — 14 of 15 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| two players book the same hour at once: one wins, one gets a clear 409 | 200/201 and 409 with a plain message | 409 / 200: One of the selected slots is being booked right now. | PASS |  |
| upload a 6 MB image: refused with the limit in words | 4xx "too large (max 5 MB)" | 422 Image is too large (max 5 MB). | PASS |  |
| upload text renamed .png: refused | 4xx with a plain reason | 422 File content does not match the declared image type. | PASS |  |
| upload an empty file: refused | 4xx with a plain reason | 422 File content does not match the declared image type. | PASS |  |
| upload a PDF as a receipt: refused (photos only) with a plain reason | 4xx | 422 Unsupported image type. Use JPEG, PNG, or WebP. | PASS |  |
| slow network, Pay tapped 3 times: one booking only | 2 bookings (was 1) | 2 (POSTs sent: 2) | PASS |  |
| while Pay waits the button is busy (disabled or "Please wait") | disabled | true  | PASS | phone /booking/payment |
| after the slow Pay the bank screen opens | /booking/bank/… | /booking/bank/abf53083-7a8f-44c7-917c-807a574a5fa6?paymentId=4acc7ae8-8667-4c37-ab90-2cea26d05467&arenaId=c819e2e6-0f08-435b-810c-156b995b4830 | PASS | phone /booking/payment |
| web build: a text file picked as the receipt gives a plain message (phone gallery offers photos only) | plain message, no crash | uncaught picker error: Unsupported file type: text/plain. | **FAIL** | phone /booking/bank/:id |
| slow receipt upload: shows it is sending, then waits for approval | busy, then /booking/awaiting/ | busy shown → /booking/awaiting/ab | PASS | phone /booking/bank/:id |
| server down: phone Bookings says so in plain words (no crash, no blank) | Cannot reach the server / Could not load + Try again | stopped: Cannot reach the server. + Try again | PASS | phone /bookings |
| server down: owner web Bookings says so in plain words | an error line + retry | Could not load your bookings. + retry | PASS | web /owner/bookings |
| server back: Try again signs back in without the password; Bookings loads | signed in, booking cards shown | up: landed on / (Home, not Bookings), Bookings cards shown | PASS | phone /bookings |
| server back: owner web loads again | rows | true | PASS | web /owner/bookings |
| no page errors on the phone during the flow | 0 | 0 | PASS | phone  |

### S14 — 19 of 19 pass

| Step | Expected | Actual | Result | Where |
|---|---|---|---|---|
| an arena named in Urdu + emoji + 100 characters is saved and approved | 201/200, name kept exactly | 201/200 name kept | PASS |  |
| phone Arena screen: Urdu/emoji name shown whole, no sideways scroll, no broken image | name, 0 px, 0 broken | name ok, 0 px, 0 broken | PASS | phone /arena/:id |
| an arena with no court says so instead of an empty list | a "no courts" line | No courts | PASS | phone /arena/:id |
| an arena with no reviews shows "New" (not 0.0 stars) | "New", no "0.0" | New  | PASS | phone /arena/:id |
| phone search finds it; the card fits the screen | listed, 0 px sideways | listed, 0 px | PASS | phone /search |
| admin web arena list shows the Urdu/emoji name, no sideways scroll | listed, 0 px | listed, 0 px | PASS | web /admin/arenas/all |
| phone Profile: a 70-character Urdu + emoji name, no sideways scroll | name start shown, 0 px | shown, 0 px | PASS | phone /profile |
| admin web Users: the same name, no sideways scroll | shown, 0 px | shown, 0 px | PASS | web /admin/users |
| phone search with no match says so | a "No … found" line | No arenas found Try a different sport or area, or clear some filters. | PASS | phone /search |
| owner web Reviews with none says so | a "No reviews" line | No reviews yet Recent reviews No reviews yet | PASS | web /owner/reviews |
| admin web Players with 525 players: a page line with the right total | … of 525 or Page 1 of 27 | Showing 1–20 of 525 ‹ 1 2 3 … 27 › | PASS | web /admin/users |
| admin web Users: Next shows the next page (different rows) | different first row | Bulk Player 1 → Bulk Player 21 | PASS | web /admin/users |
| phone admin Users (All): Show more loads the next 50 | 50, then 100 rows | 50 → 100 | PASS | phone /admin/users |
| the last hour of the day ends at 11:59 PM, on the same date (no slot crosses midnight) | 2026-10-16 22:00–23:00 or 23:00–23:59 | 2026-10-16 22:00–23:00 | PASS |  |
| phone slot screen: same days and hours whether the browser is in Karachi or New York | identical | identical | PASS | phone /court/:id/slots |
| owner web Bookings: same dates and times with the browser in Tokyo | identical rows | identical | PASS | web /owner/bookings |
| owner web Schedule: same week and "today" with the browser in Tokyo | identical header | identical | PASS | web /owner/calendar |
| no page errors on the phone during S14 | 0 | 0 | PASS | phone  |
| phone admin Users (Players): "Showing 50 of N" matches the server, Show more loads the next 50 | Showing 50 of 525, then 100 | Showing 50 of 525; 50 → 100; Showing 100 of 525 | PASS | phone /admin/users |

### S15 sweep totals (screens with at least one hit)

| App | Screens | Sideways scroll | Console errors | Failed requests | Text under 14px | Tap under 44px | Did not load |
|---|---|---|---|---|---|---|---|
| phone player | 104 | 0 | 0 | 0 | 68 | 8 | 0 |
| phone signed out | 12 | 0 | 0 | 0 | 4 | 12 | 0 |
| phone admin | 48 | 0 | 0 | 0 | 24 | 0 | 0 |
| web owner light | 52 | 0 | 0 | 0 | 42 | 32 | 0 |
| web admin light | 44 | 0 | 0 | 0 | 40 | 32 | 0 |
| web admin dark | 44 | 0 | 0 | 0 | 44 | 32 | 0 |
| web signed out light | 16 | 0 | 0 | 0 | 16 | 13 | 0 |
| web owner dark | 52 | 0 | 0 | 1 | 52 | 40 | 0 |

