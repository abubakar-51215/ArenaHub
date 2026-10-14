# Mobile screen inventory

Every screen, sheet, dialog and toast of the mobile app (`frontend/mobile`). This is the list used to declare the mobile UI complete.
Frame files are in `design/prototypes/`: **auth** = `arena-hub-player-app-auth.html` + `-auth-2.html`, **home** = `-home-search.html`,
**slots** = `-arena-slots.html`, **pay** = `-booking-payment.html`, **bookings** = `-bookings.html`, **account** = `-account.html`,
**play** = `-play.html`, **states** = `-states.html`, **admin** = `-admin-app.html`.
"States" means loading / empty / error where the screen has data to wait for (Y = all that apply exist, n/a = nothing to load).
"Checked" is the last web check at 360, 375, 390 and 430 (numbers) or the last test of the flow; see the end of the file for the sweep.
**Never built from a frame:** none. **Built without a frame:** marked "no frame" below.

## Screens

| Route | Frame (name) | States | Built | Checked |
|---|---|---|---|---|
| `(auth)/login` | auth-2 (Log in; unreachable note is no frame) | n/a (inline errors) | yes | 2026-10-12 |
| `(auth)/register` | auth (Create account) | n/a | yes | 2026-10-12 |
| `(auth)/verify-otp` | auth (Verify) | n/a | yes | 2026-10-11 |
| `(auth)/forgot-password` | auth (Forgot) | n/a | yes | 2026-10-12 |
| `(auth)/reset-password` | auth (Code, New password, Done) | n/a | yes | 2026-10-11 |
| `(auth)/admin-code` | **no frame** (admin sign-in code) | n/a | yes | 2026-10-11 |
| `(tabs)/index` Home | home (Home) | Y (each section on its own) | yes | 2026-10-12 |
| `(tabs)/search` | home (Search) | n/a | yes | 2026-10-12 |
| `(tabs)/results` | home (Results) + play (Results with distance, Location denied, unavailable) | Y | yes | 2026-10-12 |
| `filters` | home (Filters) + play (Filters near me) | n/a | yes | 2026-10-12 |
| `arena/[id]` | slots (Arena) | Y | yes | 2026-10-12 |
| `arena/[id]/reviews` | account (Reviews, Write review, Report, My review menu) | Y | yes | 2026-10-12 |
| `court/[id]/slots` | slots (Choose a time) | Y | yes | 2026-10-12 |
| `booking/[courtId]` Review booking | pay (Review booking) | Y | yes | 2026-10-11 |
| `booking/payment` | pay (Payment, Leave payment) | Y | yes | 2026-10-11 |
| `booking/bank/[groupId]` | pay (Bank transfer) + states (Upload progress, stopped, failed, too big) | Y | yes | 2026-10-12 (upload states tested) |
| `booking/awaiting/[groupId]` | pay (Awaiting approval) | Y | yes | 2026-10-11 |
| `booking/confirmed/[groupId]` | pay (Confirmed) | Y | yes | 2026-10-11 |
| `booking/failed/[groupId]` | pay (Payment failed / rejected) | n/a | yes | 2026-10-11 |
| `booking/slot-lost` | pay (Slot lost) | n/a | yes | 2026-10-11 |
| `(tabs)/bookings` | bookings (Upcoming, Past, Cancelled, Empty, Loading, Could not load) | Y | yes | 2026-10-12 |
| `booking/detail/[groupId]` | bookings (Booking detail, every state) | Y | yes | 2026-10-12 |
| `booking/move/[groupId]` | bookings (Reschedule) | Y | yes | 2026-10-12 |
| `profile/report` | bookings (History report) | Y | yes | 2026-10-12 |
| `notifications` | account (Notifications, Empty, Loading, Error) | Y | yes | 2026-10-12 |
| `(tabs)/profile` | account (Profile) | Y (numbers show a placeholder while loading) | yes | 2026-10-12 |
| `profile/edit` Personal information | account (Personal information) | n/a | yes | 2026-10-12 |
| `profile/change-email` | account (Change email; the code step is no frame) | n/a | yes | 2026-10-12 |
| `profile/change-phone` | **no frame** (same two steps as Change email) | n/a | yes | 2026-10-12 |
| `profile/change-password` | account (Change password; the code step is no frame) | n/a | yes | 2026-10-12 |
| `profile/settings` | account (Settings, Delete account) | n/a | yes | 2026-10-12 |
| `profile/liked` Saved arenas | account (Saved arenas, Saved empty) | Y | yes | 2026-10-12 |
| `profile/payments` Payment history | account (Payment history) | Y | yes | 2026-10-12 |
| `profile/reviews` My reviews | account (My reviews) | Y | yes | 2026-10-12 |
| `support/index` Help and support | account (Help and support, Help empty) without Contact us | Y | yes | 2026-10-12 |
| `support/new` | account (New complaint) | n/a | yes | 2026-10-12 |
| `support/[id]` | account (Complaint detail, Complaint waiting) | Y | yes | 2026-10-12 |
| `support/faq` | account (FAQ answer) | n/a | yes | 2026-10-12 |
| `(tabs)/play` | play (Matchmaking, My matches, Matches empty, loading, error) | Y | yes | 2026-10-12 |
| `play/create` | play (Post a match, Post match no bookings) | Y | yes | 2026-10-12 |
| `play/[matchId]` | play (Match open, joined, mine, full, cancelled) | Y | yes | 2026-10-12 |
| `admin/(tabs)/index` Overview | admin (Overview, loading, all clear, error) | Y | yes | 2026-10-13 |
| `admin/(tabs)/approvals` | admin (Approvals list, empty, loading, error) | Y | yes | 2026-10-13 |
| `admin/approvals/[id]` | admin (Approval detail, Approve sheet, Reject sheet, empty reason) | Y | yes | 2026-10-13 |
| `admin/(tabs)/complaints` | admin (Complaints list, empty, loading) | Y | yes | 2026-10-13 |
| `admin/complaints/[id]` | admin (Complaint detail, reply typed, replied, leave sheet) | Y | yes | 2026-10-13 |
| `admin/(tabs)/more` | admin (More, Log out sheet) | n/a | yes | 2026-10-13 |
| `admin/arenas` | admin (Arenas list, suspended, empty) | Y | yes | 2026-10-13 |
| `admin/arenas/[id]` | admin (Arena detail live and suspended, Suspend sheet, Reactivate sheet) | Y | yes | 2026-10-13 |
| `admin/users` | admin (Users list, empty) | Y | yes | 2026-10-13 |
| `admin/users/[id]` | admin (User detail, Suspend user sheet, suspended, Reactivate sheet) | Y | yes | 2026-10-13 |
| `admin/payments` | admin (Payments list, Refunds waiting, empty, error) | Y | yes | 2026-10-13 |
| `admin/notifications` | admin (Admin notifications) | Y | yes | 2026-10-13 |
| `(auth)/index` | **no frame** (signed out, "/" is Log in itself; fixes the address after an expired sign-in) | n/a | yes | 2026-10-13 |
| `health` | **no frame**, development only (redirects to Home in a release build) | n/a | yes | n/a |
| Error page (`ErrorBoundary` in `_layout`) | **no frame** | n/a | yes | 2026-10-11 |
| Splash and loader (`components/brand`) | brand frames (`design/brand/arenahub-logo.html`) | n/a | yes | 2026-10-11 |

**Frames never built:** the frame "Terms and privacy" (account) and the "Contact us" block of "Help and support": deferred to the very
end by decision (`docs/BEFORE_GOING_LIVE.md`). The Equipment rental frame (first prototype) was dropped by decision.

## Sheets and dialogs (bottom sheets and pop-ups)

| Sheet | Component | Frame | Where |
|---|---|---|---|
| Cancel booking (with figures) | `ConfirmSheet` | bookings (Cancel sheet) | Booking detail |
| Leave payment | `ConfirmSheet` | pay (Leave payment) | Payment, Bank transfer |
| Log out | `ConfirmSheet` | account (Logout) | Profile |
| Delete account (and the plain refusal text) | `ConfirmSheet` | account (Delete account) | Settings |
| Delete review | `ConfirmSheet` | account (Delete review) | Reviews, My reviews |
| Leave match / Cancel match | `ConfirmSheet` | play (Leave match, Cancel match) | Match detail |
| Stop uploading? | `ConfirmSheet` | states (Upload cancel sheet) | Bank transfer |
| Write / edit review | `BottomSheet` | account (Write review) | Reviews |
| My review menu (Edit / Delete) | `BottomSheet` | account (My review menu) | Reviews, My reviews |
| Report this review | `BottomSheet` | account (Report review) | Reviews |
| Find arenas near you | `BottomSheet` | play (Near me prompt) | Home |
| Approve arena / Reactivate arena / Reactivate user | `ConfirmSheet` (plain, "Not yet") | admin (Approve sheet, Reactivate sheet, Reactivate user sheet) | Approval detail, Arena detail, User detail |
| Reject arena / Suspend arena / Suspend user (reason, n / 500, red, "Stay") | `ReasonSheet` | admin (Reject sheet, Suspend sheet, Suspend user sheet and the empty-reason frames) | Approval detail, Arena detail, User detail |
| Leave without sending? | `ConfirmSheet` | admin (Complaint leave sheet) | Complaint detail |
| Mark this refund as paid? | `ConfirmSheet` | admin (Mark paid sheet) | Payments and refunds |
| Log out? (admin) | `ConfirmSheet` | admin (Log out sheet) | More |

## Banners and toasts

| What | Component | Frame |
|---|---|---|
| Offline / Back online banner | `NetworkShell` | states (Offline banner, Back online) |
| Amber toast "Someone already handled this arena." (`showToast(..., 'warn')`) | `ToastHost` | admin (Already handled) |
| "Cannot reach the server" note on Log in | `login.tsx` | no frame |
| Location off / unavailable banner | `results.tsx` | play (Location denied, unavailable) |
| Toasts (`showToast`): Saved, Email changed, Phone number changed, New code sent, Complaint sent, Review posted / updated / deleted, Thanks (report), Match posted / cancelled, You joined / left the match, Sorry that match just filled up, Booking moved, Booking cancelled, Account number copied, `<arena> approved.`, `<arena> rejected.`, `<arena> suspended.`, `<arena> is live again.`, `<user> suspended.`, `<user> is active again.`, Reply sent. The player has been told., Marked as paid. The player has been told. (and "Already marked as paid."), offline "No connection. Your change was not saved." and the plain "Could not ... Please try again." lines | `ToastHost` | account, play, states |

## Dead code
Removed in G6: the old profile screens, `arena-card`, `match-card`, `external-link`, `hello-wave`, `parallax-scroll-view`, `haptic-tab`,
`collapsible`, `lib/dates`, the template `modal` screen. Kept on purpose: `themed-text` and `themed-view` (used by the development-only
health screen), `static-map` (not used by any screen yet).

## Changed in the small-fixes round (2026-10-13)
* Log in says "Your account has been suspended." for a suspended account after the right password (all three clients show the server message).
* `TapBox` gives a real 44 px tap box to: Back (every screen, drawn 30 px), the Home bell and Detect my location, See all, Try again,
  Clear all and Clear recent searches links, the sort chips on Results, the Segmented tabs (Play and every admin list), the settings
  switches, the password eye, the clear-search cross and the Arena hero Back and heart. No screen moved (pixel diff of 18 player
  screens against the version before: only live-data and font-timing differences).
* Admin Payments list shows the booking code (AHB-xxxxxx) first, then the player and the method.
* Lines such as "Arena · Court · Time" skip empty parts (`lib/text.ts` `dotJoin`; web `joinParts`).
* Web admin reason boxes (reject, suspend arena, suspend user) stop at 500 characters and show "n / 500"; the minimum is 1.

## Changed in the integration-test follow-up (2026-10-14)

* Text size: information text (tags, chips, prices, badges, slot times and prices, the photo count, the map credit, the idle
  field label) is 14px; decorative micro labels (uppercase eyebrows, tab labels, weekday letters, the password bullet, avatar
  initials) are 12px. The area line on narrow venue cards may wrap to two lines; the admin tab bar fits its 12px labels; text
  fields fill their boxes (44px tap); the search box is 46 tall. Rule: `docs/MOBILE_QA_GATE.md`.
* `admin/(tabs)/approvals`, `admin/(tabs)/complaints`, `admin/arenas`, `admin/payments` (both tabs) and `admin/notifications`:
  50 rows at a time with "Showing 50 of N" and **Show more** (`hooks/useAdminPages.ts`, `ShowMore` in `components/admin/kit.tsx`),
  like `admin/users`.
* `booking/bank/[groupId]` and `profile/edit`: the photo picker is `lib/pick-photo.ts`. On the web build a non-photo file gets
  "That file is not a photo we can use. Use a JPG or PNG up to 5 MB." instead of a stuck picker (phones use expo-image-picker).
* Start-up "Try again" (Log in, when the server could not be reached): when it works, the screen that was open comes back
  (player screens for a player, admin screens for an admin) instead of Home.
* Refund notices name the booking: "... for your booking on Tue 13 Oct at 7:00 PM".

## Added and changed in the Google, smart search and assistant round (2026-10-14)

Frames: `design/prototypes/arena-hub-player-app-google.html` (G), `arena-hub-player-app-smart.html` (S) and
`arena-hub-player-app-auth-2-fixed.html` (A2F, replaces `arena-hub-player-app-auth-2.html`).

| Screen or state | Route / file | Frame |
|---|---|---|
| Every icon field 48px with a 20px icon, no idle state (Log in, Create account, Forgot password, new password, Search) | `components/ui/field.tsx`, `components/search/search-bar.tsx`; checked by `scripts/field-check.mjs` | A2F 1 to 4, G 1 |
| Log in with "or" and **Continue with Google**; Google loading; not available (toast); failed (toast); suspended and must-use-password (red box); offline "Google needs a connection" | `app/(auth)/login.tsx`, `components/auth/google-button.tsx`, `lib/google-sign-in.ts` | G 1, 2, 8 to 12 |
| Create account with **Sign up with Google** and "or sign up with email" | `app/(auth)/register.tsx` | G 3 |
| One more step (empty, filled, number used, loading); "Use a different account" signs out | `app/one-more-step.tsx` (root layout guard `needsPhone`) | G 4 to 7 |
| Code screen with "Wrong email? Use a different email"; button "Confirm" | `app/(auth)/verify-otp.tsx` | G 13 |
| Create account, back to the form: "Change your email, then continue. We will send a new code.", details kept, Continue | `app/(auth)/register.tsx` | G 14 |
| Search: "We understood:" chips with x, slot words on rows ("3 slots tonight") | `app/(tabs)/results.tsx`, `hooks/useResults.ts`, `components/venue.tsx` | S 1, 2 |
| Search, nothing matches: Remove price / Remove time where they apply | `app/(tabs)/results.tsx` (`NothingMatches`) | S 3 |
| Search, not understood: "Showing arenas that match ..." | `app/(tabs)/results.tsx` | S 4 |
| Help and support: "Ask the ArenaHub assistant" card at the top | `app/support/index.tsx` | S 5 |
| Assistant: start, answer with action, typing (10 s), not sure, offline, could not answer (Try again), refund answer | `app/support/assistant.tsx`, `services/assistant.ts` | S 6 to 12 |
| Play opens on My matches from the assistant (`?tab=mine`) | `app/(tabs)/play.tsx` | (no new frame; the existing tab) |

Not built because no frame shows it: a message telling a person that Google confirmed an earlier unconfirmed sign-up
and removed its password (the server says it in its answer; the phone shows nothing extra).
