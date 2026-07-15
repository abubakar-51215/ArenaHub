# ArenaHub — Development Log

A running build log. Newest entries at the top. One entry per working session:
what got done, what was tricky, and what's next.

---

## 2026-07-16 — Traceability review: liked arenas, OTP resend, System Report (Track A, Abubakar)

### Completed
- **Traceability matrix** (`docs/TRACEABILITY_MATRIX.md`): every FR in
  docs/03 mapped to backend module → API → UI → test, with an honest
  known-open-items list (recent-search history, owner business fields at
  signup, owner web notification center, occupancy report download, admin
  submission/suspension pings, Excel export, CSP headers, malware-scan
  documented gap). The review immediately caught a whole requirement no
  checklist had ever mentioned:
- **Liked Arenas (FR-P-12)** — was 100% missing despite being in docs/03,
  docs/06 §12, and the frozen API contract (doc 10). Built:
  `ArenaLike` model + `add_arena_likes` migration, `POST/DELETE
  /arenas/{id}/like` (idempotent — a double-tapped heart isn't a 409),
  `GET /arenas/liked`; mobile heart toggle on the arena detail hero +
  "Liked Arenas" screen under Profile. 3 new tests (like/unlike/list +
  cross-player isolation, unapproved-arena 404, auth required).
- **OTP resend** (functional gap flagged by external review): `POST
  /auth/resend-otp` — anti-enumeration (same response either way), 60s
  cooldown off the latest OTP's issue time, retires the outstanding code so
  exactly one is valid; "Didn't get a code? Resend" on the mobile verify
  screen. 2 new tests (fresh-code flow incl. old-code rejection, no-leak).
- **System Report** (doc 08 §9's fifth report type, previously missing):
  `type=system` on `/admin/reports` — active users, peak booking hours
  (top-3 windows by confirmed/completed bookings), popular sports (fanned
  out from courts' JSONB sport lists), plus platform totals. New platform
  queries in the admin repository; web Reports page gained the option.
  2 new tests (all-types loop now covers it + a content assertion).
- Also fixed while in the PDF path: `_admin_revenue_rows` used an em dash
  for a missing arena name — fpdf's core Helvetica is latin-1, so the first
  orphan payment row would have crashed PDF rendering.

### Challenges
- Expo typed routes for the new `/profile/liked` screen wouldn't regenerate:
  `expo export` under `CI=1` skips typegen entirely, and even without CI the
  export didn't refresh `.expo/types/router.d.ts` — only a (briefly started,
  then killed) `expo start` dev server rewrote it.
- The resend cooldown can't compare `OtpVerification.created_at` (naive,
  server-set) against the service's aware UTC clock — derived issue time as
  `expires_at - OTP_TTL` instead, which lives in the same tz convention the
  verify path already compares against.

### Next
- Deployment phase (Docker Compose, production config, APK/AAB, manuals) —
  the only remaining block, per the traceability matrix's open-items list.
- Small polish candidates from the matrix's ⚠️ rows if time allows before
  submission (owner web notification center is the most visible one).

---

## 2026-07-15 — Notification module, report module, platform Settings tabs (Track A, Abubakar)

### Completed
- **`modules/notification/`** (new): `Notification` + `DeviceToken` models +
  migration, in-app notification center (list with unread count, mark-one/
  mark-all read), Expo push device registration. `shared/notify.notify_user`
  (previously a console-log stub) now persists a real notification row and
  best-effort delivers it over push + email, gated per-category on the
  existing `User.notification_preferences` JSONB — every existing call site
  (booking confirm/cancel/payment-failed, payment refund-initiated, owner
  new-booking, 24h/1h reminders) got a real backend for free. Added a
  `booking_cancelled` notification (previously missing).
- **Push delivery**: `app/integrations/push` — the mobile app is a managed
  Expo project (no native android/ios folders), so device tokens are Expo
  push tokens; delivery goes through the Expo Push service, not raw FCM — no
  Firebase project or server key needed. Mobile: `expo-notifications` +
  `expo-device` installed, `usePushRegistration` hook requests permission and
  registers the token on login, notification center screen (`notifications.tsx`)
  rewired from the old booking-derived mock feed to the real API.
- **Email delivery**: `app/integrations/email` (stdlib `smtplib` over a worker
  thread — dev logs instead of a real SMTP connection, same seam as OTP
  delivery). `shared/otp.py`'s `deliver_otp`/`deliver_reset_link` now actually
  email outside dev instead of only logging "requested".
- **`modules/report/`** (new): CSV/PDF export for a player's own booking
  history (`/reports/my-bookings`), an owner's bookings + revenue across
  their arenas (`/owner/reports`, optional arena/date filters), and
  platform-wide admin reports (`/admin/reports?type=users|bookings|revenue|
  arenas`) — all built from the same repositories the dashboards already
  query, nothing new persisted. Wired real Export CSV/PDF buttons into the
  owner Earnings page and the admin Reports page (both were placeholder
  text before).
- **Admin platform Settings**: extended `PlatformSettings`' free-form JSONB
  with `email`/`sms`/`payment_gateways`/`booking_policy`/`notifications`
  sub-objects (no migration needed) and wired the previously-stubbed Email,
  SMS, Payment Gateways, Booking Settings, and Notifications tabs to real
  save/load — SMTP credentials and gateway secrets stay server-side in env
  vars per the existing convention; these tabs are enable/disable toggles and
  policy defaults only.
- **Verified**: backend full suite green (98 tests, 6 new for reports) +
  ruff/black/mypy clean on every touched/new file; new migration applied
  forward on both dev and test databases; web + mobile `tsc --noEmit` clean,
  `eslint`/`expo lint` clean, prettier-formatted.
- **Loose-ends batch (same day, after review):**
  - **GPS location detection (mobile)**: `expo-location` + a small location
    store — detects coordinates, snaps to the nearest supported city by
    Haversine (rejected beyond 60 km so e.g. Peshawar isn't mislabeled
    Islamabad). Home header shows a tappable location pill and scopes
    recommendations to the detected city; Search gains a "📍 Near me" chip.
  - **Admin review moderation**: `/admin/reviews` moderation queue (backend
    `admin_router` on the review module — list flagged reviews with
    reviewer/arena/reporter names, dismiss endpoint; admin deletes and
    dismissals now write audit-log entries) + a dedicated web page (queue
    table, dismiss / confirm-delete dialog) and a "Reviews" sidebar entry.
    2 new tests.
  - **Backup before migration**: `backend/scripts/backup_db.py` (pg_dump
    custom-format snapshot into gitignored `backend/backups/`, finds the
    Windows Postgres install if bin/ isn't on PATH, `SKIP_DB_BACKUP=1` to
    bypass); `npm run migrate`/`migrate:down` now back up first, new
    `npm run db:backup`; also fixed the root `seed` script, which pointed at
    a nonexistent `scripts.seed` module.
  - **Alternatives-when-full**: confirmed already shipped (slots screen shows
    "Fully booked — try these nearby" from the recommendations endpoint) —
    no work needed, checklist item closed by inspection.
  - **Documented design decisions, then implemented anyway** (deviations
    #21–23): first written up as accepted gaps — trending-by-rating instead
    of by-recency, suspend instead of delete, no complaint assignment. A
    second look (all three were cheap, ~2 hours total) turned them into
    real features instead, and the deviations were rewritten to describe
    what's actually built rather than what's deliberately skipped:
    - **Trending**: `GET /arenas/trending?days=&city=&limit=` ranks by
      non-cancelled/rejected booking count in the window, falling back to
      the rating sort when nothing was booked (cold-start data doesn't
      show an empty section). Mobile: a "Trending Now" carousel on Home,
      distinct from "Recommended for You" (personalized) and "Popular
      Arenas" (all-time rating). 2 new tests (ranking + fallback).
    - **Admin delete user**: `DELETE /admin/users/{id}` is a scrubbing
      soft-delete — `deleted_at`/`is_active=false` (already enforced at
      login) plus overwriting name/email/phone/avatar/bio with anonymized
      placeholders, so bookings/payments/refunds/reviews/audit logs that
      FK to the user stay intact. Reads as a real delete in the admin
      panel (Delete button + confirm dialog, account vanishes, can't log
      back in); admin accounts are exempt (403). 2 new tests.
    - **Complaint assignment**: `complaints.assigned_to` (nullable FK,
      `SET NULL`) auto-sets to whichever admin's response is first —
      no assignment UI needed for one admin. Web complaints page shows
      an "Assigned To" column + the assignee in the respond dialog. 1 new
      test (assignment sticks to the first responder, a second admin
      responding doesn't steal it).

### Challenges
- `notify_user` originally opened its own DB session via the app's
  module-level `SessionFactory` (mirroring the scheduler jobs' pattern) —
  broke under pytest with "Event loop is closed", since that engine is bound
  to whatever event loop was live at first use, and pytest-asyncio hands each
  test function a fresh loop. Fixed by having `notify_user` take the caller's
  already-open `db` session instead of opening a second one; in production
  there's only one event loop for the process, so this was purely a test
  artifact, but the fix is also simpler and avoids an extra connection.
- The new `notifications`/`device_tokens` migration was applied to the dev
  database but the test suite pointed at `arenahub_test`, which still lacked
  the tables (`UndefinedTableError`) until it was migrated separately —
  reran `alembic upgrade head` against `TEST_DATABASE_URL` explicitly.

### Next
- Merge today's `abubakar` work with `umer`'s admin-panel batch, run the
  combined gate, then hand off the `abubakar` → `main` PR text.
- Remaining checklist gaps: Docker/deployment (deferred to Sprint 5 per
  deviation #1), review moderation as its own admin surface (currently
  piggybacks on `/owner/reviews`).

---

## 2026-07-15 — Owner Profile page, mobile Settings, complaint module, admin backend + panel (Track B, Umer)

### Completed
- **Owner web Profile page** (`/owner/profile`): basic-info edit, OTP-gated
  email/phone change, OTP-gated password change (forces re-login after, same
  contract mobile already uses). Sidebar's disabled "Settings" placeholder now
  points here.
- **Mobile Settings screen**: notification-preference toggles (push/email/
  match-invites, stored in the existing free-form `notification_preferences`
  JSONB), OTP-gated email/phone change reusing the same backend flow as
  Personal Information, and delete-account. Wired to the profile tab's
  previously-dead "Settings" menu item.
- **`modules/complaint/`** (new): `Complaint` model + migration, categories
  per docs/08 (booking/payment/arena-quality/owner-behavior/technical/other),
  player submit + list-own, admin list-all (status/category filters) +
  respond (sets status + `resolved_at`).
- **Admin backend expansion** (`modules/admin/`): user management (list with
  role/status/search filters, detail with booking count, suspend/reactivate
  with reason), platform-wide booking + payment monitoring with filters,
  dashboard metrics endpoint (users/arenas/bookings/revenue/open complaints),
  an audit log (every admin action — arena approve/reject, suspend/
  reactivate, complaint respond, settings update — recorded with actor +
  free-form details) with a browse endpoint, and a minimal platform-settings
  singleton (General tab fields only — email/SMS/gateway/booking-policy tabs
  aren't backed by endpoints yet, called out explicitly in the UI rather than
  faked).
- **Admin web panel** (`/admin`, own route group + login page + sidebar,
  matching `design/wireframes/Admin.PNG`): Dashboard, Users, Arena Owners
  (same view, role-filtered), Arenas (verification queue moved off the old
  bare API), Bookings, Payments, Complaints (respond dialog with status +
  category filters), Reports & Analytics (live metrics; download buttons wait
  on the report module), Settings (General tab live, Security tab shows the
  audit log, other tabs marked not-yet-wired instead of faking a save).
- **Verified**: backend 92 tests green (9 new for complaint + admin) +
  ruff/black/mypy clean; both new migrations forward→backward→forward on
  both dev and test databases; web `tsc --noEmit` and `eslint` clean against
  freshly-regenerated route types; every admin route smoke-tested at 200 via
  a local dev server; mobile `tsc --noEmit`, `expo lint`, and `expo export`
  clean.

### Challenges
- `umer` didn't have `abubakar`'s mobile app at all (auth/booking/profile
  screens) — the mobile Settings screen needs a profile screen to live next
  to. Fast-forward merged `abubakar` → `umer` first (no conflicts) so the
  branch has a real base to extend, before doing any of today's work.
- `next build` (production) fails in this sandbox: `next/font` can't reach
  Google Fonts (no outbound network here). Not a code defect — `next dev`
  compiles and serves every new route at 200, and `tsc`/`eslint` are clean.
  Flagging so it isn't mistaken for a real build break in an environment with
  normal internet access.
- Settings' non-General tabs (Email/SMS/Payment Gateways/Booking Settings/
  Notifications) are in the wireframe but not in the frozen API spec or
  master plan detail — built the General tab + audit log for real, left the
  rest as explicit "not wired yet" notices rather than inventing endpoints or
  shipping dead Save buttons.

### Next
- Merge `umer` → `abubakar` (integration branch), run the combined gate
  (backend tests + web build) since the admin panel touches shared web code,
  then hand off `abubakar` → `main` PR text (Umer's batch).
- Abubakar (Track A): `modules/notification/` (FCM push, email, in-app
  center), `modules/report/` (PDF/CSV report sets), and confirming the
  AI→mobile wiring (home recommendations, search).

---

## 2026-07-15 — Matchmaking (backend + Play tab), booking/profile gap-closing, peak-pricing visibility + map (Track A, Abubakar)

### Completed
- **Matchmaking backend** (`modules/match/`): `Match`/`MatchParticipant`
  models + `add_matches` migration, endpoints for create / list-open (city,
  sport, date filters) / mine (created vs joined) / detail / join / leave /
  cancel. A match is a lightweight social listing — it does not reserve the
  court (no slot FK, no payment). Creator auto-joins; hitting `max_players`
  flips status to `full`; creator leaving cancels for everyone. Full test
  file added (`tests/modules/test_match.py`).
- **Scope change recorded**: matchmaking was listed under "Excluded Features"
  in docs 01/Requirements — moved into scope as PROJECT_GUIDELINES deviation
  #20 (team decision), and both spec docs updated.
- **Mobile Play tab**: replaced the "Coming Soon" placeholder with the full
  wireframe-10 flow — Open Matches (sport filter, join) / My Matches
  (created + joined, status badges), match detail with participants and
  join/leave/cancel, and a Create Match flow (arena search → court → sport →
  date strip → hour chips → max-players stepper).
- **Booking-flow gaps** (all four had complete backends, zero mobile UI):
  discount-code field at checkout; multi-slot selection (toggle, 8-slot cap
  matching `MAX_SLOTS_PER_BOOKING`); reschedule (button on eligible booking
  cards + same-court slot-picker screen); receipt-PDF download via the
  native share sheet (`expo-file-system` + `expo-sharing` added). One small
  additive endpoint: `GET /payments/by-group/{id}` to resolve a payment from
  a booking group.
- **Profile gaps**: change-password screen driving the OTP-gated two-step
  backend flow (forces re-login since the backend revokes all sessions);
  avatar upload (players' upload allow-list widened to `avatars`, picker in
  Personal Information, real photo shown on the profile tab); payment
  history — built the spec'd-but-missing `GET /payments/my` (repo + schema +
  route + tests) and a new mobile screen with per-payment receipt download.
- **Peak-pricing visibility**: new public `GET /courts/{id}/pricing-rules`
  (active rules only, approval-gated); arena detail court cards list peak
  windows ("Peak: Sat 18:00–23:00 ×1.5"); slot chips now show each slot's
  actual price with an amber flash marker on peak-priced slots.
- **Arena Detail map**: new Location section — full street address, a static
  OpenStreetMap tile-mosaic map with pin (`components/static-map.tsx`, pure
  JS slippy-map math, works in Expo Go), and a Get Directions deep link into
  the device's maps app.
- **Verified**: backend 86 tests green + ruff/black/mypy clean; mobile
  `tsc --noEmit`, `expo lint`, and full `expo export` bundle builds clean.

### Challenges
- The pre-existing match module code had three real bugs that only surfaced
  once tests existed: a stale identity-map read after join (fixed with
  `populate_existing`), SQLAlchemy auto-correlating away the participant-count
  subquery in `/matches/mine` (fixed with an alias), and an async lazy-load
  crash on `Match.creator` (fixed with `selectinload`). Reinforces the
  write-tests-before-trusting rule.
- `react-native-maps` is a native module that can't run in Expo Go — adopting
  it would have forced the whole team onto custom dev builds. Decision:
  static OSM raster tiles + directions deep link instead; deviation #8
  updated to record it.
- Players were hard-blocked from uploading anything but `receipts`, so avatar
  upload 403'd until the media allow-list gained an `avatars` folder.
- Two endpoints the API spec promises simply didn't exist (`GET /payments/my`,
  player-visible pricing rules) — both built additively; the frozen `/api/v1`
  contract only gained routes/fields, nothing changed shape.

### Next
- Umer (Track B): admin backend (players/owners/arenas/bookings/payments/
  analytics/audit log), admin web dashboard, and the owner web Profile page.
- Merge `abubakar` → `main` after review (merge commit, per team convention).

---

## 2026-07-14 — Web auth pages + owner dashboard UI, ahead of schedule (Track B, Umer)

### Completed
- **Web auth pages**: `/register` (owner sign-up with OTP verification, then
  auto-login), `/forgot-password`, `/reset-password` (token from a `?token=`
  link or pasted manually, since no email provider exists yet) — the login
  page's "Sign up"/"Forgot Password?" links were dead `href="#"` placeholders
  with no pages behind them at all; both are now real, working flows.
  Factored the shared two-column branded shell into `AuthShell` so all four
  auth pages (login included) stay visually consistent.
- **Owner dashboard web UI** — pulled forward from Sprint 4 since last
  session's backend (`modules/dashboard/`, `modules/review/`) was already
  done and idle. Dashboard home now shows live summary widgets instead of
  the Sprint 1 placeholder cards; new `/owner/bookings` (cross-arena
  booking-approval queue with approve/reject), `/owner/calendar`,
  `/owner/revenue` (by-arena/by-court breakdown), and `/owner/reviews`
  (respond to a review) pages. Sidebar's disabled Bookings/Calendar/
  Earnings/Reviews entries are now working links.
- **Verified against the live backend, not just typecheck** — built a real
  fixture (arena → admin-approve → court → today's slots → one card booking,
  one bank_transfer booking) and drove every new endpoint (summary,
  pending-approvals, calendar, revenue, approve) through curl exactly as the
  new pages call them, confirming the data shapes and mutation
  side-effects (approving a payment correctly dropped `pending_approvals`
  and bumped `monthly_revenue`) before committing.

### Challenges
- Repeated confusion this session about "why isn't the OTP showing in my
  terminal" — root cause was that whichever backend process happened to be
  serving port 8000 kept switching between a hidden background instance
  (started for quick verification, output only visible in a log file) and
  the user's own visible terminal instance, with no indication of which one
  was live at any given moment. Settled on: the user runs their own
  `uv run uvicorn app.main:app --reload` in a visible terminal for anything
  they need to watch live; hidden background instances are only for
  Claude's own pre-commit verification, and get torn down afterward.
- Clarified the web/mobile split for anyone testing going forward: web is
  owner + admin only, by design — booking/payment/review-*submission* will
  never have a web page, only Swagger (now) or the mobile app's booking flow
  (Sprint 4, not yet scaffolded) can drive those. Owner-side review
  *responses* and the dashboard, by contrast, are legitimately web, which is
  why they got pulled forward this session instead of waiting.

### Next
- Update docs/06 §14 to match the implemented review behavior (still
  outstanding from last session).
- Sprint 4 mobile: none of the player-facing flow (auth, search, booking,
  payment, review submission) has any mobile screens yet beyond the Sprint 1
  health check — that's real, unscaffolded work, not something pulled
  forward like the web dashboard was.

---

## 2026-07-14 — Sprint 3 close-out: reviews + owner dashboard (Track B, Umer)

### Completed
- **`modules/review/`** — submit (completed-booking gated, one per booking via
  a unique `booking_id` constraint), edit (30-day window)/delete (own review,
  or admin), owner response, report/flag (idempotent — a second report is a
  no-op, not an error), and a live rating-recompute aggregate (`AVG`/`COUNT`
  over `reviews`, not a cached column — `arenas` has no rating field, matches
  docs/09 exactly). `rating` is a plain `Integer` + `CHECK(1-5)`, not a
  SQLAlchemy `Enum` — sidesteps the ENUM-downgrade trap that hit Sprint 1-3
  migrations repeatedly. Migration `add_reviews`. The 30-day window, owner
  response, and report/flag aren't in docs/06 at all, only in
  MASTER_DEVELOPMENT_PLAN.md's Track B scope — built to the master plan per
  its source-of-truth precedence.
- **Owner dashboard** (`modules/dashboard/`, no new tables — pure read-side
  composition over bookings/payments/arenas): summary widgets (arenas owned,
  bookings today/this month, monthly revenue, pending approvals), a
  cross-arena booking-approval queue (`GET /owner/dashboard/pending-approvals`
  — the approve/reject *action* already existed in `payment.service` from
  Sprint 3; nothing previously listed the queue across more than one arena at
  a time), a per-arena calendar (`GET /owner/arenas/{id}/bookings/calendar`),
  and revenue widgets (total, pending settlements = unsettled advance
  balances, breakdown by arena/court). Revenue joins `payments` to `bookings`
  via `booking_group_id` since `Payment` carries neither `arena_id` nor
  `court_id` directly.
- **`booking_service.complete_finished_bookings`** — a fourth APScheduler job
  (every 15 minutes, alongside auto-cancel/reminders/cleanup) that transitions
  `confirmed` bookings whose slot end time has passed to `completed`. This
  replaces the earlier same-day workaround (see Challenges) with the properly
  layered fix: `booking.service` now owns the only path to `completed`, and
  `review.service` just checks `booking.status == completed`, no mutation.
  New repository query `list_confirmed_on_or_before`; `booking_date`/`end_time`
  are separate columns, so the exact cutoff is still resolved in Python, same
  pattern as the existing reminder-window query.
- **Verified end-to-end:** ruff + black + mypy clean; **75 pytest** green
  (test_review.py + test_dashboard.py new, plus one new scheduler-job test for
  the completion sweep, everything else still passing) against fresh
  Postgres 18 + Redis; `add_reviews` migration verified
  upgrade → downgrade → upgrade cleanly.

### Challenges
- **No booking ever reached `completed`.** Nothing in `booking.service` (Track
  A, Sprint 3) transitioned a booking past `confirmed` — reviews require
  `completed` per docs/06 §14 and had no way to ever fire. Initially patched
  narrowly inside `review.service` (complete-on-read when a `confirmed`
  booking's slot end time had passed), flagged as a stopgap. Superseded later
  the same session by the proper fix above — a dedicated scheduler job in
  `booking.service`, so completion lives with the rest of the booking state
  machine instead of leaking into the module that merely reads it.
- **`MissingGreenlet` on edit/owner-response.** `ReviewResponse` exposes
  `updated_at`, which uses `onupdate=func.now()`; after `db.commit()` on an
  UPDATE (not an INSERT), the value isn't eagerly returned the way
  server_default is on insert, so touching the attribute triggered an
  implicit synchronous lazy-refresh outside of a greenlet context. No
  existing module's response schema had hit this before (`BookingResponse`
  doesn't expose `updated_at` at all). Fixed with an explicit
  `await db.refresh(review)` after commit in both mutating paths.
- Removed a stray, never-committed `backend/.gitignore` (`backups/`) — fully
  redundant with the root `.gitignore`'s recursive `backups/` pattern.

### Next
- Update docs/06 §14 to match what's implemented (30-day edit window, owner
  response, report/flag) — currently only in MASTER_DEVELOPMENT_PLAN.md, not
  in the detailed player-module spec. Housekeeping before final submission,
  not a code change.
- Track B remaining for Sprint 4: mobile UI polish (onboarding, home, search,
  filters and map, arena cards, responsive), notifications UI, profile and
  settings screens, remaining owner dashboard polish (charts, equipment and
  review-response UI, payment config) once the Next.js web scaffold catches
  up.
- Once Abubakar's PR #10 (Sprint 3 booking/payments) merges to `main` and
  v0.3.0/v0.4.0 are tagged, the `/api/v1` freeze takes effect — this
  session's new endpoints (reviews, dashboard) are additive-only, so no
  conflict, but land them before the freeze to be safe.

---

## 2026-07-14 — Sprint 3: Booking engine, Redis locking, payments &amp; live updates (Track A, Abubakar)

### Completed
- **`modules/slot/`** — auto-generate hourly slots from the arena's
  `operating_hours` (skips closed weekdays + blocked dates, idempotent re-runs),
  owner manual edit/block/delete (guarded once a slot has an active booking),
  public per-court/date listing. Migration `add_time_slots`.
- **`cache/locking.py`** — Redis distributed lock (`SET key token NX PX 30000`
  per docs/11) with check-then-delete release (no Lua — fakeredis has no
  scripting support without the optional `lupa` dep, not worth adding just for
  a test double; the race window is self-healing via the 30s TTL).
- **`modules/booking/`** — multi-slot checkout (one row per slot, grouped by
  `booking_group_id` — keeps docs/09's direct `slot_id` FK per row while still
  letting one payment cover several slots), pricing (base → peak → discount,
  `shared/pricing.py`), advance/full payment split against arena config,
  cancel-with-refund-tier resolution (`shared/refunds.py`), reschedule, and an
  `auto_cancel_stale_bookings` sweep. Migration `add_bookings`.
- **`modules/payment/`** — `PaymentProvider` interface
  (`integrations/payments/`): Stripe runs the real API in test mode when
  `STRIPE_SECRET_KEY` is set, else a deterministic dev simulation (same seam
  pattern as `shared/otp.py`'s console OTP delivery); JazzCash/EasyPaisa are
  documented simulators (FYP risk-register-sanctioned — no merchant sandbox
  access). Webhook auto-confirm for card/JazzCash/EasyPaisa (idempotent —
  retried webhooks no-op); bank_transfer receipt upload → owner
  approve/reject; refunds (auto on cancel + admin force-refund); receipt PDF
  (fpdf2). Migration `add_payments_and_refunds` (+ `bookings.qr_code_url`).
- **QR codes** — generated on booking confirmation via `shared/qr.py`
  (`qrcode` lib), reusing the existing image-storage seam.
- **`websocket/`** — per-court channel (`/ws/courts/{court_id}/slots`);
  booking/payment services broadcast on every slot status change.
- **`tasks/scheduler.py`** — APScheduler jobs wired into the app lifespan:
  auto-cancel stale `pending_payment` bookings (30 min), 24h/1h reminders (15
  min, console-logged via a new `shared/notify.py` stand-in for the Sprint 5
  notification module), expired OTP/reset-token cleanup (60 min).
- **Verified end-to-end:** ruff + black + mypy clean (117 files, app + tests);
  **53 pytest** (incl. the mandatory concurrency test — two simultaneous
  booking attempts on one slot, exactly one succeeds — plus payment/webhook/
  refund/QR/websocket-manager/scheduler-job coverage) green against a fully
  fresh Postgres 18 + Redis, matching CI exactly; both new migrations verified
  upgrade → downgrade → upgrade on a fresh DB (schema dumped first per backup
  policy); live WebSocket connection smoke-tested.
- **PR #10** (`abubakar` → `main`) opened.

### Challenges
- **Postgres ENUM reversibility** bit again (same trap as Sprint 1/2): both
  new migrations' `create_table` calls implicitly create ENUM types that
  `drop_table` doesn't drop; added explicit `sa.Enum(...).drop(checkfirst=True)`
  calls to each `downgrade()` (4 enum types across the two migrations).
- **structlog `event` kwarg collision** — `shared/notify.py`'s
  `notify_user(user_id, event, **context)` passed `event=event` straight into
  `log.info(...)`, colliding with structlog's own internal `event` kwarg
  (the log message itself). Renamed to `notification_type` in the log call.
  Caught by the new reminder/refund tests, not by manual smoke-testing.
- **CI red after push, green locally** — `mypy app/` (what I'd been running)
  passed, but CI runs `mypy .` (whole `backend/`, including `tests/`), which
  failed on an untyped `**arena_overrides` kwarg in a Sprint 3 test helper
  (`disallow_untyped_defs = true` applies repo-wide). Reproduced the exact CI
  job locally (fresh DB, fresh Redis index, identical env vars and step
  order) to confirm it was the *only* gap — lint/format/migrations/pytest were
  already clean on a truly empty DB. Fixed the annotation, repushed.
- Multi-slot booking's schema shape (one `Booking` row per slot vs. one row
  spanning several slots) isn't specified in docs/09 — asked the user;
  decided on one-row-per-slot + `booking_group_id`, since it keeps the direct
  `slot_id` FK doc/09 already has and per-slot locking/availability simple.

### Next
- **You merge PR #10** (merge commit, preserving authorship) once CI is green,
  then tag **v0.3.0** "Booking Engine" and **v0.4.0** "Payments" on `main`.
- **⛔ API freeze** takes effect once v0.4.0 is tagged — `/api/v1` is frozen to
  bug fixes / non-breaking additions from here (protects Sprint 4-5 frontend
  work).
- **Track B (Umer)** still open: `modules/equipment/`, `modules/review/`,
  owner dashboard booking-approval panel + calendar + revenue widgets. The
  booking module's equipment-addon slot is deliberately left unwired until
  `modules/equipment/` exists — integration checkpoint once his side lands.
- Flagged, not yet addressed: the reminder job has no send-tracking (a
  booking starting exactly on a lead time could double-notify across two
  scheduler runs) — the real Sprint 5 notification module should add it.
  JazzCash/EasyPaisa remain simulators pending real merchant credentials.

---

## 2026-07-13 — Sprint 2 close-out: merged to main, both teammates signing off

### Completed
- **PR #6** (`umer` → `abubakar`) and **PR #7** (`abubakar` → `main`) both merged
  (merge commits, preserving Umer's authorship) — Sprint 2 (Track A auth +
  Track B arena/court/pricing/verification, backend + web) is now fully on
  `main`. Verified: arena/court modules and the owner web dashboard present in
  `origin/main`; all local branches (`main`, `abubakar`, `umer`) fast-forwarded
  and in sync with `origin`; working tree clean.
- Manual QA session over the owner dashboard surfaced and fixed two real bugs
  (auth-store hydration deadlock leaving pages stuck on "Loading…" forever;
  an app-wide broken font-variable reference) plus a login-page redesign to
  match the wireframe and idempotent dev seed data
  (`backend/scripts/seed_dummy_data.py` / `clear_dummy_data.py`) — see the
  "Owner web dashboard" and "Arena/court/pricing backend" entries below for
  detail; the fix/redesign/seed commit is `545a772`.
- Progress checked against `MASTER_DEVELOPMENT_PLAN.md`'s own tracking table:
  **Sprints 1-2 done (~40% overall)**; Sprints 3-5 (booking engine/payments,
  mobile app + AI, admin panel/reports/deploy) not yet started.
- Dev servers (backend `:8000`, web `:3000`) stopped cleanly at session end.

### Challenges
- No version tags exist on the repo yet, despite the plan calling for
  `v0.1.0`/`v0.2.0` at each sprint boundary — flagged to the user; tagging
  `v0.2.0` "Authentication" (and possibly a retroactive `v0.1.0`) is
  outstanding, not yet done as of this entry.

### Next
- Tag `v0.2.0` "Authentication" on `main` (and decide on a retroactive
  `v0.1.0`).
- Sprint 3 (Track A: booking engine, Redis locking, payments; Track B:
  equipment, reviews, owner booking views) — the biggest remaining sprint;
  ends with an API freeze on `/api/v1`.

---

## 2026-07-13 — Sprint 2: Owner web dashboard — auth + arena/court/pricing UI (Track B, Umer)

### Completed
- **Auth flow (web):** login page rebuilt to match `ArenaOwners.PNG` screen 1
  (two-column: form + branded panel, "Welcome Back!", "Manage. Grow. Thrive.").
  Wired to `POST /auth/login` → `GET /users/me`; owner-only (non-owners are
  rejected). JWT pair persisted via a Zustand store (`store/auth.ts`,
  localStorage); logout hits `POST /auth/logout` then clears.
- **Typed API client** (`services/api.ts`) — authed `apiRequest` attaching the
  bearer token and **transparently refreshing once on 401** (`/auth/refresh`)
  before failing; throws a typed `ApiError` carrying the envelope message. Per-
  domain fetchers (`services/{auth,arenas,courts,pricing}.ts`) + TanStack Query
  hooks (`hooks/use{Arenas,Courts,Pricing}.ts`) with cache invalidation.
- **Owner shell** (`app/owner/layout.tsx`) — sidebar matching the wireframe
  (Dashboard/Arenas/Courts/Bookings/Calendar/Pricing/Earnings/Reports/Reviews/
  Settings/Logout); in-scope routes link, the Sprint 3+ ones render as disabled
  placeholders (honest, not fake). Client-side role guard after store
  rehydration (tokens are in localStorage, invisible to edge middleware — noted
  in `middleware.ts`).
- **Manage Arenas** (screen 3) — table (name/city/location/courts/status/
  actions) + full **Add/Edit Arena** dialog: operating hours per weekday,
  sports, payment config (advance %, full-payment, **refund tiers** editor),
  image URLs; row actions Edit / Deactivate / Resubmit-when-rejected (shows the
  rejection reason).
- **Manage Courts** (screen 4) — arena selector (deep-links from the arenas
  table via `?arena=`), court cards with image/sports/price + availability
  toggle, and **Add/Edit Court** dialog.
- **Pricing Management** (screen 7) — peak-pricing rules aggregated across the
  selected arena's courts (Court/Rule/Day/Time/Multiplier/Status) + **Add
  Pricing Rule** dialog (court, day, time window, multiplier).
- **Dashboard** (`/owner`) — real portfolio summary (arena counts by status,
  sports, recent arenas). Booking/revenue analytics are deferred to the booking
  engine rather than mocked.
- **UI primitives** added to match the scaffold's cva/cn style: input, label,
  textarea, select, switch (radix), table, dialog (radix); brand `Logo`.
- **Verified:** `tsc --noEmit`, `eslint`, `prettier --check`, and
  `next build` (12 routes) all clean; `next start` serves `/login` +
  all `/owner/*` at 200. **Live cross-origin flow** against the running backend
  (web origin → :8000): register→verify(dev OTP)→login→`/users/me`(owner)→
  create arena(pending)→listed in my-arenas→**excluded from public search while
  pending**. Test data cleaned from the dev DB afterward.

### Challenges
- A `*/schema.py` glob inside a `/** … */` doc comment **closed the block
  comment early** and broke the TS parse — reworded to `<name>/schema.py`.
- Zustand persist: setting the `hydrated` flag by mutating state in
  `onRehydrateStorage` doesn't notify subscribers; switched to
  `useAuthStore.setState({ hydrated: true })` so the guard re-renders once
  tokens load.
- `useSearchParams` (courts deep-link) needs a Suspense boundary in Next 15 —
  wrapped the page body.
- Tailwind 4 renamed `bg-gradient-*` → `bg-linear-*` (lint caught it).

### Next
- Backend + web for Sprint 2 Track B are complete. Push `umer`; **Abubakar
  reviews, then merges `abubakar` → `main`** (merge commit) and tags **v0.2.0**
  "Authentication" once both tracks integrate.
- Follow-ons (later sprints): real image upload UI (multipart → `/uploads/image`
  seam already exists), and the booking-dependent owner screens (Bookings,
  Calendar, Earnings, Reports, Reviews).

---

## 2026-07-13 — Sprint 2: Arena / court / pricing / verification backend (Track B, Umer)

### Completed
- **`modules/arena/`** (schema/repository/service/api) — owner arena CRUD with
  ownership guards, operating hours (per-weekday open/close, validated),
  amenities linking, payment config (advance %, full-payment flag, cancellation
  **refund tiers** JSONB), image URLs, and the owner-side status transitions
  (create → `pending`; resubmit `rejected` → `pending`). Public discovery
  (`GET /arenas`, `GET /arenas/{id}`) returns **approved + active only** with
  city/sport/name filters + pagination (the FR search stub).
- **`modules/court/`** (schema/repository/service/api) — court CRUD (ownership
  derived from the parent arena), availability toggle, base pricing, court
  images, and **peak-pricing rules** (`court_pricing_rules`: weekday + time
  window → multiplier) for the Sprint 3 booking engine to resolve.
- **Discount codes** (`discount_codes`, per-arena, unique code) — percentage or
  fixed, optional usage cap / validity window / min-spend; codes normalised to
  upper-case; over-100 % percentage rejected. **Blocked dates**
  (`arena_blocked_dates`, unique per arena+date) for maintenance/closures.
- **`modules/admin/`** verification slice — queue by status (FIFO), view any
  arena, approve, and **reject-with-reason** (reason required); reuses
  `arena.service.set_status` so the state machine has one implementation and
  `require_role("admin")` for RBAC.
- **Image upload seam** (`shared/storage.py` + `POST /uploads/image`) — dev
  writes to a gitignored local `uploads/` dir served via a `/uploads` static
  mount; Cloudinary is the prod seam. Type allow-list (JPEG/PNG/WebP), 5 MB cap,
  folder allow-list (no path traversal). Mirrors the `shared/otp.py` pattern.
- **Shared helpers** — `shared/pagination.py` (uniform `items/total/page/
  page_size` inside the envelope) reused by every list endpoint.
- **Migrations** `7c1e9a4b2d10` (pricing + discounts: arena `refund_policy`,
  court `description`/`images`, `discount_codes` + `discount_type` enum,
  `court_pricing_rules`) and `9f3a6b5c8e21` (`arena_blocked_dates`) — both
  hand-written, reversible; **up → down → up verified** on the real DB (schema
  dump taken first per backup policy), and `alembic check` reports **no drift**.
- **Verified end-to-end:** ruff + black + mypy clean (56 files); **19 pytest**
  (8 new: owner-registers→admin-approves→public-search, reject-needs-reason +
  resubmit, player→403, cross-owner→403, blocked-date + discount conflicts,
  court CRUD + availability, peak-rule lifecycle, public-courts-after-approval)
  green against real Postgres; live server smoke — healthy `/health`, all 12
  new routes in `/docs`, `/uploads` static mount 404s cleanly, unauth create
  → 401, public search → 200.

### Challenges
- `DiscountCode.valid_from/valid_until` used a **string forward-ref**
  (`Mapped["datetime | None"]`) with `datetime` imported only under
  `TYPE_CHECKING`; SQLAlchemy evaluates mapped annotations at mapping time and
  couldn't resolve it. Fixed by importing `datetime` at runtime.
- `python-multipart` wasn't a dependency — `UploadFile` needs it; added it.
- The `discount_type` enum needs an explicit lifecycle (`create(checkfirst)` /
  `drop()`) in the migration, same reversibility trap as the Sprint 1 ENUMs —
  `create_table`/`drop_table` alone would leak the type on downgrade.
- Aligned the upload dir to the pre-existing `backend/uploads/` gitignore entry
  (`MEDIA_ROOT=uploads`) instead of adding a new `media/` ignore.

### Next
- **Web (Track B remaining):** login + protected owner shell + arena/court/
  pricing forms per `design/wireframes/ArenaOwners.PNG` — consumes these
  endpoints. (Backend for Sprint 2 Track B is complete.)
- Merge `umer` → `abubakar`, run the combined gate, then PR `abubakar` → `main`
  (merge commit) and tag **v0.2.0** "Authentication" once both tracks integrate.

---

## 2026-07-13 — Sprint 2: Authentication & security backend (Track A, Abubakar)

### Completed
- **`core/security.py`** — bcrypt hashing (72-byte guard), password-strength
  policy (FR-P-01: ≥8, upper, digit, special), and JWT issuance/decoding:
  access 15 min + refresh 7 days, each carrying a `jti`; refresh tokens carry a
  `family` id for rotation lineage.
- **Refresh rotation + replay detection** (`modules/auth/tokens.py`, deviation
  #17) in Redis: rotated (spent) refresh `jti`s are marked used; replaying one
  revokes the whole family; plus an access-token denylist (logout) and a
  per-user session epoch (bumped on password change/reset so older tokens go
  stale). Fake Redis in tests, real Memurai verified live.
- **`modules/auth/`** (schema/repository/service/api) — endpoints: register,
  verify-otp, login, refresh, logout, forgot-password, reset-password. Account
  lockout after 5 failed logins for 15 min (FR-P-02); last-3 password-reuse
  block on reset. OTP real, **console-log delivery in dev** (deviation #7).
- **Shared auth dependency** `get_current_user` + `require_role` in
  `shared/auth.py` — the integration contract Track B imports for role guards
  (returns 401 unauth / 403 cross-role).
- **`modules/user/`** — profile get/update, password change (with reuse block +
  session invalidation), soft-delete grace, and phone-change via OTP.
- **Rate limiter** (`middleware/rate_limit.py`) — Redis fixed-window per IP,
  stricter on `/auth/*` (20/min) than other API routes (100/min), fails open if
  Redis is down; health/docs exempt.
- **Migration `f3dc8c5b1963`** — `password_history` table + users
  `notification_preferences`/`pending_phone`/`deleted_at`, and `locked_until`
  made tz-aware; forward→backward→forward verified on the real DB (dump taken
  first per backup policy).
- **Verified end-to-end:** ruff + black + mypy clean (49 files); 11 pytest
  (register→verify→login→refresh, lockout, replay-revokes-family, RBAC guard,
  reuse block, dup-email, weak-password); live smoke against the running server
  with real Postgres + Memurai — 10/10 checks incl. logout-denylist and the 429
  rate-limit trip.

### Challenges
- `User.arenas` relationship needs `Arena` imported before the mapper
  configures — latent since Sprint 1 (no code queried `User` yet). Fixed by
  importing `app.database.metadata` (registers every model) at app startup.
- `locked_until`/`deleted_at` were tz-naive columns but the service writes
  aware UTC — asyncpg rejected the mix. Made both `timezone=True` (they're
  expiry timestamps like `otp.expires_at`) via the migration.
- Redis needed to be swappable for hermetic tests without touching the running
  app's client: added `redis_cache.get_redis()` and call it by module attribute
  so a `fakeredis` monkeypatch takes effect.

### Next
- **Hand off:** push `abubakar`; Track B (Umer) starts arena/court/pricing +
  web auth/owner UI on `umer`, importing `get_current_user` / `require_role`.
- Integration checkpoint: Track B swaps stubs to real guards; verify player
  register/login + owner arena → admin approve.
- On both tracks done + integrated → PR `abubakar` → `main` (merge commit),
  tag **v0.2.0** "Authentication".

---

## 2026-07-13 — Sprint 1: Next.js web scaffold + integration (Umer)

### Completed
- **Next.js web app** scaffolded at `frontend/web` on the `umer` branch —
  Next.js 15.5 App Router, React 19.1, TypeScript strict, Tailwind 4, ESLint +
  Prettier (with `eslint-config-prettier`), shadcn/ui (radix base, nova
  preset; button/card/badge), TanStack Query v5, Zustand v5 — all matching the
  locked versions.
- **Structure per guidelines:** route groups `(auth)/login`, `owner/`,
  `admin/` (placeholder pages), `components/ui` + `components/features`,
  `services/ hooks/ lib/ store/ types/ utils/ config/`, pass-through
  `middleware.ts` scoped to `/owner` + `/admin` (role guards land in Sprint 2).
- **Health page** (`app/health/page.tsx`) calls `GET /api/v1/health` through
  the typed envelope API client (`services/api.ts`, `config/index.ts`) via
  TanStack Query; linked from a minimal ArenaHub home page.
  `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_MAP_TILE_URL` in `.env`(+example).
- **CI:** added the `web` job to `frontend.yml` (npm ci → typecheck → lint →
  format:check → build).
- **Integration flow (agreed):** `umer` → merge into `abubakar` (integration
  branch) → test combined → PR `abubakar` → `main`. Web commit authored as
  Umer (per-commit identity; repo config untouched).
- **Verified live end-to-end:** backend `/api/v1/health` returned fully
  healthy (API/DB/Redis ok) against real Postgres + Redis; `next dev` served
  `/`, `/health`, `/login`, `/owner`, `/admin` all HTTP 200; `tsc`, eslint,
  prettier, `next build` all clean.

### Challenges
- `create-next-app@latest` would install Next 16; pinned with
  `create-next-app@15` (15.5.20) — same version-pin trap as Expo SDK 57.
- New shadcn CLI changed flags: `-b` now means component library
  (`radix`/`base`), themes are presets (`-p nova`); `-b neutral` no longer
  valid.
- The stale `umer` branch (at the old scaffold commit) was fast-forwarded onto
  `main` before starting.

### Next
- Re-run the combined quality gates on `abubakar` (backend + web + mobile),
  push both branches.
- Open PR `abubakar` → `main` (**merge commit, not squash** — preserves
  Umer's authorship); tag **v0.1.0** "Scaffold" after merge.
- Then Sprint 2: auth (registration + OTP, JWT refresh rotation, lockout) on
  Track A; arena/court/pricing + web auth UI on Track B.

---

## 2026-07-13 — Sprint 1: Expo mobile scaffold + CI

### Completed
- **Master development plan** authored and frozen as the project's source of
  truth at `MASTER_DEVELOPMENT_PLAN.md` (repo root) — full project, exec-level,
  two-person tracks A/B; drives the remaining Sprint 1 items and Sprints 2-5.
  Read-only from here on except for genuine requirement changes; progress is
  tracked in this log.
- **Expo mobile app** scaffolded at `frontend/mobile` — Expo SDK 54,
  expo-router, TypeScript 5.9, React 19.1, RN 0.81. Added TanStack Query v5 +
  Zustand v5. Typed API client (`lib/config.ts`, `lib/api.ts`) around the
  standard response envelope; `QueryClientProvider` wired into
  `app/_layout.tsx`.
- **Health screen** (`app/health.tsx`) calls `GET /api/v1/health` via TanStack
  Query and renders API/PostgreSQL/Redis statuses; linked from the home tab.
  `EXPO_PUBLIC_API_URL` in `.env`(+`.env.example`); mobile `.gitignore` now
  ignores `.env` but keeps `.env.example`. App renamed to ArenaHub
  (`arenahub` slug/scheme).
- **CI** added under `.github/workflows/`: `backend.yml` (uv sync → ruff →
  black --check → mypy → alembic up→down→up against Postgres 18 + Redis 7
  service containers → pytest) and `frontend.yml` (mobile job: npm ci → tsc →
  lint → `expo export` web build). Path-filtered per area.
- **Verified:** `tsc --noEmit` + `expo lint` clean; `expo export --platform
  web` bundles all routes incl. `/health` (whole graph incl. TanStack Query
  compiles).

### Challenges
- `create-expo-app@latest` installs **Expo SDK 57** (RN 0.86, TS 6, needs a
  newer Node), but guidelines pin **SDK 54** for Node 20. Re-scaffolded from
  the `expo-template-default@sdk-54` npm tag to hold the pin — no version bump,
  no ADR needed.
- The scaffolder's interactive "skip git init?" prompt left a nested `.git`
  inside `frontend/mobile`; removed it. Also deleted the template's
  `CLAUDE.md`/`AGENTS.md`/`.claude` (project no-CLAUDE.md rule).

### Next
- Umer: scaffold `frontend/web` (Next.js 15) and add its job to `frontend.yml`.
- Open "Web Scaffold" / "Mobile Scaffold" GitHub Issues; PR `abubakar` → `main`;
  tag **v0.1.0** "Scaffold".
- Then Sprint 2: auth (registration + OTP, JWT refresh rotation, lockout).

---

## 2026-07-12 — Sprint 1: Backend foundation + core database schema

### Completed
- **FastAPI backend foundation** (feature-based layout under `backend/app/`):
  - Tooling: `pyproject.toml` (uv-managed, Python 3.12 pinned), ruff + black +
    mypy config, pytest/pytest-asyncio, `.env.example` + local `.env`.
  - Core: `config.py` (pydantic-settings), `logging.py` (structlog — pretty in
    dev, JSON in prod), `exceptions.py` (domain error hierarchy), global
    exception handlers mapping to the standard response envelope.
  - Database: async SQLAlchemy 2.x engine/session, declarative `Base` with a
    deterministic constraint naming convention, UUID-PK + timestamp mixins.
  - Shared: standard success/error response envelope (`shared/response.py`).
  - Redis: shared async client (pinned RESP2 — see Challenges).
  - Health endpoint `GET /api/v1/health` — checks DB + Redis, 200 healthy /
    503 degraded. Satisfies the Sprint 1 "API health check responds" exit
    criterion.
- **Core database schema** (first Alembic migration, 7 tables): `users`,
  `otp_verifications`, `password_reset_tokens`, `arenas`, `amenities`,
  `arena_amenities`, `courts` — matching docs/09, with the OTP/reset infra
  tables designed fresh (durations kept in the service layer, not the schema).
- **Verified end-to-end:** ruff/black/mypy clean, pytest green, migration runs
  forward → backward → forward cleanly on a fresh DB, and the live app returns
  a fully-healthy `/health` against real PostgreSQL 18.4 + Redis.

### Challenges
- **DB password:** default `postgres/postgres` failed; got the real local
  password and put it in the git-ignored `backend/.env`.
- **Alembic + Postgres ENUM reversibility:** `create_table` auto-creates the
  `user_role`/`arena_status` ENUM types but `drop_table` doesn't drop them, so
  a re-upgrade would fail. Added explicit `DROP TYPE` calls to `downgrade()`.
- **Redis is 5.0.14.1 (Windows port), not Memurai:** it rejects the RESP3
  `HELLO` handshake. Decision (with the team): keep it and pin the client to
  RESP2 — sufficient for our needs and portable to Memurai/modern Redis.
  Documented in ADR-005.

### Next
- Open GitHub Issues "Backend Foundation" and "Database Schema"; push the
  `abubakar` branch and open a PR into `main`; tag `v0.1.0` scaffold milestone.
- Sprint 1 remaining: Next.js web scaffold, Expo mobile scaffold, CI basics.
- Then Sprint 2: auth (registration + OTP, JWT with refresh rotation, lockout),
  which builds directly on the `users`/`otp_verifications`/`password_reset_tokens`
  tables landed here.
