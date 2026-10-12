# Mobile launch audit

Written on 2026-10-11 for branch `prototype-screens`. Method: read the mobile code (`frontend/mobile`) and the backend routes it
uses, ran the web build at 360/375/390/430, and ran scripts for the parts that have none on a computer. **Nothing here was run on
a real phone.** Items marked "code only" were judged by reading the code; "web" were measured in the web build; "script" were
measured by a script (`scripts/keyboard-check.cjs`, `scripts/worklet-check.cjs`).

Severity: **blocker** (customers get hurt or the app cannot ship), **high** (a likely customer-facing bug), **medium**, **low**.
"Fixed" means fixed in this round with its own commit. "Needs frame" means a design change is needed first. "Needs you" means a
decision or text only you can give.

## Update after G6 (2026-10-12)

**Fixed now (from the medium and low lists):**
* Medium 1, dates and "today" in Asia/Karachi: one helper `lib/karachi.ts` used by the day strips (Slots, Reschedule), past slots,
  "Open till", "booking started", report periods, notice groups and the near-me rule. Server times with no zone are read as Karachi time.
  Tested under six phone time zones (`node scripts/karachi-check.cjs`).
* Medium 2, one review date format ("3 days ago", then "27 Apr" or "27 Apr 2025").
* Medium 5, tab labels are 11 px (fit at 360: 46 of 70 px for the longest).
* Medium 9, the push token is sent again when it changes (real builds only).
* Medium 10, a photo that fails to load shows the picture for "no photo"; avatars keep their initials.
* Medium 11, a link opened while signed out is kept and opened after Log in (`lib/deeplink.ts`, `node scripts/deeplink-check.cjs`).
* Medium 3, the old profile screens are replaced by the account frames (Personal information, Settings, Saved arenas, Payment history,
  My reviews, Help and support). Low 2, the template components are removed.

**Done in the offline and upload step (frame `arena-hub-player-app-states.html`): offline banner (medium 6), cancel an upload in progress (medium 7).** Still open: nothing in this list needs a frame.
**Deferred to the very end by decision (docs/BEFORE_GOING_LIVE.md, "Decide at the very end"):** blockers B2 (Terms and privacy text, and the
Help contact) and B3 (app identifiers) stay open on purpose.

**New items found in G6:**
| Severity | What | Note |
|---|---|---|
| medium | Notifications list shows the latest 50 (no "load more"). | Fine for now; add paging when a player has more. |
| medium | Games played / Spent on Profile are counted from the first 100 bookings of each tab. | Move to one server total if a player passes 100. |
| low | Complaint list title is the first words of what the player wrote (the form has no title). | A title field would need a frame. |
| low | Near me is memory only: after the app is closed the position is asked again (silently when allowed). | By design (the position is never saved). |
| low | The match list uses the saved city, not the position. | Until matches get distance (needs a decision). |
| low | The 20 notices of one kind from the server carry English text only. | Urdu is not in scope. |

## Summary

| Severity | Found | Fixed now | Open |
|---|---|---|---|
| Blocker | 3 | 1 | 2 (need you) |
| High | 11 | 11 | 0 |
| Medium | 12 | 0 | 12 |
| Low | 8 | 0 | 8 |

## Blockers

| # | What | Checked | Result | Fix |
|---|---|---|---|---|
| B1 | After Log in the app went back to the splash and covered Home (the whole app was put back to "waiting" when the tokens were saved a moment before the account loaded). | web, timing and start-up log | Found: second splash and a hop to the admin route. | **Fixed** (`everReady` latch in `app/_layout.tsx`). Log in to Home now 0.9 to 1.2 s on the web build. |
| B2 | Profile > "Help & Support" and "Terms & Conditions" open an alert that says "Coming soon." | code only | Both stores ask for a privacy policy and terms the person can open. | **Needs you**: the text or a web page address. Then a small screen or a link. |
| B3 | `app.json` has no `ios.bundleIdentifier` and no `android.package`; no `versionCode`/`buildNumber`. | code only | A store build cannot be made without them, and they cannot be changed after the first upload. | **Needs you**: pick the id (suggestion: `pk.arenahub.app`). One line each. |

## High (all fixed now)

| # | What | Checked | Result | Fix |
|---|---|---|---|---|
| H1 | Keyboard hid the field on Log in, Search and comment boxes; keyboard did not close. | web (keyboard hook) + script + code | Reproduced by code reading (no shared handling; Android window mode). | **Fixed**: `KeyboardScroll`/`KeyboardArea`. Web test: focused field ends 24 to 32 px above the keyboard at 360/390 wide; sticky Create Match button ends above the keyboard. Real keyboard: phone only. |
| H2 | Filter count badge cut off at the top by the scroll area. | web, numbers | Badge sat 4 px outside its button. | **Fixed**: `CountBadge` inside the 44 px button, 20 px, 14 px text, 0 px clipped at 4 widths. |
| H3 | Android back button on "Booking confirmed", "Awaiting approval", "Failed", "Slot lost" went back into the payment screens (booking already settled). | code only | Stack was payment, then these screens. | **Fixed**: `useBackTo` sends back to Bookings or Home. |
| H4 | Signing out left the previous player's data in memory (bookings, unread count, half-made booking); the next person to sign in could see it for a moment. A refused token refresh did the same. | code only | `clear()` only cleared tokens. | **Fixed**: `clear()` also empties the query cache and the checkout store. |
| H5 | Status bar icons were dark on the dark Home hero and arena photo (clock and battery not visible). | code only | One global dark `StatusBar`. | **Fixed**: `LightStatusBar` on Home and Arena (dark again once scrolled away). |
| H6 | No error page: an unexpected server reply that made a screen fail would show a blank or red screen. | code only | No `ErrorBoundary`. | **Fixed**: calm "Something went wrong" page with Try again. |
| H7 | Developer screens reachable by deep link without signing in (`arenahub://health`, template `modal`). | code only | Both were routes. | **Fixed**: modal removed; health redirects to the app unless in development. |
| H8 | Photo upload had no time limit, no size or type check; a bad photo failed only after a long wait. | code only | `fetch` with no signal. | **Fixed**: 5 MB and JPG/PNG/WebP check with a plain message, 60 s limit. |
| H9 | iOS would crash or be rejected when the photo picker opens (no photo permission text); Android would ask for camera and microphone. | code only | `expo-image-picker` was missing from the plugins. | **Fixed**: plugin with the reason text, camera and microphone off, blocked permissions list. |
| H10 | Lists did not refresh after the phone had been in a pocket (React Query has no app focus on phones). | code only | No `focusManager`. | **Fixed**: refetch when the app comes back to the front. |
| H11 | Start-up and sign-in could wait for ever (earlier round). | web | Fixed earlier; re-checked: sign-in stalled account call fails at 10 s with a message. | Done. |

## Medium (open, with a suggested order)

1. **Dates and "today" follow the phone's time zone**, not Asia/Karachi (`slots.tsx`, `move`, `create`, `checkout.ts`, `detail`
   "start is past"). Fine for phones in Pakistan; wrong near midnight for a phone set to another zone. Fix: one
   `lib/karachi.ts` with `Intl.DateTimeFormat({timeZone:'Asia/Karachi'})` and use it in those 6 places.
2. **Review date shows `toLocaleDateString()`** (phone format) while the rest uses `en-GB`: make it one format.
3. **Profile pages (Edit, Settings, Change password, Liked, Payments, Report) are still the old design** (14 px rule now met on
   fields, but cards and headers differ from the frames). Needs frame.
4. **Large phone font (130% / 150%) not measured.** Count badge is capped at 1.2x; other text grows freely. Needs a pass on a
   phone with the system font at 150% (cards, chips, tab labels at 9.5 px).
5. **Tab labels are 9.5 px** (the frame says so; below the 14 px rule). Needs frame or a decision.
6. **Network banner. Done.** NetInfo plus the dark offline bar and the lime "Back online. Updating…" bar (`NetworkShell`); actions that
   need the server say "... needs a connection" and toast "No connection. Your change was not saved."
7. **Upload cancel. Done.** Progress with a percent, Cancel opens the red "Stop uploading?" sheet ("Keep uploading"), then the stopped,
   failed and too-big states (`components/booking/receipt-box.tsx`).
8. **No retry on mutations** (pay, cancel, move). Correct on purpose (no double charge); the message says "try again".
9. **Push token is registered once per start**; a token that changes while the app runs is not re-sent.
10. **Image lists**: the arena photo list uses a fixed height, so no jump; avatar and receipt images have no failure state
    (blank circle). Add a fallback image.
11. **Deep links**: scheme `arenahub://` works for screens; there is no web link (`https://`) and no handling for a link opened
    while signed out (it goes to Log in and then Home, not to the link). Needs a small "return to" step.
12. **Console on web**: warnings listed below.

## Low (open)

1. `app/admin.tsx` is a temporary admin screen on the phone (admin work is on the web). Remove before launch or keep hidden.
2. The template components `hello-wave`, `external-link`, `themed-text` and `themed-view`, `parallax-scroll-view` are unused
   by the real screens (still used by `health`).
3. `react-native-keyboard-controller` is installed but no longer used (can be removed with `npm uninstall`).
4. Money is shown as "₨ 1,200" in the booking screens but "Rs. 1200" in Profile > Payments (old design).
5. Plurals: most use a helper; Profile > Payments and Reviews write "3 reviews" for 1. Use the helper.
6. `app.json` `userInterfaceStyle: light` only: dark mode is not designed. Fine.
7. No `accessibilityLabel` on a few text-only links in the old profile screens (they read their text, which is enough).
8. Calendar, contacts and microphone are not used: nothing to ask (kept off in `app.json`).

## What was checked, by area

### Navigation
* Android back button: payment and bank transfer ask before leaving (`useLeaveCheckout`, closes the sheet first because the
  sheet is a Modal with `onRequestClose`); end-of-flow screens now go to Bookings/Home (H3). Tabs keep their state (React
  Navigation default). Pushed screens never exit the app: back pops until Home, and Home then closes the app (normal Android).
  *Code only.*
* Back stack after Log in: `router.replace`, so back from Home does not return to Log in. After Log out: `router.replace` to
  Log in; the protected groups remove the tabs. *Web.*
* No screen without sign-in: `Stack.Protected` guards; deep links to protected screens go to Log in. *Web + code.*
* No dead ends: every end screen has a button to Bookings or Home. *Code.*

### Safe areas, status bar
* `SafeAreaView` with `edges` on every screen; sticky bars use the bottom inset. `edgeToEdgeEnabled: true`. *Code.* Notch, gesture
  bar and status bar overlap: phone only.
* Status bar: dark icons by default, light on the two dark tops (H5). Release build: same code path.

### Display
* Portrait lock: `orientation: portrait` in `app.json`. *Code.*
* 320 px wide: not measured (the supported range in the gate is 360 to 430). Medium M4 for font scaling.

### Session and network
* Token refresh on a 401 once (`lib/api.ts`), shared promise so parallel calls refresh once; failed refresh clears the session
  and the guards show Log in. Every call has a 20 s limit (start-up and sign-in 8 to 10 s). Retries: queries once, mutations
  never. Double tap: `Button` is disabled while loading; bank upload has a `sending` ref. *Web + code.*
* Unexpected replies: `env.data as T` can be `null`; screens read optional fields. The new `ErrorBoundary` is the safety net.

### Data and text
* Money: one formatter `formatRs` ("₨ 1,200"). Dates: see M1. `numberOfLines` on 23 text spots for long names. Raw codes:
  server messages are plain English; the app never prints a status code. *Code.*
* "undefined"/"null"/"NaN": none found in a search of the visible strings; numbers pass through `Number.isFinite` in `formatRs`.

### Lists, states
* Lists use stable keys (ids); the few index keys are for fixed skeleton rows and stars. Pull to refresh on Home, Bookings;
  Loading, empty and error states exist on the screens built in G1 to G5 (checked in their gates); the old profile screens have
  loading and error text but not the full set (M3).

### Permissions
* Location: when-in-use only; denied or dismissed is not an error (falls back to the saved city or "All cities"). Photos: system
  picker, no permission on Android 13+; iOS text added (H9). Notifications: asked only in a real build, never in Expo Go; a
  refusal is silent. Calendar: not used. *Code.*

### Uploads
* Receipt: JPG/PNG up to 5 MB, now checked before sending (H8); rotation is handled by the picker (EXIF applied); slow upload
  ends at 60 s with a message; retry is the same Send button. Cancel mid-upload: M7.

### Forms
* Messages sit under or next to fields (auth screens); typed data stays on error. Password rules: the app checks the same rules
  as the backend (8+ characters, upper case, digit, special; last three not reused) on Reset and Register.

### Security basics
* Tokens only in SecureStore (web uses localStorage for the web build only). No secrets in the bundle: only
  `EXPO_PUBLIC_API_URL`. Logs: every `console.log` is `__DEV__`-only; the start-up and login lines print nothing in release.
  Release must use `https://` (a warning is printed otherwise, `lib/config.ts`). Dev menu: only in development builds.

### App identity (`app.json`)
* Name, icon, splash, scheme `arenahub`, version `1.0.0`: present. Description added. Bundle ids and build numbers: B3.
  Privacy policy link: B2.

### Accessibility
* Icon-only buttons now have labels (back buttons, Filters, profile photo). Roles on buttons/links/headers are set on the
  restyled screens. Contrast: ink on lime and muted grey on paper pass the checks done in the earlier gates (muted `#6C7771`
  on white is 4.9:1). Focus order follows the layout. Screen reader on a phone: not tested.

### Console (web build)
56 page loads (14 screens at 360, 375, 390, 430): **0 console errors, 0 failed requests, 0 px sideways scroll.** Two warnings
remain, each on every page, both from the web layer only: `props.pointerEvents is deprecated. Use style.pointerEvents`
(react-native-web) and `Animated: useNativeDriver is not supported` (no native animation module in a browser). Neither exists on
a phone.

Measured findings on the **old-design profile screens** (Edit, Settings, Change password, Reviews, Create match): text of 12 to
13 px, the Settings switches 40 x 20, and the back arrow 36 x 38 before the hit area fix (now 58 x 60 with the hit slop). These
are the M3 item (needs frame). Restyled screens: the only text under 14 px is the sport chip, price and "New" tag text that the
frames set at 10.5 to 12 px (accepted exemptions from the earlier gates).
