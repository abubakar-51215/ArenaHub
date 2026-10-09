# Mobile requirements (compiled list)

One list of what has been asked for the mobile app (`frontend/mobile`), so nothing lives only in chat.
Each line says what is required, where it came from, and where it stands.

**Where "Source" points:** a file in `docs/` or `design/`, or **"earlier prompt"** (an instruction the user gave in a chat
session, as it was written into that session's reports). Nothing here is new: a line that could not be traced to the
user is under **Unconfirmed** at the bottom.

**Status words:** **Done**, **Partly** (some of it is built), **Not started**, **Conflicts** (clashes with something, named).

*Compiled 2026-10-10 from: `MOBILE_QA_GATE.md`, `FEATURE_GAP_REPORT.md`, `ARENA-HUB-FINAL-SCOPE-LOCK.md`,
`RESTYLE_FOLLOWUPS.md`, `RESTYLE_LOG.md`, `design/mobile-spec.md`, the prototype files, and the user's prompts in the
current working session.*

---

## 1. Standing rules for the whole app

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Mobile is the main app: every screen, pop-up, sheet, toast, press, loading, success and error looks and feels professional and matches the theme. | earlier prompt; `MOBILE_QA_GATE.md` "Mobile standing rules" a) | Partly (auth screens G1; the rest waits for its group) |
| 2 | Do not invent a screen or pop-up that is not in `arena-hub-player-app.html`, `arena-hub-player-app-auth.html` or a file added to `design/prototypes/`. A missing frame is listed and waits for a prototype. | earlier prompt; standing rules b) | Done as a rule |
| 3 | Mobile must match `arena-hub-player-app.html` exactly (values come from `design/mobile-spec.md`; a value that differs is a bug). | `RESTYLE_LOG.md` "governing rule"; `design/mobile-spec.md` | Partly (G0 primitives, tab bar, Verify, Register done) |
| 4 | Light theme only. | `design/mobile-spec.md`; earlier prompt | Done |
| 5 | Press dips to 97.5% in about 160 ms; loading shows a spinner and keeps the button width; success shows a short tick; errors shake once. | earlier prompt; standing rules c) | Not started (`Button` dips to 99% with opacity 0.9; `ConfirmTick` is static) |
| 6 | Pop-ups and sheets dim and blur the back and rise in about 340 ms (close about 200 ms). Destructive buttons are red and always have a plain Stay or Cancel. | earlier prompt; standing rules c) | Not started (no shared sheet) |
| 7 | Toasts drop from the top, stay about 3 seconds and slide away. | earlier prompt; standing rules c) | Not started (no shared toast) |
| 8 | Light haptic on primary taps, a stronger one on success and error (expo-haptics is installed, 15.0.8; used only by the tab bar today). | earlier prompt; standing rules c) | Not started |
| 9 | Everything respects "reduce motion" (instant). Screen changes use the native stack transition. | earlier prompt; standing rules c) | Partly (the Field animation does; nothing else animates yet) |
| 10 | No new animation library unless already installed (`react-native-reanimated` 4.1.7 is). | earlier prompt; standing rules c) | Done as a rule |
| 11 | Mail and lock fields are huge while idle and shrink to a normal field on focus or text (300 ms), on every screen that has one: Log in, Register, Forgot password, Reset password, Change password, Change email, and later ones. One shared `Field` behaviour. | earlier prompt; standing rules d); `arena-hub-player-app-auth-2.html` | Partly (shared `Field` built; applied to Register only) |
| 12 | Phone targets are 44px; text is 14px on phones except labels, badges and chart text. | earlier prompt (web rule, asked to be listed here for mobile); `MOBILE_QA_GATE.md` | Partly (auth screens: 44px boxes, fields and links; the old screens are unchecked) |
| 13 | A new screen is built from the same components and tokens as the rest; a screen the prototype does not draw is marked "proposed, not in the prototype". | earlier prompt; `RESTYLE_FOLLOWUPS.md` sign-in follow-ups | Partly (see Unconfirmed 1) |

## 2. How every commit is checked

| # | Requirement | Source | Status |
|---|---|---|---|
| 14 | Light gate for each commit: `tsc` and lint clean, the web bundle builds, a numeric pixel diff against the before image, all four phone widths (360x640, 375x667, 390x844, 430x932), no console errors or failed requests, an accessibility spot check, before and after images. | `MOBILE_QA_GATE.md` | In use |
| 15 | Full gate at the end of every group G1 to G8: route inventory and `Stack.Screen` audit, the interaction smoke flow, the route x viewport table (with the keyboard open where a screen has an input), real-content typing tests, a whole-app pixel diff of every baseline, reduced-motion check, file-count check. | `MOBILE_QA_GATE.md` | Not started (waits for the end of G1) |
| 16 | A real-device or emulator pass before the restyle counts as done: native keyboard behaviour, TalkBack or VoiceOver on screens with custom roles, the OS reduce-motion setting. Web checks do not count as this. | `MOBILE_QA_GATE.md` "Native-checklist caveat" | Not started |
| 17 | Pixel diffs compare against a same-time capture of HEAD, not an old baseline folder, for screens that read live data. | `MOBILE_QA_GATE.md` | In use |
| 18 | Verification worktrees install their own dependencies, and are removed only with `git worktree remove` (if that fails: stop and report). No junctions or symlinks into the real tree. | `MOBILE_QA_GATE.md` "Verification safety" | In use |
| 19 | Backend work only for what the screens need. | earlier prompt | In use |

## 3. Sign-in and account screens (group G1)

| # | Requirement | Source | Status |
|---|---|---|---|
| 20 | Log in field says "Email or phone" and is sent to `POST /auth/login` as `identifier`. | earlier prompt; `MOBILE_QA_GATE.md` | Partly (backend and web done; the mobile screen and `login()` still send `email`) |
| 21 | Google and Apple buttons are left out; plain copy instead of "328 arenas". | earlier prompt; `RESTYLE_FOLLOWUPS.md` | Partly (Register done; Log in not yet) |
| 22 | Sign up: build the one Sign up frame that exists; note "Sign-up variant choice unconfirmed". | earlier prompt; `MOBILE_QA_GATE.md` | Done |
| 23 | Verify code (registration): six 44px code boxes (paste, auto-advance, backspace goes back), 60 second resend countdown. | earlier prompt | Done |
| 24 | Register: live password rule list (8 characters, uppercase, number, special character). | earlier prompt | Done |
| 25 | Forgot password and Reset password (six code boxes, new password with live rules, success step, failed / expired states). The 11 frames of `arena-hub-player-app-auth-2.html` are now the prototype for these; the web `/reset-password` flow is compared with them first, and a difference is reported, not "fixed" in the frames. | earlier prompt | Not started (waits for the user's go) |
| 26 | Admin accounts can sign in on the phone with the emailed code (`POST /auth/admin/verify-code`, `/auth/admin/resend-code`). The challenge token stays in memory only, never in SecureStore. | earlier prompt; `MOBILE_QA_GATE.md` "Mobile blockers" | Not started |
| 27 | After admin sign-in the app shows a placeholder screen titled "Admin" with a Log out button, marked "temporary until the admin group". | earlier prompt | Not started |
| 28 | Admin in the app later: a small read-only view plus important actions. Which screens: to be decided. | earlier prompt; `MOBILE_QA_GATE.md` | Not started |
| 29 | Dev CORS allows `http://localhost:8081` (Expo web), dev only. | earlier prompt | Done |

## 4. Screens (route table)

Groups: G1 sign-in, G2 Home and Search, G3 Arena details and slots, G4 booking summary, payment and confirmation,
G5 My bookings, G6 Play and match, G7 reviews, G8 profile (grouping from `RESTYLE_LOG.md`). Every route needs its own
`Stack.Screen` entry (no second default header), an auth guard, and sensible back navigation.

| Route | Group | Status |
|---|---|---|
| `(auth)/login` | G1 | Partly (old layout; "Email or phone" label already in text) |
| `(auth)/register` | G1 | Done |
| `(auth)/verify-otp` | G1 | Done |
| `(auth)/forgot-password` | G1 | Not started (old layout) |
| reset password steps, success, failed, admin code, admin landing | G1 | Not started (frames in `arena-hub-player-app-auth-2.html`) |
| `(tabs)/index` (Home) | G2 | Not started (tab bar restyled in G0) |
| `(tabs)/search` | G2 | Not started |
| `(tabs)/bookings` | G5 | Not started |
| `(tabs)/play` | G6 | Not started |
| `(tabs)/profile` | G8 | Not started |
| `arena/[id]`, `court/[id]/slots`, `booking/reschedule/[bookingId]` | G3 | Not started |
| `arena/[id]/reviews` | G7 | Not started |
| `booking/[courtId]`, `payment/[groupId]`, `booking/confirmation/[bookingId]` | G4 | Not started |
| `play/[matchId]`, `play/create` | G6 | Not started |
| `profile/edit`, `profile/liked`, `profile/payments`, `profile/settings`, `profile/change-password` | G8 | Not started |
| `notifications` | G8 | Not started |
| `health`, `modal` | n/a (the only two screens that keep the default header) | n/a |

Screen-level requirements already written down:

| # | Requirement | Source | Status |
|---|---|---|---|
| 30 | No dead controls: where the wireframe shows something the backend cannot serve, leave current behaviour and log the gap. | `RESTYLE_FOLLOWUPS.md` (decision) | In use |
| 31 | Removed because there is no backend concept: the "Taxes & Fees" line; list-card rating, review count, price and distance until the list returns them. | `RESTYLE_FOLLOWUPS.md` | In place; the backend ask is open (see section 6) |
| 32 | "Add to Calendar" on the confirmation screen is done on the device with `expo-calendar`, in its own diff in the booking-flow group. | `RESTYLE_FOLLOWUPS.md` | Not started |
| 33 | Stack screens that lack a `Stack.Screen` entry (`play/*`, `profile/*`, `booking/reschedule`) get one in `app/_layout.tsx`. | `RESTYLE_FOLLOWUPS.md` | Not started |

## 5. Payments

| # | Requirement | Source | Status |
|---|---|---|---|
| 34 | Payment options are Card, Bank transfer, JazzCash, EasyPaisa (one list, in that wording). | `FEATURE_GAP_REPORT.md` and the scope lock (web); earlier prompt for mobile | Conflicts: the mobile Payment screen lists "Credit / Debit Card" first and preselects it; G4 aligns it |
| 35 | Card payment must work before any demo that pays by card (Stripe key is a placeholder in dev, so card returns 500). | `RESTYLE_FOLLOWUPS.md`; `FEATURE_GAP_REPORT.md` | Not started (backend/config) |
| 36 | A bank-transfer booking waits for the owner; a bank transfer with a receipt is "to review"; "Awaiting payment" means nothing paid yet. The owner can send the player a payment reminder. | earlier prompt (Remind); `RESTYLE_FOLLOWUPS.md` | Backend done; the player sees it as a notice |

## 6. Backend asks that come from mobile

| # | Ask | Source | Status |
|---|---|---|---|
| 37 | `GET /arenas` returns `avg_rating`, `review_count`, `min_price` (HIGH PRIORITY). | `RESTYLE_FOLLOWUPS.md` | Not started |
| 38 | Email matched without regard to case; login by email or phone. | earlier prompt | Done |
| 39 | Unique index on `lower(email)` after a duplicate check. | `RESTYLE_FOLLOWUPS.md` | Not started |
| 40 | Sport taxonomy (Football vs Futsal) needs a decision; chips use the backend's own values meanwhile. | `RESTYLE_FOLLOWUPS.md` | Waiting for a decision |

---

## Unconfirmed

These were found in the project files or came up in work, but I could not trace them to something the user asked
for the mobile app. They stay here until the user says yes.

1. **A show/hide-password eye button on every password field.** It is drawn in `arena-hub-player-app-auth-2.html`, and the
   user's last note says it is hidden while a field is idle, but no earlier prompt asked for it on mobile. It is built
   on the shared `Field` and on Register. Say if it should stay.
2. **Eye icon when the password is shown.** The prototype draws one eye only; the built eye changes colour (ink) when the
   password is visible. No "crossed" eye is drawn, so none was invented.
3. **Phone-number OTP by text message** (FR-P-01 says "email or phone"). The docs list it, but today codes go by email
   only, and no prompt asked for text messages on mobile.
4. **A screen to file and track complaints** (gap report item 7), **distance search and sort** (item 9 / FR-P-04),
   **a booking-history report screen** (FR-P-17). They are gaps found by reading the code, not requests.
5. **Mobile text size and target size beyond the auth screens.** Rule 12 was asked to be listed, but a precise
   mobile rule (which texts are exempt) was written only for the web. Needs the user to confirm the exemptions for mobile.
6. **Where a sign-in step is not in the prototype** (reset success, expired-code state, admin states). Earlier prompts said
   to build them from the same components; the latest says the new file's frames are the prototype instead. Which one
   wins if a frame is missing: rule 2 (wait for a frame).
7. **The Sign-up variant.** The user wrote "unconfirmed"; the one existing frame was built.
8. **Whether the old Verify copy that mentioned the backend console in development** should return. It was removed
   in favour of the prototype wording; nobody asked either way.
