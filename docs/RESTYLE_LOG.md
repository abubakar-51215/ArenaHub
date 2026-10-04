# Restyle log

Notable events during the arena-theme restyle that aren't code follow-ups —
regressions to be aware of, scope calls that were explicitly rejected, and
anything future-us shouldn't have to re-discover from git archaeology.

---

## `/` baseline invalidated during Strand C

`app/page.tsx` was rewritten out-of-band (47→776 lines, new hero copy) while
Strand C item #5 (admin verification tabs) was in progress. Not caused by
any restyle work — confirmed the live dev server was serving the new
content and that nothing touched by items #1–#5 imports or could affect
this file. Recapture the baseline screenshot before further pixel-diff
comparisons against `/`.

---

## Sidebar count for admin Payments — rejected, not deferred

The prototype's admin sidebar shows a "Payments (23)" badge implying a
payment-approval queue. No such workflow exists in this app —
`admin/(dashboard)/payments/page.tsx` is a read-only transactions monitor
with zero action buttons (confirmed during the Strand C row-actions-fade
audit). This isn't a missing query; it's a missing feature the prototype
assumed. Not logged as a restyle follow-up ticket — if that workflow gets
built later, wiring the count in is trivial at that point.

---

## Live Board built on `/owner`, not as its own route — supersedes SESSION_HANDOFF Item 4 plan

`SESSION_HANDOFF.md` Item 4 (lines ~177–205) recorded a plan where Live
Board becomes the new default landing page at `/owner`, displacing the
existing Dashboard/Analytics KPI content to its own separate route (with a
sidebar-nav-relabel proposal still outstanding). **That plan is stale and
was explicitly superseded** before any of it was built — Live Board never
existed in the codebase, so this was a net-new build, not a merge of two
existing pages.

The decision actually implemented: merge at the navigation level only.
Live Board stacks as a new section directly above the existing, untouched
Dashboard/KPI content on `/owner` — same single page, no new route, no
sidebar changes, nothing displaced. `app/owner/page.tsx` keeps its stat
cards, both charts, Top Arenas, and Recent Bookings exactly as they were;
`<LiveBoard />` is simply the first thing rendered above them.

What was built (`components/owner/live-board.tsx`,
`live-board-grid.tsx`, `now-line.tsx`): a single-arena occupancy view
(courts as rows, hours as columns) for the current day, with a prev/next
switcher between the owner's arenas and a sweeping "now" line.

Decisions made along the way:
- **Switcher clamps at both ends — no wraparound.** Prev/Next disable
  themselves at index 0 and the last arena, rather than cycling.
- **Disabled courts (`is_available: false`) are shown grayed out with a
  "(Disabled)" label, not hidden.** The row stays visible so an owner
  can see the court exists and is intentionally off, rather than it
  silently disappearing from the board.
- **Hour columns are driven by each arena's real `operating_hours` for
  today, not a hardcoded range.** Short-hours arenas get a few wide,
  evenly-filled columns; long-hours arenas (up to 24h) overflow into a
  horizontally-scrollable grid rather than being squeezed to fit.
- **No backend work was needed.** The existing
  `GET /owner/arenas/{arenaId}/bookings/calendar` endpoint already
  returned the right shape; only a frontend build was required.
- **The now-line owns its own 60s tick internally** (`now-line.tsx`),
  isolated from the rest of the grid, so the sweeping clock never
  triggers a re-render of anything above it.

---

## Player app — Archivo width axis dropped (known visual deviation)

`arena-hub-player-app.html` uses Archivo's variable `wdth` axis (76 for
scoreboard numerals, 125 for eyebrows). React Native 0.81 has no
`fontVariationSettings` style (only `fontVariant`), and
`@expo-google-fonts/archivo` ships static weights only, so the axis can't be
expressed on device.

Decision (Muhammad): option 1. Archivo static weights (heavy for numerals) and
Inter Tight static 400–700. Eyebrows are uppercase with wide `letterSpacing`
(the prototype's `.16em`). Not using `archivo-narrow` (a different design) and
not instancing custom fonts. Numerals will read wider and eyebrows narrower than
the prototype. That difference is accepted and is not a regression.

## Player app — first mobile baseline and the web boot fixes it needed

`frontend/mobile` had never been installed or run on web in this repo. Two
fixes were needed before any screen rendered, both outside the restyle:

- `import.meta` crash: zustand's ESM build reads `import.meta.env`, which
  Metro's web bundle can't parse. Added `babel.config.js` with
  `unstable_transformImportMeta` and `babel-preset-expo` as a devDependency.
- Auth store never rehydrated on web: the `localStorage` fallback was
  synchronous, so persist rehydrated inside `create()` before `useAuthStore`
  existed and `hydrated` stayed false (endless spinner). Made the web storage
  async, with `window` guards for Expo's Node render pass. Native uses async
  SecureStore and was unaffected.

Baselines: `design/baselines/mobile/` holds 23 screens at 390x844 @2x
(`01-login` to `23-profile-change-password`). They depend on dev-DB fixtures
(relative dates, seeded bookings), so expect date text to drift. They're a
"before" reference for the restyle, not a strict pixel-diff gate.

---

## Player app — governing rule: match `arena-hub-player-app.html` exactly

Decision (project owner): the mobile app must look exactly like the prototype.
This supersedes the earlier idea of darkening link/success/muted/amber/red for
legibility. Prototype values are used as drawn. The only allowed deviations are
platform limits (the Archivo width axis; Archivo weight 650, which has no static
file) and requirement-driven removals. The extracted values live in
`design/mobile-spec.md`; reference frames are in `design/references/player-app/`.

Known contrast properties of the prototype (documentation, not changes; WCAG,
computed from the token values):

| Pair | Ratio |
|---|---|
| lime-deep `#7FA30F` text on white | 2.94:1 |
| lime-deep on lime-wash `#F2FBDA` (ok badges) | 2.74:1 |
| muted `#79857E` on white | 3.84:1 |
| muted on paper `#F1F2EF` | 3.42:1 |
| amber `#D9930B` on amber-wash `#FDF3DC` (pending badge) | 2.34:1 |
| red `#CF4141` on red-wash `#FBE9E9` (cancelled badge) | 4.00:1 |
| text-2 `#46534C` on paper | 7.18:1 |
| ink on lime / paper on ink (buttons) | 13.99:1 / 15.85:1 |

Verified font facts (measured, not assumed): Inter Tight weight 650 renders
identically to 700 in the prototype (the page loads discrete 400/500/600/700
faces), so Inter Tight Bold is an exact match. Archivo 650 is a true midpoint of
the variable axis; the static 600 and 700 files each differ in width by about
1.7%.

## Player app — second platform limit: weight 650

The prototype uses weight 650 (38 places). Decision (Muhammad): Inter Tight
uses Bold 700 (the browser already renders 650 as 700, measured identical).
Archivo 650 (headers, e.g. "Filters", wght 650) also uses Bold 700 so the
hierarchy stays consistent; the static Archivo files have no 650, and 600 and 700
each differ by about 1.7% in width. This is the second known visual deviation,
next to the dropped Archivo width axis.

---

## Player app — G0a-2 interim-value checklist (must be empty before the restyle closes)

G0a-2 replaced the 21 `Colors.light.card` fills with `lineSoft` in bulk so the
unconverted screens stay usable. Several are not `lineSoft` in the prototype
(`design/mobile-spec.md`). **Each group's report ticks off the items in its
screens. The final group cannot close while any item is open.** Line numbers are
as of commit `8fad721`.

| ☐ | Where | Interim value | Spec value | Group |
|---|---|---|---|---|
| ☐ | `app/(tabs)/index.tsx:214` Home `searchBar` | lineSoft | white (`card`) with a `1px line` border, radius 12, pad 10/13 | G2 |
| ☐ | `app/(tabs)/index.tsx:223` Home `sportChip` | lineSoft | white (`card`) with a `1px line` border, radius 12; active = ink | G2 |
| ☐ | `app/booking/confirmation/[bookingId].tsx:112` confirmation `card` | lineSoft | white (`card`) with a `1px line` border, radius 15 | G4 |
| ☐ | `app/booking/[courtId].tsx:266` booking-summary `card` | lineSoft | white (`card`) with a `1px line` border, radius 15 | G4 |
| ☐ | `app/play/[matchId].tsx:153` match-detail `card` | lineSoft | white (`card`) with a `1px line` border, radius 15 | G6 |
| ☐ | `app/payment/[groupId].tsx:275` payment `bankCard` | lineSoft | white (`card`) with a `1px line` border, radius 15 (no frame: composed) | G4 |
| ☐ | `app/arena/[id].tsx:126` hero image fallback | lineSoft | ink `#0F1A15` (`.m-vis`) | G3 |
| ☐ | `components/arena-card.tsx:51` image fallback | lineSoft | ink `#0F1A15` (`.m-vis`) | G2 |
| ☐ | `components/booking-card.tsx:144` image fallback | lineSoft | ink `#0F1A15` (`.m-vis`) | G5 |
| ☐ | `app/booking/reschedule/[bookingId].tsx:202` `slotDisabled` | lineSoft | `slotOpen`, dashed `line` border, line-through text | G3 |
| ☐ | `app/court/[id]/slots.tsx:244` `slotDisabled` | lineSoft | `slotOpen`, dashed `line` border, line-through text | G3 |
| ☐ | `app/(tabs)/bookings.tsx:106` My bookings `tab` | lineSoft per tab | `lineSoft` track (radius 11, pad 3); inactive buttons transparent; active = white button with the `0 1px 2px` shadow | G5 |
| ☐ | `app/(tabs)/play.tsx:162` Play `tab` | lineSoft per tab | same segmented control as above | G6 |
| ☐ | `app/arena/[id].tsx:322` `sportPill` | lineSoft | `lineSoft` (`.tag`); confirm radius 6, pad 2/7, 11px/600 `text-2` | G3 |
| ☐ | `app/arena/[id]/reviews.tsx:207` `breakdownBarTrack` | lineSoft | `lineSoft` (`.score-track`), height 5, radius 3; confirm | G7 |
| ☐ | `app/arena/[id]/reviews.tsx:220` `ownerResponse` | lineSoft | no frame: decide | G7 |
| ☐ | `app/booking/confirmation/[bookingId].tsx:116` QR placeholder | lineSoft | deleted (QR removed) | G4 |
| ☐ | `app/payment/[groupId].tsx:285` `receiptPreview` | lineSoft | no frame: decide | G4 |
| ☐ | `app/profile/edit.tsx:155` `avatarImage` | lineSoft | no frame: decide | G8 |
| ☐ | `components/match-card.tsx:100` icon circle | lineSoft | prototype match cards have no icon circle: remove or decide | G6 |
| ☐ | `components/static-map.tsx:96` map background | lineSoft | no frame: decide | G3 |

Also open from G0a-2 (not part of the 21): the 22 remaining `#fff` literals
(white text on filled surfaces, icon colours) get exact `onInk`/paper handling
when the primitives land, the confirmation screen's hardcoded green/amber
`LinearGradient` is replaced in G4, and the five blue literals (`#EFF6FF` ×3,
`#E5EDFF`, `#0a7ea4`) are repointed in the group that restyles each screen.

---

## G0b-2: tab bar label layout bug in `@react-navigation/bottom-tabs`

`tabBarStyle` padding (`paddingTop`/`paddingBottom`) does not add to the tab
button's box the way normal CSS/RN padding would — on this library version's
web renderer it is subtracted from a fixed internal height budget instead,
which starved the label's reserved space down to 0 and left it invisible
(correct text and colour still in the DOM, just rendered at 0 height).
Bisected by reloading the live Expo web render after each isolated change:
no `tabBarStyle` → label 10px tall; `{ paddingTop: 7 }` alone → 3px (exactly
`10 − 7`); `{ paddingBottom: 16 }` alone → label 0px **and** the whole tab's
box height drops from 48 to 32 (exactly `48 − 16`). Reproducible with
`tabBarStyle` padding alone, independent of whether an explicit `height` is
also set.

Fix: stopped handing padding to `tabBarStyle` at all. `app/(tabs)/_layout.tsx`
now supplies a custom `tabBarButton` per screen (`makeTabButton`) that draws
its own icon, 3px gap and label inside a plain `View`/`Text`, with its own
7px-top / `max(16, safe-area-bottom)`-bottom padding — bypassing the
library's icon/label slot math entirely. `tabBarStyle` is now limited to
what doesn't trigger the bug: background, top border, horizontal padding,
and an explicit total height. Verified with a regression assertion in
`frontend/mobile/scripts/capture-tabbar.mjs` (every tab label's bounding
height must be `> 0` and visible) so this can't regress silently in a later
restyle group.

**Native is unverified.** This bug, its bisection, and the fix were all
checked against `expo start --web` only — no iOS/Android device or simulator
was used this session. The underlying bug might be web-only (a different
code path in bottom-tabs' native renderer), or the custom-button fix could
behave differently on-device in ways web can't catch (e.g. Android's ripple,
iOS's large-content-viewer accessibility text, safe-area insets on a real
notch/gesture-nav phone). On-device check needed before this is trusted:
with Expo Go, open each of the 5 tabs and confirm (1) all 5 labels are
visible, not just icons; (2) the bar's total height looks like ~60px plus
whatever the device's home-indicator/gesture-bar inset adds, not stacked on
top of the full 16px twice; (3) the active tab's label is ink/near-black and
its icon is the yellow-green lime-deep, with the other 4 tabs' icon and
label both in muted grey; (4) on a phone with gesture navigation (no
physical home button), the bar's bottom spacing sits flush with the
gesture-bar area rather than leaving a visible gap or getting cut off
under it.

---

## G0c-2c: the confirmation-screen QR fix is interim

`app/booking/confirmation/[bookingId].tsx`'s `booking.qr_code_url` was
bypassing `resolveMediaUrl`, the same bug class as the avatar 404 — fixed as
a one-line change (wrap the `uri` in the resolver) alongside the rest of
G0c-2c's media-URL audit. This screen's whole QR block is already slated for
removal: `RESTYLE_FOLLOWUPS.md`'s "Dropped from the HTML prototype" list
names "QR / works offline" explicitly, and the G0a-2 checklist already has
this exact element logged for deletion in G4. The one-line fix is correct
and harmless to keep in the meantime (a real broken-image bug, live right
now, worth not shipping broken) — it just has a known, already-scheduled
expiry; G4 removes the fix along with the block it's fixing.
