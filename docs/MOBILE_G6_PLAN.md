# G6 plan: the remaining player screens

Status: PLAN ONLY. Nothing is built. Text only.
Rule kept: a pop-up, sheet or screen that is not in a prototype file needs a frame first.

Not verified in this plan: I read the prototype files and the backend route lists; I did not run any of the old screens, and I did not test whether every backend route behaves as its name says (for example saving notification preferences). Where a frame is "old" it comes from the first prototype (`arena-hub-player-app.html`), which was drawn before the 14px / 44px rules and before the later groups; it will need the same corrections the other frames got.

## 0. Where things stand

Frames that exist today (by file): `arena-hub-player-app.html` (the first, full set: Matchmaking, Equipment rental, Notifications, Profile, Reviews and ratings are still only here), `-auth.html`, `-auth-2.html`, `-home-search.html`, `-arena-slots.html`, `-booking-payment.html`, `-bookings.html` (the last five were redrawn and built in G1 to G5).

The old mobile screens for G6 exist as code but are in the old style: `app/(tabs)/profile.tsx`, `app/profile/{edit,liked,payments,settings,change-password}.tsx`, `app/notifications.tsx`, `app/arena/[id]/reviews.tsx`, `app/(tabs)/play.tsx`, `app/play/{create,[matchId]}.tsx`. Support and complaints have no mobile screen at all.

## 1. Notifications

- **Frame:** exists, old: `arena-hub-player-app.html`, frame "Notifications" (Mark all read; groups Today, Yesterday, Earlier; rows with a coloured icon, title, one line and a time; an unread dot). Missing: empty, loading, error.
- **Backend has:** `GET /notifications` (mine), `PATCH /notifications/{id}/read`, `POST /notifications/read-all`, push device register and unregister. Each notice has an event name and a category (booking, reminder, payment, account).
- **Events that exist today:** booking confirmed, booking cancelled, payment failed, reminders (24 h and 1 h), refund started, refund done, refund needs manual help, payment reminder, balance paid, and the account and arena suspension notices.
- **Backend missing:** the frame shows notices that have no event: "Your match filled up", "Rate your last game" and "20% off morning slots" (a promotion; there are no promotions). Nothing else is needed for the list itself.
- **Questions for you:**
  1. Drop the promotion notice from the frame? **Yes**. Keep "Rate your last game" and "match filled up" only if you want those two events added (small backend; recommended for "Rate your last game" after a game ends, later for matches).
  2. Tapping a notice opens the thing it is about (a booking, a match, the reviews screen for "Rate your last game")? **Yes**, using the booking or match id in the notice.
  3. Delete or swipe away a notice? **No**, not now.

## 2. Profile hub, personal details, settings, log out, saved arenas, payment history

- **Frames:** only the hub exists, old: "Profile" in `arena-hub-player-app.html` (avatar with initials, name and email, a settings icon, three numbers "Games played / Your rating / Spent", rows Personal information, Payment methods, Saved arenas, My reviews, Notifications, Help and support, Terms and privacy, Log out). **Missing frames:** Personal information (edit name, photo, phone, email), Change password, Settings (notification switches, delete account), Saved arenas list, Payment history, Terms and privacy.
- **Backend has:** `GET /users/me`, `PUT /users/me` (name, profile picture), phone, email and password change by emailed code, `DELETE /users/me` (soft delete), notification preferences stored on the user, liked arenas (`GET /arenas/liked`, like and unlike), `GET /payments/my` (payment history), the receipt PDF, log out. The Booking History report row is already under Profile (G5).
- **Backend missing:** the three numbers. "Games played" and "Spent" can be counted on the phone from the grouped bookings list. "Your rating" (a rating of the player) does not exist. "Payment methods" (saved cards) does not exist and cannot until a real card gateway exists. "My reviews" has no list route (reviews can only be listed per arena). "Terms and privacy" has no text.
- **Questions for you:**
  1. Drop "Your rating" and "Payment methods" from the hub? **Yes.** Show "Games played" and "Spent" only (counted from bookings).
  2. Rename the row "Payment methods" to "Payment history" (what exists today)? **Yes.** It also shows refunds, because refunds are on the same payment.
  3. Add a small route for "My reviews" (list the player's own reviews with edit and delete)? **Yes**, a one-page route; or drop the row. Say if you prefer to drop it.
  4. Terms and privacy: do you have the wording, or should the row open a web page? **Recommended:** a web page address you give me; until then the row is hidden.
  5. Photo upload for the avatar: keep (the upload route accepts avatars)? **Yes.**
  6. Delete account: keep it in Settings, behind a red sheet like Leave payment? **Yes.**

## 3. Reviews (write and see)

- **Frame:** exists, old: "Reviews and ratings" in `arena-hub-player-app.html` (arena header, big average, five-bar breakdown, tag chips "Turf 84, Lights 61, Staff 44, Parking 29", review cards with name, stars, date and text). **Missing:** the write-a-review sheet or screen (stars, text, submit, success), edit and delete, "Report review", empty, loading, error, "already reviewed".
- **Backend has:** list an arena's reviews, rating summary, submit (one per completed booking), edit, delete, report, owner reply shown on the review. Rate this game on My bookings already opens this screen with the booking.
- **Backend missing:** the tag chips (Turf, Lights, Staff, Parking) have no data. A list of my own reviews (see Profile question 3).
- **Questions for you:**
  1. Drop the tag chips? **Yes**, unless you want tags chosen when writing a review (then it is new backend and a frame).
  2. Write the review in a bottom sheet over the reviews screen (stars, text, "Post review")? **Yes**, needs a frame.
  3. Show the owner reply under a review? **Yes**, it already exists in the data.
  4. Let a player edit within a time limit, or any time? **Recommended:** any time, delete allowed.

## 4. Help and support, complaints

- **Frame:** missing completely (the Profile frame only has a "Help and support" row).
- **Backend has:** `POST /complaints` (category: booking issue, payment issue, arena quality, owner behaviour, technical problem, other; description up to 2000 characters) and `GET /complaints/my` (with status open, under review, resolved and the admin reply). The admin web screen for answering exists.
- **Backend missing:** a link from a complaint to a booking (the data has no booking field); FAQ and contact details (no content anywhere); a "new reply" notice to the player (check: no notice event exists for it).
- **Questions for you:**
  1. Scope: a list of my complaints, a "New complaint" form (category and text) and a detail with the admin reply? **Yes**, nothing more.
  2. Attach a booking to a complaint? **Later**; needs a small backend field.
  3. FAQ and contact: do you have text, a phone number and an email? **Recommended:** a short fixed text you give me; no search.
  4. Tell the player when the admin replies (a notice)? **Yes**, one new notice event, small.

## 5. Matchmaking (Play tab)

- **Frames:** exists, old, list only: "Matchmaking" (Play title, a "Short a player?" card with "Post a match", tabs Open matches and My matches, match cards with sport, arena and time, "6 / 10 players" and "Rs 240 each"). **Missing:** Post a match (form), Match detail (players, join and leave), joined, full, cancelled, empty, loading, error.
- **Backend has:** create, list open, mine (created and joined), detail with participants, join, leave (the creator leaving cancels it), cancel by the creator.
- **Backend missing:** "Rs 240 each" and "You only pay your share": a match has no price and no payment; joining takes no money. A match is not tied to a booking (only to an arena, court and time), so nothing stops two matches on the same court and time, or a match on a court that nobody booked. No radius or "near you" filter. No notice when someone joins (check).
- **Questions for you:**
  1. Is a match always on a court the creator has booked? **Recommended:** yes; the form picks one of my upcoming bookings, so the time is certain.
  2. Price per player: show an estimate (court price divided by max players) as text only, with no payment in the app? **Recommended:** yes, text only; players settle between themselves.
  3. "Players near you": use the city only until the near-me work (section 6) is done? **Yes.**
  4. Notify the creator when someone joins or leaves, and everyone when it is cancelled? **Yes.**

## 6. The near-me prompt

- **Frame:** missing. Home already has "detect my location" (city only, G2). Backlog item 42 (distance on cards and a radius search) still waits for a frame.
- **Backend has:** each arena has latitude and longitude. The arena search takes city, sport, price and sort.
- **Backend missing:** a distance or radius filter, and the distance on a result. Both are small (a calculation on the arena's coordinates).
- **Questions for you:**
  1. What is the prompt: a pop-up asking for permission before the system one, a banner on Home, or a row in Filters? **Recommended:** one pop-up the first time (explains why, "Use my location" and "Not now"), and the existing detect button after that.
  2. Show "2.4 km" on cards and a "Near me" sort? **Yes**, once the prompt exists.
  3. Radius choices (1, 3, 5, 10 km)? **Recommended:** yes, in Filters.
  4. What if the player says no? **Recommended:** stay on the saved city, no repeat prompt for 30 days.

## 7. Also still without a screen

- **Equipment rental:** a frame exists (old, "Equipment rental": chips, items with a price and "per booking", a cart). Extras are already chosen as chips on Review booking (G4), so this full screen is probably not needed. **Question:** drop the screen? **Recommended: yes**, keep the chips.

## 8. Frames I need from you, in the order I suggest building

Small groups first. Each line is a frame (or set) not yet in any prototype file.

1. **Notifications:** redraw to the current rules (14px, 44px) and add empty, loading, error. *(Frame exists, old.)*
2. **Profile group:** redraw the hub; add Personal information, Settings (with delete account sheet), Saved arenas, Payment history, and Terms and privacy (or its web link).
3. **Reviews:** redraw the list; add the write-a-review sheet, edit and delete, report, and the empty, loading and error states.
4. **Help and support:** the whole group (list of my complaints, new complaint, complaint detail, empty and error, FAQ and contact if wanted).
5. **Near-me prompt:** the pop-up, the denied state, "Near me" in Filters and the distance on cards.
6. **Matchmaking:** redraw the list; add Post a match, Match detail, joined, full, cancelled, empty, loading, error.

## 9. Backend work this plan implies (small, after your answers)

- `GET /reviews/my` (or drop "My reviews").
- Complaint notice to the player when the admin replies; match notices (join, leave, cancel).
- Distance filter and distance on search results (after the prompt frame).
- A price estimate for a match (text only, no payment) and a booking link on a match (if question 1 of section 5 is yes).

---

# Answers recorded (2026-10-11) and the build

Frames now in `design/prototypes/`: `arena-hub-player-app-account.html` (33 screens) and `arena-hub-player-app-play.html` (22 screens), drawn at 300 px width: text that wraps there may not wrap at 360 and wider; the checks are at 360, 375, 390 and 430.

## Decisions
**Notifications.** Drop the promotion notice. Add "Rate your last game", sent once per booking after a game ends (small scheduled job). Tapping a notice opens what it is about (booking, match, or the reviews screen with the booking). No delete, no swipe.

**Profile.** Drop "Your rating" and "Payment methods". Show Games played and Spent (counted from bookings). Row "Payment history" (payments and refunds from `/payments/my`). Add `GET /reviews/my` with edit and delete for My reviews. Avatar photo upload stays. Delete account stays in Settings behind a red sheet; the server refuses it while the player has upcoming or unpaid bookings, with a plain message. Terms and privacy are in-app screens with the draft text of the frame (Terms and Privacy tabs); final wording later; the text lives in one constants file.

**Reviews.** Drop tag chips. Write a review in a bottom sheet (stars required, text up to 500, "Post review"). Edit any time, delete allowed, owner reply shown, report review with the three reasons in the frame.

**Help and support.** List of my complaints, New complaint (category chips, text up to 2000), complaint detail with the admin reply, empty and error states, FAQ with 3 questions, contact block (email and hours in ONE constants file; the email in the frame is a sample and is a **placeholder**: no real address was invented). The player gets a notice when the admin replies. Attaching a booking to a complaint: later.

**Matchmaking.** A match is on one of the creator's own upcoming CONFIRMED bookings; one open match per booking. The price line is text only, "about ₨ X each" = booking total divided by total players, worked out on the phone; no payment happens in the app (said on the form and the detail). Players near you use the saved city until near-me exists. Notify the creator on join and leave, everyone when it is cancelled, everyone when it fills up. Matches at suspended arenas are not listable. Joining a full, cancelled, own or past match fails with a clear 409 (toast for full: "Sorry, that match just filled up."). Joining twice does not double.

**Near me.** One pop-up the first time ("Use my location", "Not now"); on Not now or denied, stay on the saved city and do not ask again for 30 days; afterwards the detect button works. Distance on cards and results, a "Near me" sort, radius chips (1, 3, 5, 10 km, Any) in Filters. The player's coordinates are never stored on the server; they are sent only as search parameters. Location has a 6 s timeout and never blocks a screen.

**Equipment rental.** Dropped (the chips on Review booking stay).

**Store identity.** `pk.arenahub.app` for `ios.bundleIdentifier` and `android.package`, `buildNumber` 1, `versionCode` 1.

## Build order
Step 1 backend (tests first). Step 2 screens: 1 Notifications, 2 Profile group, 3 Reviews, 4 Help and support, 5 Near me, 6 Matchmaking. Step 3 audit medium items (Karachi time, review date format, failure image, push token re-send, deep link while signed out, tab label size). Step 4 checks.
