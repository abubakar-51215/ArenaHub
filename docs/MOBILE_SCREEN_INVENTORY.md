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
