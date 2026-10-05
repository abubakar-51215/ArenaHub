# ArenaHub — Feature Gap Report

**Date:** 2026-10-05  **Branch:** `prototype-screens`  **Checked against:** commit `93beca6`

This report lists what the backend can do that no screen uses, what the screens promise that the
backend cannot yet deliver, and how the project measures up against `03_FUNCTIONAL_REQUIREMENTS.md`.
It ends with the ten things to fix first.

## How this was made

- **Backend routes.** I read the API's own route list (`/api/v1/openapi.json`). It has **137 routes**.
- **Frontend calls.** I searched `frontend/web` and `frontend/mobile` for every API call and matched
  each one to a backend route by method and path.
- **Requirements.** I went through all 40 requirements (FR-P, FR-O, FR-A, FR-S) and checked the code
  for each one. I did not rely on `TRACEABILITY_MATRIX.md`. Where it disagrees with the code, I say so
  in section C.

**What this report cannot tell you.** It shows whether a screen *calls* a route, not whether the call
works. Mobile is paused, so mobile findings come from reading code, not from running the app. The
web results come from the Phase 5 gate in section E.

## At a glance

| Question | Answer |
|---|---|
| Backend routes | 137 |
| Used by both web and mobile | 22 |
| Used by web only (owner and admin) | 58 |
| Used by mobile only (player) | 40 |
| Used by nobody | 17 (section A) |
| Frontend calls with no backend route | 0 (section B) |
| Requirements: done / partial / missing | 24 / 16 / 0 of 40 (section C) |

---

## A. Backend features with no frontend

17 routes that no web or mobile screen calls. Some of these are fine (a payment gateway calls the
webhook, not a screen). Others leave a real hole.

### A1. Real holes: the feature exists but nobody can reach it

| Route | What it does | Why it matters |
|---|---|---|
| `POST /owner/courts/{id}/slots/generate` | Makes time slots from the arena's opening hours. | **Without slots, players see nothing to book.** No job makes them either. No web screen calls this. |
| `GET /owner/courts/{id}/slots`<br>`PATCH /owner/courts/{id}/slots/{slot}`<br>`DELETE /owner/courts/{id}/slots/{slot}` | List, block, edit and delete slots. | The owner cannot close a slot for a private event or maintenance. |
| `GET/POST /owner/arenas/{id}/blocked-dates`<br>`DELETE …/blocked-dates/{id}` | Close an arena for a whole day (holiday). | No screen. |
| `POST /complaints`<br>`GET /complaints/my` | A player files a complaint and sees their own. | FR-A-06 says players file complaints in the app. The admin screen exists, but no player screen sends one. |
| `GET /reports/my-bookings` | A player's booking history as a file. | FR-P-17. No mobile screen calls it. |

### A2. Smaller gaps

| Route | What it does | Note |
|---|---|---|
| `GET /admin/arenas/{id}` | Admin views any arena. | The queue shows enough to decide, but not the full arena. |
| `GET /admin/complaints/{id}` | One complaint's detail. | The list covers it today. |
| `POST /admin/bookings/{id}/force-refund` | Refund 100% for force majeure. | No button on the admin Bookings screen. |
| `GET /payments/{id}/events` | The payment's step-by-step history. | Useful on admin Payments. No screen. |
| `GET /owner/arenas/{id}/bookings` | Bookings for one arena. | Web uses `/owner/dashboard/bookings` instead. Not needed. |
| `GET /owner/courts/{id}` | One court. | The list covers it. Not needed. |
| `POST /webhooks/{method}` | Payment gateways call this. | Not a screen. Correct to have no frontend. |

---

## B. Frontend features with no backend

**No frontend call goes to a route that does not exist.** Every API call in web and mobile matched a
backend route (all 120 distinct calls matched).

The harder problem is the other kind: a screen calls a route, the route exists, and it still does not
do what the screen promises.

| Screen promise | What the backend really does |
|---|---|
| **Pay by card** (mobile checkout) | Stripe is set to the placeholder key `sk_test_xxx` in dev. The call fails with "Invalid API Key" and the app gets a server error (500). 27 backend tests fail for the same reason, which can hide real bugs behind the noise. |
| **Pay with JazzCash or EasyPaisa** | A built-in simulator, not the real gateways. Fine for a demo. Not for real money. |
| **Phone OTP** (phone change; "OTP to email or phone" in FR-P-01) | The backend has a text-message channel, but no text-message service. The "phone" code is sent as an email to the phone number written as an address, so it never arrives. Registration uses email only. |
| **Upload an image** | In dev it saves to disk. Outside dev the code stops with "Remote image upload is not configured". The Cloudinary upload is not written. The owner's web form only takes pasted image URLs. |
| **Notifications** (push) | Sent through Expo's push service, not Firebase directly. A documented choice, and it works. |
| **Recommendations on the home screen** | Arena lists now carry rating, review count and "from" price. The recommendation list does not, so its cards cannot show them. |
| **Near me and distance** (FR-P-04) | The backend has no distance search or sort. The app turns the phone's location into the nearest city and filters by city. The map is OpenStreetMap, not Google Maps. |
| **Owner "Reports" menu item** | Greyed out. The backend report route exists. Only the payment report is missing (FR-O-10). |
| **Forgot password** | Works today by pasting a token. The six-digit code version is built and tested but not applied. |

---

## C. Requirements matrix

Status words: **Done** (works as written), **Partial** (works, with a named gap), **Missing** (not there).
"Deviation" means the team chose to build it differently and wrote that down in `PROJECT_GUIDELINES.md`.

### Player (mobile; checked by reading code only)

| FR | Requirement | Status | Note |
|---|---|---|---|
| P-01 | Registration with OTP | Done | Email code only (see B). |
| P-02 | Login, sessions, lockout, reset | Done | Lockout is 5 tries for 15 minutes. Reset by emailed code is waiting for approval. |
| P-03 | Profile | Done | Photo upload works in dev only (see B). |
| P-04 | Search and discovery | Partial | No distance sort or filter. Map is OpenStreetMap. Recent searches exist. |
| P-05 | NLP search | Done | |
| P-06 | Arena details | Done | OpenStreetMap, not Google Maps (deviation). |
| P-07 | Real-time slots | Done | WebSocket. Needs slots to exist (see A1). |
| P-08 | Booking with distributed lock | Done | |
| P-09 | Payments | Partial | Card fails in dev. Wallets are simulators. Bank transfer was added. |
| P-10 | Booking approval | Partial | Deviation: only bank-transfer payments wait for the owner. Card and wallet bookings confirm at once. |
| P-11 | Booking history and cancel | Done | |
| P-12 | Liked arenas | Done | |
| P-13 | Equipment rental | Done | |
| P-14 | Reviews | Done | |
| P-15 | AI recommendations | Partial | Cards lack rating and price. |
| P-16 | Push notifications | Done | Deviation: Expo push, not Firebase. |
| P-17 | Reports and receipts | Partial | Receipts work. The booking-history report has no screen. |

### Arena owner (web)

| FR | Requirement | Status | Note |
|---|---|---|---|
| O-01 | Owner registration | Partial | Business name and business contact are not collected. |
| O-02 | Arena management | Partial | Works. Images are URLs only. The admin is not told about a new arena. |
| O-03 | Courts | Done | |
| O-04 | Pricing | Done | |
| O-05 | Payment configuration | Done | |
| O-06 | Booking approval | Partial | Same deviation as P-10. |
| O-07 | Bookings and calendar | Partial | The owner is not told when a player cancels. No slot or blocked-date screens (A1). |
| O-08 | Equipment | Done | |
| O-09 | Revenue and earnings | Done | Includes pending settlements. |
| O-10 | Reports | Partial | Bookings and occupancy download from the Earnings page. **No payment report.** The Reports menu item is disabled. |
| O-11 | Notifications | Partial | New-booking notices and the centre work. Cancellation notices to owners are missing. |

### Administrator (web)

| FR | Requirement | Status | Note |
|---|---|---|---|
| A-01 | Admin login | Done | |
| A-02 | User and owner management | Partial | Detail shows a booking count, not the booking history. |
| A-03 | Arena verification | Partial | Approve and reject work. **The owner is not notified of the result, or of the reason.** |
| A-04 | Booking monitoring | Done | |
| A-05 | Payment monitoring | Done | |
| A-06 | Complaints | Partial | Admin side works. No player screen files a complaint (A1). |
| A-07 | Reports and analytics | Done | |

### System

| FR | Requirement | Status | Note |
|---|---|---|---|
| S-01 | Distributed locking | Done | |
| S-02 | Real-time updates | Done | Mobile uses it. The web Live Board does not need it. |
| S-03 | Push through Firebase | Partial | Deviation: Expo push. |
| S-04 | JWT and roles | Done | Password reset now also ends old sessions. A same-second gap exists and has a fix waiting. |
| S-05 | Responsive design | Partial | Web: no page scrolls sideways at any of the four widths. Touch targets, small text and table cues fail on phones (section E3). The menu between 1024 and 1279 px waits on W16. Mobile has not been re-checked. |

**Totals:** 24 done, 16 partial, 0 missing. Two sub-points are missing outright but sit inside
partial rows: the owner payment report (O-10) and a player screen for complaints (A-06).

### Where the old matrix and the code disagree

`TRACEABILITY_MATRIX.md` marks these as fully done. The code says otherwise.

| FR | Old matrix | What the code shows |
|---|---|---|
| P-17 | Done | The booking-history route exists. No mobile screen calls it. |
| A-03 | Done | No notification is sent to the owner when an arena is approved or rejected. |
| A-06 | Done | No screen lets a player file a complaint. |
| O-10 | Done | Payment report missing. |
| P-04 | Done | No distance search. |
| O-07 | Done | Owners are not told about cancellations. |

---

## D. Fix first: top 10

Ordered by what blocks a real owner or player soonest. "Area" says where the work is.

| # | Fix | Area | Why it comes here |
|---|---|---|---|
| 1 | **Add a slot screen for owners:** generate slots, block a slot, block a date. | web | Without slots nothing can be booked. This is the single biggest gap. |
| 2 | **Make card payments fail cleanly in dev, and fix the test key setup.** | backend | A 500 error on checkout. 27 tests fail on it, so new bugs are hard to see. |
| 3 | **Write the Cloudinary upload, then add file upload to the arena form.** | backend, web | Outside dev, no image can be saved. Owners must paste URLs. |
| 4 | **Owner Reports page and the payment report.** | web, backend | FR-O-10 is only half done. The menu item is disabled. (Waiting for approval, W7.) |
| 5 | **Send the missing notifications:** arena approved or rejected (to owner), booking cancelled (to owner), new arena submitted (to admin). | backend | Owners wait with no news. Three requirements are partial because of it. |
| 6 | **Password reset by six-digit code, with the two new reset screens.** | backend, web | Built and tested. Needs approval. Forgot and reset still use the old blue shell. |
| 7 | **A player screen to file and track complaints.** | mobile (paused) | The admin side is ready and has nothing to receive. |
| 8 | **Real phone OTP** (text-message provider), then optional login by phone. | backend | The phone code is currently an email to a phone number. |
| 9 | **Distance search and sort, and list fields on recommendation cards.** | backend, mobile | FR-P-04 and FR-P-15 are partial. |
| 10 | **Owner sign-up: business name and contact.** And **admin user detail: booking history.** | backend, web | Small. Closes FR-O-01 and FR-A-02. |

Also waiting on a decision, not on work: W3 (copy), W8 (Live Board hint), W16 (menu between 1024 and
1279 px). They are listed in `ARENA-HUB-FINAL-SCOPE-LOCK.md`.

---

## E. Web gate results

Run on 2026-10-05 against a production build of `93beca6` (`next build` then `next start`), with the
dev backend on port 8000. 29 routes (7 public, 12 owner, 10 admin) at 1440, 1280, 768 and 390 px = **116 page loads**,
paced to stay under the rate limit. Owner and admin loads were signed in.

### E1. Route × viewport results

| Check | Result |
|---|---|
| Page returns 200 and stays on its own route | 116 of 116 |
| Page scrolls sideways | **0 of 116** |
| Loads with zero console errors and zero failed network calls | 108 of 116 |
| Loads that failed | 8 (two causes below) |

### E2. The 8 failed loads

| Route | Viewports | What happened | Cause | Fix |
|---|---|---|---|---|
| `/owner/courts` | all 4 | Console error: the browser refused to load a court image from `images.pexels.com`. | The page's security policy (`next.config.ts`) allows images only from this site, the API, OpenStreetMap, Cloudinary and Unsplash. One seeded court uses a Pexels link. | Data fix: use an allowed host in the seed data. Not a code bug. Allowing Pexels instead would loosen the policy, so that needs a decision. |
| `/owner/reviews` | all 4 | `GET /owner/arenas/{id}/reviews` returned 404 for all 5 arenas, which is 10 console errors per load. | **The dev backend is out of date.** It started at 09:51, before the owner-reviews route was added. The route is not in its API list. | Restart the dev backend. I have not done this: it would also load the uncommitted password-reset work, whose migration the dev database does not have yet. The route itself passes its own tests (`test_owner_arena_reviews`). |

One more note: `/owner/calendar` at 390 px hit the rate limit once and was retried after a wait. It passed on the retry.
That came from the gate's own pace, not from the page.

### E3. Phone standard at 390 px

The standard is: no sideways scroll, touch targets at least 44 px, body text at least 14 px, tables
that scroll must show a cue.

| Standard | Result | Detail |
|---|---|---|
| No sideways page scroll | **Pass**, 29 of 29 | |
| Touch targets at least 44 px | **Fail**, 29 of 29 routes (176 elements) | Almost all are the default 36 px height: icon buttons (36×36), inputs and selects (`h-9`), and small buttons (28–32 px). |
| Body text at least 14 px | **Fail**, 25 of 29 routes (228 elements) | Table headers and badges are 12 px. Stat labels on admin Dashboard and Reports are 10 px. The photo-panel chip on sign-in pages is 8.5 px. Passing: forgot password, reset password, owner Profile, admin Settings. |
| Tables scroll with a cue | **Fail** | 20 of 44 loads at 768 and 390 px have a table or grid that scrolls inside its box. None shows a cue: the last column is simply cut off (for example the owner Bookings table at 768 px). The owner Live Board is the case W8 covers. |
| Charts resize | Not measured | The two chart panels render at 390 px in the screenshots. A resize test is still to do. |
| Sticky bars do not cover content | Not measured | |

These three fails come from shared building blocks (the default button, input and table styles). A fix
there changes how every screen looks, so it needs a decision before any change.

### E4. Design-token scan

| Finding | Where | Verdict |
|---|---|---|
| Fonts | Only Archivo and Inter Tight, through `next/font`. No other font name in any component. | Pass |
| Hard-coded hex colours in components | `components/owner/charts.tsx` (9 values) | Intentional. They are a fallback if the theme read fails, and a comment says so. |
| Hard-coded hex colours in components | `components/auth/auth-photo-panel.tsx` (3 greys: `#C8D6CD`, `#B8C7BE`, `#93A69A`) | Should become tokens. Small. |
| Old blue gradient | `components/auth/auth-shell.tsx` still paints a blue overlay (`rgba(37,99,235,…)`) and uses `slate-950` and `emerald-500`. | **Fails the design rules.** Only `/forgot-password` and `/reset-password` still use this shell. The redesign (Phase 3) replaces it. |
| Default Tailwind colours | `emerald-600` in the switch and in the reset-password success text; `green-600` on the health page. | Should become tokens. Small. |
| Stale comment | `app/globals.css`, near `--primary`: "Brand blue (#2563EB…)", but the value is ink. | Fix the comment. |
| `rgba(...)` in gradients and shadows | Auth photo panel, Live Board "now" dot. | Design values tied to the lime token. Fine. |

### E5. Not yet done in this gate

The click-through of every action, and the forced loading, error, empty and long-content states
(Playwright request interception). They come next.

