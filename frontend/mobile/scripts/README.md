# Mobile restyle capture harness

Recovered from a prior session's scratchpad after the commit that added
`design/baselines/mobile/*.png` (`5dd27d2`) shipped the output but not the
script — a process gap, now fixed by committing these. `playwright` is a root
devDependency (not `frontend/mobile`'s own); Node's module resolution walks up
from `scripts/` to find it, so no mobile `package.json` change was needed.

## Before running either capture script

1. Start the backend:
   ```
   cd backend
   uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
2. Start Expo web, from `frontend/mobile`:
   ```
   npx expo start --web --port 8081
   ```
3. If fixtures are stale (bookings/slots/match IDs baked into
   `capture-baselines.mjs` no longer exist in the dev DB — new DB, or the
   seed window has passed), reseed first:
   ```
   node scripts/seed-fixtures.mjs
   ```
   and update the `arena`/`court`/`slotDate`/`pending`/`confirmed`/`matches`
   IDs at the top of `capture-baselines.mjs` with its output.

## Mode 1 — full baseline set (390×844 @2x)

```
node scripts/capture-baselines.mjs [outputDir]
```

Captures the same 23 screens, in the same order, as
`design/baselines/mobile/01-login.png` … `23-profile-change-password.png`.
Logs in through the real UI as `sara.khan@example.com` (not a token injected
into storage), so the login/register/forgot-password screens are captured
honestly before auth. Injects CORS headers via Playwright route interception
(the dev backend only allows `:3000`) rather than touching backend code.
Writes `_console.json` (browser console errors + failed network requests)
alongside the screenshots.

Default output: `design/baselines/mobile/`. Pass a different directory to
avoid overwriting the existing baselines.

## Mode 2 — tab bar, prototype-comparison viewport (300×628 @2x)

```
node scripts/capture-tabbar.mjs [outputDir]
```

300×628 matches the prototype's own mock-phone frame width (298px content,
see `design/mobile-spec.md` "Tab bar"), so the two render at directly
comparable sizes. Logs in by injecting a token into `localStorage` instead of
the UI (faster re-runs; this mode only cares about the tab bar). For each of
the 5 tab screens, writes a full screenshot, a cropped `bar-<name>.png` of
just the tab bar, and `report.json` with `getBoundingClientRect`/
`getComputedStyle` measurements (bar size/padding/background/border, and
each tab's icon size/colour and label font/size/colour) for both the active
and inactive tabs.

## Fixture seeding (`scripts/seed-fixtures.mjs`)

Creates two bookings (one left pending, one carried through payment
simulate-confirm) and a match, via the real API as the owner and as
`sara.khan`, so capture-baselines.mjs has non-empty payment/confirmation/
match-detail screens. Throttled (400ms between calls, retries 429s with the
server's `retry-after`) because the dev backend rate-limits auth and booking
endpoints.
