# Mobile restyle QA gate

A standing check to run during the mobile (`frontend/mobile`) restyle, so
regressions and responsiveness problems get caught before they're committed,
not discovered later by a user on a real device. Two tiers: a **Light gate**
before every commit, and a **Full gate** at the end of every group (G1–G8) or
after any change to a shared component (`components/ui/*`, `app/_layout.tsx`,
or anything else more than one screen imports).

## Mobile blockers

- Admins must be able to sign in and use the mobile app, including the emailed code step (user decision). Admin screens in the app: to be decided.
- Mobile Log in field is **"Email or phone"** (not "Email") when G1 starts: send it as `identifier` to `POST /auth/login` (the old `email` field still works). Text input, not email type; `autoComplete="username"`.
- Sign-up variant choice: unconfirmed, built the only frame in the prototype.
- Sign-in screens the prototype does not draw are **proposed, not in the prototype**: reset with 6 code boxes, the reset success step, the admin code step, and the wrong / expired code states. They are built from the existing OTP screen and need the user's look before they count as final.

## Mobile standing rules (user decisions)

a) **Professional and on theme.** Mobile is the main app. Every screen, pop-up, sheet, toast, button press, loading, success and error must look and feel professional and match the theme.

b) **Only what is drawn.** If a screen or pop-up is not in `arena-hub-player-app.html`, `arena-hub-player-app-auth.html` (or a file the user adds to `design/prototypes/`), do not invent it in code. A prototype HTML for it is made first and put in `design/prototypes/`; build only after the frame exists. A missing frame is listed and waits.

c) **Motion rules** (shared components; no new library unless it is already installed):
- A button press dips to 97.5% in about 160 ms.
- Loading shows a spinner and keeps the button width.
- Success shows a short tick. Errors shake once.
- Pop-ups and sheets dim and blur the back and rise in about 340 ms (close about 200 ms).
- Destructive buttons are red and always come with a plain Stay or Cancel.
- Toasts drop from the top, stay about 3 seconds and slide away.
- A light haptic on primary taps and a stronger one on success and error.
- Everything respects "reduce motion" (instant). Screen changes use the native stack transition.

What exists today (checked, nothing built for these rules yet): `react-native-reanimated` 4.1.7 and `expo-haptics` 15.0.8 are installed (so nothing new is needed). `Button` dips to 99% with opacity 0.9 (not 97.5% in 160 ms), shows an `ActivityIndicator` at full width, and has no haptic. `ConfirmTick` is a static tick. Haptics are used only by the tab bar button. There is no shared toast, sheet, shake or pop-up component yet.

d) **Email and password field icons** (on purpose, as the prototype draws it). Every field with the mail or lock icon, on every screen (Log in, Register, Forgot password, Reset password, Change password, Change email, and later ones), uses the shared `Field` with `huge`:
- Idle (empty and not focused): the icon is huge (mail about 104px, lock about 88px at 390 wide; field about 138px tall; small 12px grey label beside it), scaled with the phone width (360 to 430). The eye button is hidden.
- Active (focused or has text): the normal 52px field, icon 15px, text 14px, with a 300 ms ease-out for height and icon size together. Empty and unfocused again: it grows back.
- The whole field is the touch target in both states. After the animation, the focused field scrolls into view above the keyboard.
- "Reduce motion": the change is instant. Screen readers hear "Email" / "Password".
- The person icon (Full name) and the Phone field keep the normal small look (only mail and lock were named).
- Check 360x640 specially on screens with several such fields. A screen that cannot be used there is reported with a picture, not fixed by changing this rule.

e) **Eye button on every password field** (user decision). Show/hide with a 44px tap area, labels "Show password" / "Hide password"; while the password is visible the eye is crossed out, swapped smoothly with no layout jump.

f) **Text and tap sizes on mobile** (user decision, same as web): 14px text (exemptions: labels, badges, chart text) and 44px tap targets; small links get a 44px tap area through `hitSlop`.

g) **A sign-in step without a frame:** the frames now exist (`arena-hub-player-app-auth-2.html`). Any other screen without a frame waits for a frame. SMS codes are out of scope. The old Verify wording about the backend console does not come back. Sign-up variant: unconfirmed, built the only frame.

h) **G4 Payment screen:** it must list exactly Card, Bank transfer, JazzCash, EasyPaisa (provider keys `stripe`, `manual`, `jazzcash`, `easypaisa`; `mock` is never listed) and must not preselect "Credit / Debit Card".

i) **Temporary screens:** the admin landing ("Hello, Admin" with Log out) is **temporary until the admin group**.

## Comparison baseline — the rule for every regression diff

Regression diffs compare against a **same-time capture of HEAD**, not against
an older baseline folder. Check out HEAD into a temporary worktree, run it on
the same backend at the same time as the working tree, capture the same
screens, and diff those two sets. Do not diff against a stored baseline
folder for any screen that reads live dev-DB data (bookings, notifications,
arena lists, slots, match lists). Dev-DB data drifts: a booking can be paid or
expire, and a time-based notification ("tomorrow") appears or disappears. An
older baseline folder can therefore show diffs that have nothing to do with
the code. Stored baselines remain valid only for screens with static content
(auth forms, static copy, illustrations). Remove the temporary worktree after
the capture.

## Light gate — before every commit

Run this on every commit in the restyle, no exceptions:

1. **`tsc --noEmit`** and **lint** both clean (same commands the repo already
   uses for `frontend/mobile`; a commit that doesn't pass either isn't ready).
2. **Bundle check.** The app must actually build before anything else is
   worth checking: `npx expo export --platform web` (or, if iterating live,
   a clean `npx expo start --web` bundle with no red-box/Metro build error)
   has to finish clean. A commit that breaks the bundle fails the gate
   regardless of what the screenshots show.
3. **Numeric pixel-diff against the pre-change baseline**, for every screen
   the commit touches — not just the one component file, the screen(s) that
   render it. Same method used throughout this restyle: matched crops on an
   identical backdrop, flag a pixel when the max per-channel RGB difference
   exceeds 24, report the flagged-pixel count out of the crop's actual total
   pixel count (width × height — not the byte/channel count; a 300×286 crop
   is 85,800 pixels, not 343,200). A diff isn't "probably fine" or "looks the
   same" — it's a number, reported, with every flagged region explained (an
   intended change, or edge-antialiasing noise shown via a diff mask) or
   fixed (not one).
4. **Re-capture the touched screen(s) at all 4 viewports** — 360×640,
   375×667, 390×844, 430×932 — not just one representative size. A commit
   that only screenshots at 390×844 hasn't shown the other three sizes still
   work; capture all 4 every time, not only when something looks
   size-sensitive.
5. **Zero console errors and zero failed network requests** on every screen
   captured for this commit (Playwright's `page.on('console')` /
   `page.on('requestfailed')`, or the existing capture harness's own
   console/network logging). A screen that renders correctly but throws in
   the console, or has a failed request behind it, is not a clean capture —
   report and explain every line, don't filter silently.
6. **A11y spot-check** on anything touching `accessibilityRole` /
   `accessibilityState` / focus order: confirm the role/state pairing is
   correct for the control (e.g. `'radio'` pairs with `.checked`, not
   `.selected`; a toggle exposes `.checked`, not just a visual class) and that
   `forwardRef`/focus-chaining still reaches the right field.
7. **Before/after screenshot** of anything visually changed, per viewport
   from step 4 (not one size).

## Full gate — end of every group (G1–G8), or after any shared-component change

Everything in the Light gate, plus:

1. **Route inventory and Stack.Screen audit.** List every route under
   `frontend/mobile/app/` (walk the tree — `app/(auth)/*`, `app/(tabs)/*`,
   and every top-level/dynamic route such as `arena/[id]`,
   `arena/[id]/reviews`, `court/[id]/slots`, `booking/[courtId]`,
   `booking/confirmation/[bookingId]`, `booking/reschedule/[bookingId]`,
   `payment/[groupId]`, `play/[matchId]`, `play/create`, `profile/edit`,
   `profile/liked`, `profile/payments`, `profile/settings`,
   `profile/change-password`, `notifications`, `health`, `modal`) and confirm
   each one has its own `<Stack.Screen>` entry in the owning `_layout.tsx`
   (`app/_layout.tsx` for the root stack, `app/(auth)/_layout.tsx` for the
   auth group). A route with no entry gets a second, default header on top of
   its own custom one — this restyle found and fixed that exact defect once
   already (logged in `RESTYLE_FOLLOWUPS.md`); re-check it every group, since
   a newly added screen can reintroduce it. For each route, also check:
   - **Auth guard**: does an unauthenticated user get redirected off a
     protected route (anything outside `(auth)`), and does an authenticated
     user get redirected off `(auth)` routes rather than seeing them?
   - **Back navigation**: does the hardware/gesture back action and the
     screen's own back button both leave the user somewhere sensible (not a
     blank screen, not back into a flow they just completed, e.g. back from
     Booking Confirmation shouldn't return to Payment)?
2. **Interaction smoke flow.** Walk the one real end-to-end path a player
   actually takes, screen to screen, not in isolation:
   login → home → arena details → pick a slot → booking summary → payment →
   booking confirmation → my bookings → reschedule/cancel a booking → play →
   profile → logout. Confirm each transition lands on the right screen with
   the right data (not just that each screen renders fine on its own) and
   that logout actually clears the session (back button after logout
   shouldn't reveal an authenticated screen).
3. **4-viewport responsiveness check**, on every screen the group touched,
   not just the one that prompted it: **360×640, 375×667, 390×844, 430×932**.
   For each screen and each width, check with-keyboard too wherever the
   screen has a text input that's likely to be focused in normal use (a
   ~300px keyboard inset is close enough to simulate; the real figure varies
   by device/keyboard but 300px has been accurate enough in this restyle's
   captures so far). Report as a **route × viewport pass/fail table**: rows
   are routes, columns are the 4 widths (× with/without keyboard where
   relevant), cell is pass/fail plus which element(s) are off-screen on a
   fail. A screen that needs scrolling to reach its own submit button on
   some or all of these widths is a real finding, not an acceptable
   trade-off to wave through silently — report it and let whoever owns the
   screen decide.
4. **Real-content typing test** for every field that takes free text of
   non-trivial length (anything not a single word: email addresses, pasted
   tokens/codes, passwords, names). Static mockups with short placeholder
   text ("Email", "Password") can hide a layout bug that only shows up with
   real content — this restyle found two of these already (the Log-in icon
   growing when its sibling input left the flex flow; the Reset-code field's
   unconstrained icon forcing a 43-character code into a one-character-per-
   line wrap). Use the matched-crop/identical-backdrop method so the proof
   isolates the one thing that's supposed to be different (the text) from
   everything that's supposed to stay identical (the box, the icon) — and
   remember an HTML prototype's wrap behavior (`word-break`) is not proof of
   what a real RN `TextInput` does; a single-line `TextInput` scrolls
   horizontally rather than wrapping, so the RN behavior needs its own check,
   not an assumption carried over from the HTML mock.
5. **Whole-app regression diff, not just this group's surface.** Numeric
   pixel-diff **every** screen in `design/baselines/mobile/`, including ones
   this group never touched, against its pre-group baseline. Muhammad's rule
   is that a change must not spoil other components — so an untouched screen
   is required to come back identical or within noise (the same
   antialiasing-only noise the Light gate's diff masks already establish as
   acceptable); anything beyond that on a screen nobody meant to touch is a
   regression from a shared component and blocks the gate until explained or
   fixed, not just "the group's own files," which only proves the files
   changed, not that nothing else moved.
6. **Reduced-motion / accessibility settings**, where the group added or
   changed an animation: confirm it responds to
   `useReducedMotion()`/`AccessibilityInfo.isReduceMotionEnabled()` (RN) or
   `prefers-reduced-motion` (web prototype), not just that it looks fine with
   motion on.
7. **File-count reconciliation**: confirm the number of files touched in the
   commit matches what was reviewed and approved — no unexplained file ends
   up staged.

## Report format for the Full gate

Every Full-gate run is reported as:
- The route × viewport pass/fail table from step 3.
- The interaction smoke-flow result (pass, or the exact step it broke on).
- The whole-app regression diff's flagged screens (if any), each with its
  diff mask and an explanation.
- Everything else (route/Stack.Screen audit, typing tests, reduced-motion,
  file count) as a short pass/fail list with specifics for any fail.

## Native-checklist caveat

Everything above runs on **web** (`npx expo start --web` + Playwright), which
is this restyle's only automatable capture path so far. Web is a reasonable
proxy for layout/responsiveness/a11y-attribute checks, but it is not the real
runtime: it doesn't exercise the native keyboard, native `accessibilityRole`
mapping to the OS's actual accessibility tree (TalkBack/VoiceOver), native
gesture handling, or native-only libraries
(`react-native-keyboard-controller`, `react-native-reanimated`'s native
driver path, etc.). Before this restyle is considered done — not after every
individual group — the same Full-gate screens need a pass on a real device or
simulator/emulator for at least: keyboard behavior (does the keyboard
actually avoid/push the focused field the way the web simulation assumed),
a screen-reader pass with TalkBack or VoiceOver on the screens with custom
`accessibilityRole`/state, and a check that whatever reduced-motion API is
used actually responds to the OS-level setting on-device (the web media
query and the RN API are not guaranteed to agree with each other, let alone
with how the OS reports the setting). This caveat doesn't block any
individual group's gate — it's a standing reminder that "passed the web
gate" and "verified on-device" are different claims, and only the second one
means the restyle is actually done.

## Verification safety

These rules apply to every check, in every area (mobile and web):

- No junctions or symlinks into the real working tree. A verification
  worktree installs its own dependencies (`npm ci` in each app folder).
- Remove a verification worktree only with `git worktree remove`, run from
  the main tree. Never delete a worktree folder by hand.
- Starting or restarting the dev backend on :8000 from the main tree is
  allowed whenever your own checks need it. Anything else that needs a stop
  and a report stays as it is: a failed worktree removal, anything touching
  the dev database, anything outside the repo.
- Never recursively delete a directory that might contain a link. If a
  cleanup fails, stop and report it; do not retry with a stronger delete.
- Scratch files go outside the repo. Delete only files you created in this
  session, one by one.
