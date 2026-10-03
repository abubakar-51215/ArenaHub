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
