# ArenaHub — Feature Status Audit

Cross-references every feature **decided** in a planning/spec document against what is
**actually built** in the codebase (backend routes/services, web pages, mobile screens).
Each row's status was verified against real source, not against another document's claim of
completion (several status docs are stale — see Conflicts).

- **Verified:** 2026-10-23, branch `abubakar`.
- **Authoritative order when docs disagree:** `MASTER_DEVELOPMENT_PLAN.md` wins, unless
  `docs/PROJECT_GUIDELINES.md` explicitly overrides it (it records 23 deliberate deviations).
- **Ground truth for "what routes exist":** `docs/ROUTES_AND_ROLES.md` (auto-generated from the
  running app — 178 routes). Most recent code-level audit: `docs/BACKEND_COMPLETENESS.md` (2026-10-15).

Status values: `DONE` · `PARTIAL` · `NOT BUILT` · `SKIPPED` · `WAITING FOR KEY` ·
`WAITING FOR REAL PHONE`.

- `SKIPPED` — left out **by decision**; the row says why.
- `WAITING FOR KEY` — the code is done; only an account, a key or a public address is missing. The row says exactly which.
- `WAITING FOR REAL PHONE` — the code is done and proven as far as a browser can prove it; only a real phone can finish the proof. The row says exactly what to do on the phone (`docs/DEV_BUILD_AND_GOOGLE_PUSH.md`).

---

## 1. Summary

**Total feature rows audited: 121** (recounted 2026-10-23 from the tables below; each number in the two tables here is a count of the rows).

| Status | Count |
|---|---|
| DONE | 102 |
| PARTIAL | 6 |
| NOT BUILT | 1 |
| SKIPPED | 4 |
| WAITING FOR KEY | 5 |
| WAITING FOR REAL PHONE | 3 |

| Area | Rows |
|---|---|
| Auth & Security | 14 |
| Player Profile & Account | 7 |
| Search, Discovery & AI | 9 |
| Arena Details | 4 |
| Booking Engine | 12 |
| Payments & Refunds | 12 |
| Equipment | 3 |
| Reviews | 6 |
| Notifications | 7 |
| Complaints | 4 |
| Matchmaking (Play) | 3 |
| Owner Web Dashboard | 12 |
| Admin (Web) | 9 |
| Admin (Mobile) | 4 |
| Reports | 5 |
| System / Infra / Deployment | 10 |

**Headline findings**

- The project is substantially complete. Nearly everything decided in the frozen plan and the 40
  functional requirements is built. As of 2026-10-23 the mobile app has: pay the balance online, the
  Time of day / Must have / How far filters, and Take photo for receipts and profile pictures (all
  DONE, or WAITING FOR REAL PHONE where only a phone can finish the proof). The rest is
  concentrated in: (a) real payment gateway credentials and a public webhook address (WAITING FOR
  KEY), (b) a production mail service (WAITING FOR KEY), (c) device-only proof: push delivery,
  the camera, Google sign-in on a real build (WAITING FOR REAL PHONE), and (d) one real gap found
  while building the filters: nothing lets an owner choose amenities (NOT BUILT, needs a decision).
- Two features were **built ahead of the guideline and are now confirmed in scope**: Google
  sign-in (deviation #6 rewritten to accept it; `ADR-009`) and the support **assistant**
  (deviation #3 rewritten to carve it out; `ADR-010`). Both conflicts (C2, C3) are now resolved.
  A third, the **mobile admin app**, is beyond the frozen plan (which scopes Admin as web-only)
  but was explicitly decided later in `MOBILE_ADMIN_PLAN.md`.
- Status docs disagree with each other: `TRACEABILITY_MATRIX.md` marks several items DONE that
  `FEATURE_GAP_REPORT.md` and the code show as PARTIAL. Where they conflicted, the code decided.

---

## 2. Conflicts / Unclear

| # | Topic | Documents in tension | The disagreement |
|---|---|---|---|
| C1 | **Walk-in bookings** (the owner's open question) | none | **RESOLVED** — walk-in bookings (booking a slot at the arena in person, without the app) are **skipped by decision, out of scope** (recorded in `MOBILE_REQUIREMENTS.md` → "Decided out of scope or settled"). There was no mention anywhere in any planning doc or the code (grep across repo = 0 hits); the owner has now settled it as out of scope, so it is no longer open. |
| C2 | **Google / social sign-in** | `PROJECT_GUIDELINES.md` deviation #6 ("deferred… don't build unless asked"; doc 06 marks it optional) **vs.** the code (`/auth/google`, `/auth/google/phone` in ROUTES_AND_ROLES.md; mobile `app/one-more-step.tsx`, `lib/google-sign-in.ts`; `backend/app/integrations/google.py`; documented in `DEV_BUILD_AND_GOOGLE_PUSH.md` and `MOBILE_SCREEN_INVENTORY.md` 2026-10-14). | **RESOLVED** — Google sign-in is now accepted scope: deviation #6 has been rewritten to accept it and `ADR-009` records the reasoning (Apple stays deferred). The code was built in a later working session ahead of the guideline; the gap is now closed. (Status row: WAITING FOR REAL PHONE — code is done; it needs a build and a phone.) |
| C3 | **Support "assistant"** | `PROJECT_GUIDELINES.md` deviation #3 ("The AI module is NLP search + recommendations ONLY… No separate FAQ knowledge-base bot") **vs.** the code (`modules/assistant/`, `/assistant/ask`; mobile `app/support/assistant.tsx`, `app/support/faq.tsx`; `docs/ASSISTANT_ANSWERS.md`). | **RESOLVED** — the rule-based support assistant is now accepted scope: deviation #3 has been rewritten to carve it out and `ADR-010` records the boundary (fixed templates + the user's own data only, no external ML, no open-ended retrieval). It is **not** an external-ML / open-ended KB bot — it returns only fixed, pre-written sentences filled with the player's own booking/payment/refund data (`assistant/service.py`), which is why it is accepted inside the deviation #3 boundary. |
| C4 | **Booking approval model** | doc 03 (FR-P-10, FR-O-06) + docs 07/11 ("owner must manually approve **every** booking") **vs.** `PROJECT_GUIDELINES.md` deviation #2b + `ADR-008` (only `bank_transfer` needs owner approval; card/JazzCash/EasyPaisa auto-confirm by webhook). | Direct doc-vs-doc contradiction, but **resolved by precedence**: guidelines + ADR win. Inline pointer notes now sit next to the stale "owner approves every booking" wording in docs 03 (FR-P-16 notification bullet), 07 (§8 Booking Approval) and 11 (§2 status flow + §6 owner approval flow), each pointing to deviation #2b + ADR-008. Listed here only so the viva reader is not surprised that the code does not match the raw FR text. Code follows the deviation. |
| C5 | **Push: Firebase FCM vs Expo Push** | FR-P-16 / FR-S-03 + `finalCheckList.md` ("Firebase Cloud Messaging") **vs.** the code (Expo Push service, `integrations/push/expo_push.py`). | Resolved by a documented deviation (TRACEABILITY_MATRIX 🔀). Expo fans out to FCM/APNs; a real Android build still needs FCM credentials (`DEV_BUILD_AND_GOOGLE_PUSH.md`). Noted, not open. |
| C6 | **Maps: Google Maps vs OpenStreetMap** | doc 03 (FR-P-04/06 name Google Maps) **vs.** deviation #8 (OpenStreetMap + Haversine). | Resolved by deviation #8. Mobile actually ships a static OSM mosaic + "Get Directions" deep link, not an interactive map — see B-ARENA-04. Noted, not open. |
| C7 | **Sport taxonomy (Football vs Futsal)** | `MOBILE_REQUIREMENTS.md` #40 / "Later work logged during G2" | **RESOLVED** — decided that Football and Futsal stay **two distinct sports** (no taxonomy merge); no code change needed and chips keep using the backend's own values (`MOBILE_REQUIREMENTS.md` #40). The validated 10-sport enum remains later work, but the taxonomy question itself is settled. |

---

## 3. Feature table (by area)

Evidence paths are relative to repo root. "Route table" = `docs/ROUTES_AND_ROLES.md`.

### Auth & Security

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Player/owner registration + email OTP | DONE | `backend/app/modules/auth/api.py` (`/auth/register`, `/verify-otp`, `/resend-otp`); mobile `app/(auth)/register.tsx`, `verify-otp.tsx`; web `app/(auth)/register/page.tsx` | FR-P-01, FR-O-01, MASTER §S2 | Email OTP only; SMS deferred (dev #7). |
| Phone-channel OTP delivery | SKIPPED | `integrations/email`; no SMS provider | FR-P-01 ("email or phone"), dev #7 | Skipped by decision: SMS is out of scope (MOBILE_REQUIREMENTS §Decided-out-of-scope), so every code goes by email. A change of phone sends the code to the account's own email. |
| Login + JWT access(15m)/refresh(7d) | DONE | `core/security.py`; `/auth/login`, `/refresh`, `/logout`, `/logout-all` (route table) | FR-P-02, FR-S-04, dev #17 | |
| Refresh-token rotation + replay detection (Redis) | DONE | `core/security.py` + `cache/redis.py`; `test_auth` replay-revokes-family | dev #17, MASTER §S2 | |
| Account lockout after 5 fails / 15 min | DONE | `modules/auth/service.py`; `test_auth` lockout test | FR-P-02 | |
| Login by email OR phone (single field) | DONE | `/auth/login` `identifier`; web + mobile login | SCOPE-LOCK §5, MOBILE_REQUIREMENTS #20/#38 | Pakistani phone forms normalized; admins email-only. |
| Password strength + last-3 reuse prevention | DONE | `core/security.py`; `finalCheckList` §1 | FR-P-01, MASTER §S2 | |
| Forgot/reset password by 6-digit code | DONE | `/auth/forgot-password`, `/auth/reset-password`; web `reset-password/page.tsx`; mobile `reset-password.tsx` | FR-P-02, SCOPE-LOCK §5 | Reset ends old sessions. Codes are stored hashed (HMAC-SHA256 via `code_hash()`), never plaintext — `app/shared/codes.py`. |
| Change email / phone / password via OTP | DONE | `/users/me/email`, `/phone`, `/password` (+`/verify`); mobile `profile/change-*.tsx` | Multi-city+OTP memory decision, FR-P-03 | Phone-change OTP has the same email-delivery gap as registration. |
| Admin login (email+password → emailed code) | DONE | `/auth/admin/verify-code`, `/resend-code`; web `admin/login/page.tsx`; mobile `(auth)/admin-code.tsx` | FR-A-01, SCOPE-LOCK §1/§3 | Prod needs working mail or no admin can sign in. Lockout recovery: `backend/scripts/admin_recovery.py` (server-shell CLI, no web route), added 2026-10-22, `docs/SECURITY.md`. |
| Role-based authorization (player/owner/admin) | DONE | `shared/auth.py` `require_role`; `tests/modules/test_authorization_matrix.py` (every route) | FR-S-04, dev #10 | |
| Redis rate limiting (stricter on auth) | DONE | `middleware/rate_limit.py`, `shared/abuse.py` | MASTER §S2, NFR | 100/min/IP; owner pages can hit it (WEB_COMPLETENESS §6). |
| Google / social sign-in | WAITING FOR REAL PHONE | `/auth/google`, `/auth/google/phone`; `integrations/google.py`; mobile `one-more-step.tsx`, `lib/google-sign-in.ts` | deviation #6 (now accepts Google), `ADR-009` (was Conflict C2, resolved) | Code complete and tested; refuses with "not available yet" (one rule, one button on sign-in and sign-up) when no id is set. `GOOGLE_CLIENT_IDS` is SET on this machine (`scripts/check_integrations.py`). Needed on the phone: an EAS build with `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, an Android OAuth client with that build's SHA-1, and a phone. Steps: `docs/DEV_BUILD_AND_GOOGLE_PUSH.md`. |
| Owner business name + business contact at signup | PARTIAL | web `register/page.tsx` collects name/email/phone only | FR-O-01 | Not collected at signup; arena carries business contact instead. |

### Player Profile & Account

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| View / edit profile (name, phone, bio) | DONE | `/users/me` GET/PUT; mobile `profile/edit.tsx` | FR-P-03 | |
| Preferred sports / locations | DONE | `modules/user` prefs; `/users/me` | FR-P-03 | |
| Profile picture upload | DONE | `/uploads/image`; mobile `lib/pick-photo.ts`, `hooks/usePhotoPicker.tsx` | FR-P-03 | Choose from gallery proven in the browser at four phone widths; "Take photo" added 2026-10-23 (see the camera row below). Goes to Cloudinary when `CLOUDINARY_URL` is set (it is SET on this machine), to local `/uploads/` otherwise. |
| Notification preferences | DONE | `modules/user`; mobile `profile/settings.tsx` | FR-O-11/FR-P-16, dev list | |
| Change password (in-app) | DONE | `/users/me/password` (+`/verify`) | FR-P-03 | |
| Soft-delete account (grace period) | DONE | `/users/me/delete` (+`/verify`); mobile `profile/settings.tsx` | FR-P-03, dev #22 | Distinct from admin scrubbing delete. |
| Liked / saved arenas | DONE | `/arenas/{id}/like`, `/arenas/liked`; mobile `profile/liked.tsx` | FR-P-12 | |

### Search, Discovery & AI

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Search by name/city/sport/price | DONE | `GET /arenas`; mobile `(tabs)/search.tsx`, `results.tsx` | FR-P-04 | |
| Filter by rating/availability/sport | DONE | `app/filters.tsx`; `GET /arenas?amenity_ids=&time_of_day=&date=&radius_km=`, `GET /arenas/amenities`; `backend/app/core/time_of_day.py` | FR-P-04 | Built 2026-10-23: **Must have** (an arena needs ALL chosen amenities), **Time of day** (Morning 05:00–12:00, Afternoon 12:00–17:00, Evening 17:00–21:00, Night 21:00–05:00 by a slot's start, a free bookable slot on the date, today if none), **How far** 2/5/10/25 km (greyed out, never asks, until location is allowed). The count on the Filters button counts each row in use; Clear all resets them; none of the values reach a log or an error report. Tests: `test_arena_filters.py`. Note: no screen lets an owner choose amenities yet (see Owner Web), so the Must have row shows only amenities that arenas already have. |
| Sort by distance | DONE | `GET /arenas?sort=near&lat=&lon=`; `arena/repository.distance_km_expr` (haversine) | FR-P-04 | Was mismarked NOT BUILT in an earlier audit pass — the code already had it; `test_arena_near.py` proves it, including radius filtering and validation. Now in scope per MOBILE_REQUIREMENTS #42. |
| Sort by price / rating | DONE | `GET /arenas?sort=` | FR-P-04 | |
| Distance / "near me" + distance on cards | DONE | backend: `GET /arenas` returns `distance_km` per item, never dropping a coordinate-less arena outside a radius filter (`test_an_arena_with_no_coordinates_sorts_last_but_is_not_dropped`); `components/venue.tsx` renders it; mobile "Near me" sort chip + location-permission flow verified end to end (Playwright, granted/denied, 2026-10-22) | MOBILE_REQUIREMENTS #42 (now "IN SCOPE") | Was wrongly marked PARTIAL — the "Near me" chip and permission flow were already fully built; `docs/FRAME_BRIEFS.md` §F corrected to match. |
| Recent search history | DONE | mobile `store/search-history` (AsyncStorage, last 8) | FR-P-04 | |
| NLP / smart search | DONE | `GET /search/nlp`; `modules/ai`; mobile `results.tsx` "Understood" chips | FR-P-05, dev #3 | |
| AI recommendations + alternatives-when-full | DONE | `GET /recommendations`; mobile Home; `components/venue.tsx` | FR-P-15 | Recommendation cards carry `avg_rating`/`review_count`/`min_price` (`test_search_list_cards.py::test_recommendations_carry_the_list_card_fields`); the card component reads all three. |
| Trending arenas (recent-booking-count + fallback) | DONE | `GET /arenas/trending`; mobile Home carousel | dev #21 | |

### Arena Details

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Arena detail: images, amenities, courts, pricing, hours | DONE | `GET /arenas/{id}`, `/courts`, `/slots-today`; mobile `arena/[id].tsx` | FR-P-06 | |
| Average rating + reviews on detail | DONE | `/arenas/{id}/reviews`, `/reviews/summary`; mobile `arena/[id]/reviews.tsx` | FR-P-06, FR-P-14 | |
| Embedded map + navigation | DONE | mobile `lib/directions.ts` (`openDirections`), "Get Directions" row on `arena/[id].tsx` | FR-P-06, dev #8 | Built as the deviation #8 / ADR-004 scope: a "Get Directions" deep link to Google/Apple Maps, not an interactive embedded map. An interactive map picker (Leaflet or similar) was considered and **SKIPPED by decision** (no new map library added) — `components/static-map.tsx`'s static OSM mosaic stays unwired, superseded by the deep link. |
| Real-time slot availability (WebSocket) | DONE | `app/websocket/manager.py`; `/courts/{id}/slots`; mobile `court/[id]/slots.tsx` | FR-P-07, FR-S-02 | Peak/off-peak styling on slots. |

### Booking Engine

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Time-slot generation from operating hours | PARTIAL | `POST /owner/courts/{id}/slots/generate`; called from the owner Courts slots dialog | MASTER §S3, FR-S | Generate is reachable in the Courts dialog (BACKEND_COMPLETENESS). Block/edit/delete-slot and blocked-dates have no dedicated screen (see Owner Web). |
| Redis distributed locking (key + 30s TTL) | DONE | `cache/locking.py` (`LOCK_TTL_MS=30_000`); `test_booking` concurrency test | FR-P-08, FR-S-01 | Key format matches FR-S-01 verbatim. |
| Double-booking prevention (exactly one wins) | DONE | `test_booking::test_concurrent_booking_attempts_exactly_one_succeeds` | MASTER §S3 must-pass | |
| Booking create (preview → lock → confirm) | DONE | `POST /bookings/preview`, `POST /bookings`; mobile `booking/[courtId].tsx`, `payment.tsx` | FR-P-08 | Booking is created at Pay, not Continue (MOBILE_REQUIREMENTS #60). |
| Multi-slot (consecutive) booking | DONE | `modules/booking/group_service.py`; `/bookings/group/*` | MASTER §S3, FR-P-08 | |
| Booking status machine + cached payment_status | DONE | `modules/booking/model.py` (both fields) | dev #11 | |
| Booking history (Upcoming/Past/Cancelled) | DONE | `GET /bookings/groups`; mobile `(tabs)/bookings.tsx` | FR-P-11 | |
| Cancel with refund per policy | DONE | `/bookings/group/{id}/cancel` + `cancel-preview`; `test_booking` refund-tier | FR-P-11, FR-O-05 | |
| Reschedule / move booking | DONE | `/bookings/group/{id}/reschedule` + `reschedule-preview`; mobile `booking/move/[groupId].tsx` | FR-P-11 | Dearer slot → a balance, paid online ("Pay balance") or at the arena. |
| Auto-cancel after 24h + reminders (24h/1h) | DONE | `tasks/scheduler.py` (APScheduler) | MASTER §S3, dev #14 | |
| QR code for confirmed bookings ("View pass") | DONE | `GET /bookings/{id}/pass`; mobile `app/booking/pass/[bookingId].tsx`, "View Pass" button on `booking/detail/[groupId].tsx` | MASTER §S3, finalCheckList §2 | Built 2026-10-22. QR is now generated in memory from `pass_token` on each request and returned as a data URI — never saved to a public address (the old `qr_code_url` public-file path was a standing exposure, fixed; legacy rows mint a token on first open instead of staying blank). No scan/verify route — informational only. |
| Pay outstanding balance online | DONE | `POST /payments/initiate-balance`; mobile "Pay balance" on `booking/detail/[groupId].tsx`, `booking/payment.tsx` (balance mode), `booking/bank/[groupId].tsx`, `booking/processing/[groupId].tsx` | FR-P-09 (advance) | Built 2026-10-23. Same methods as a first payment (card, JazzCash/EasyPaisa simulators in dev, bank transfer with receipt and owner approval). The amount is always the server's figure; an Idempotency-Key makes a second tap the same payment; only the booking's own player can pay; nothing owed, cancelled or completed = no button and the route refuses. The owner sees a balance receipt in the dashboard and Bookings table and approves it like a first one; the booking stays confirmed meanwhile. A cancel, a force refund and a cheaper reschedule draw on the first payment and the balance (each capped at what it paid); a cancel with a balance receipt waiting returns that money. Owner revenue and the payment report count the balance once. Tests: `test_balance_payment.py` (17). |

### Payments & Refunds

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Payment-provider abstraction layer | DONE | `integrations/payments/` (`PaymentProvider` interface) | dev #2, ADR-008 | Swappable: stripe/jazzcash/easypaisa/manual/mock. |
| Bank transfer (manual receipt → owner verify) | DONE | `/payments/{id}/receipt`, `/owner/payments/{id}/approve|reject`; mobile `booking/bank/[groupId].tsx` | dev #2, #2b | The only method that actually completes a payment today. |
| Card payment (Stripe test mode) | WAITING FOR KEY | `integrations/payments/stripe_provider.py`; `GET /payments/methods` | FR-P-09, dev #2 | Clean 503 "not available yet" without a real key (not a 500 anymore, MOBILE_REQUIREMENTS #62). Both Stripe keys are SET on this machine. Needed to prove it end to end: the public https API address registered as the Stripe webhook (`API_PUBLIC_URL`, `docs/BEFORE_GOING_LIVE.md`) and PKR enabled on the Stripe account. |
| JazzCash payment | WAITING FOR KEY | `integrations/payments/jazzcash.py` (simulator) | FR-P-09, dev #2 | Listed "coming soon" outside development. Needed: a JazzCash merchant account (merchant id, password, webhook secret). |
| EasyPaisa payment | WAITING FOR KEY | `integrations/payments/easypaisa.py` (simulator) | FR-P-09, dev #2 | Needed: an EasyPaisa merchant account (merchant id, webhook secret). |
| Webhook auto-confirm (card/wallets) | WAITING FOR KEY | `POST /webhooks/{method}`; `payment/service.py _confirm_group` | dev #2b, ADR-008 | Logic built + signed. Needed: a public https webhook address and a live gateway. |
| Full vs advance payment | DONE | `modules/payment`; arena advance %; mobile checkout "Pay now" | FR-P-09, FR-O-05 | |
| Owner approve/reject bank-transfer | DONE | `/owner/payments/{id}/approve|reject`; web `owner/bookings` verify dialog | FR-O-06, dev #2b | Receipt dialog image URL is relative in dev (WEB_COMPLETENESS §7 — prod Cloudinary fixes it). |
| Digital receipt (PDF) | DONE | `/payments/{id}/receipt.pdf`; mobile booking detail | FR-P-09, FR-P-17 | |
| Refund system (tiered, auto per policy) | DONE | `modules/payment` refunds; `/owner/refunds`, `/admin/refunds`; `test_payment` | FR-P-11, FR-O-05 | |
| Refund retry with backoff + manual handoff | DONE | refund retry schedule (FEATURE_GAP_REPORT §F1) | dev-era decision | "Pending refund" badge on admin Bookings/Payments. |
| Admin force-refund (100%) | DONE | `POST /admin/bookings/{id}/force-refund`; web `components/admin/force-refund-dialog.tsx`, wired into `admin/bookings/page.tsx` | MASTER §S3 ("admin force-refund") | Built 2026-10-22. Confirm button disabled for the whole request to prevent a double-send. |

### Equipment

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Equipment CRUD + stock | DONE | `/owner/.../equipment`, `/owner/equipment/{id}` (+`/quantity`); web `owner/equipment/page.tsx` | FR-O-08 | |
| Equipment as booking addon | DONE | `modules/equipment` addon; mobile booking flow equipment step | FR-P-13 | |
| Stock release on cancel | DONE | `test_equipment` stock-release-on-cancel | FR-P-13 | |

### Reviews

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Submit review (1–5 + text), one per booking | DONE | `POST /arenas/{id}/reviews`; mobile `arena/[id]/reviews.tsx` | FR-P-14 | Gated to completed bookings; dedup enforced. |
| Edit / delete own review | DONE | `PUT|DELETE /reviews/{id}`; `/reviews/my`; mobile `profile/reviews.tsx` | FR-P-14 | |
| Average-rating recompute | DONE | `modules/review/service.py`; `test_review` | FR-P-14 | |
| Owner response to review | DONE | `/owner/reviews/{id}/response`; web `owner/reviews/page.tsx` | FR-O (owner reviews), dev #23 docstring | |
| Report / flag a review | DONE | `POST /reviews/{id}/report` | dev #23 docstring (additive) | |
| Admin review moderation (reported queue) | DONE | `/admin/reviews`, `/admin/reviews/{id}/dismiss`; web `admin/reviews/page.tsx` | FR (admin review moderation), MASTER §S5 | |

### Notifications

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| In-app notification center + history | DONE | `/notifications` (+read/read-all); mobile `notifications.tsx`; web `owner/notifications` | FR-P-16, FR-O-11 | |
| Push notifications (delivery) | WAITING FOR REAL PHONE | `integrations/push/expo_push.py`; mobile `usePushRegistration` | FR-P-16, FR-S-03, dev vs C5 | Expo Push (not raw FCM). Server side done 2026-10-23 and tested: a device Expo says is gone is switched off, sign-out and account deletion remove the phone's token, batches of 100, Android channel, tokens never logged, preferences respected. Needed on the phone: an Android build with Firebase's `google-services.json` and the FCM key on EAS, then `uv run python -m scripts.send_test_push <email>`; tapping it opens the notification list. Later: Expo receipts (second-phase dead-token check). |
| Email notifications | WAITING FOR KEY | `integrations/email` | FR-P-16, finalCheckList §9 | Wired via SMTP; the SMTP user and password are SET on this machine (a Gmail test account). Needed for launch: a transactional mail service on the real sending domain (Brevo or Resend), `docs/BEFORE_GOING_LIVE.md` item 6. |
| Booking/payment/approval/cancel notices | DONE | `modules/notification` (30 notice types, 27 reachable) | FR-P-16, FR-O-11 | 3 types need a live gateway (BACKEND_COMPLETENESS before/after). |
| Arena approved/rejected notice to owner | DONE | admin flow notices; MOBILE_ADMIN_PLAN "owner now gets 'Your arena is approved/not approved'" | FR-A-03 | Was the FR-A-03 gap in the older gap report; since added. |
| New-arena-submitted notice to admin | DONE | admin notices "New arena waiting" | FR-O-02 | Also added post-gap-report (MOBILE_ADMIN_PLAN). |
| Scheduled reminders (APScheduler) | DONE | `tasks/scheduler.py` | FR-P-16, dev #14 | |

### Complaints

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Player files + views own complaints | DONE | `POST /complaints`, `/complaints/my`, `/complaints/{id}`; mobile `support/new.tsx`, `support/index.tsx`, `support/[id].tsx` | FR-A-06 | Was the A1 "real hole" in the older gap report; mobile screens now exist (MOBILE_SCREEN_INVENTORY 2026-10-12). |
| Admin view/respond/resolve | DONE | `/admin/complaints` (+`/{id}`); web `admin/complaints/page.tsx`; mobile admin `complaints/[id].tsx` | FR-A-06 | Statuses open → resolved. |
| Auto-assign on first response | DONE | `complaints.assigned_to`; `PUT /admin/complaints/{id}` | dev #23 | No picker (single-admin deployment). |
| Complaint statuses Open/Under-Review/Resolved | PARTIAL | `modules/complaint/model.py` | FR-A-06 | Open/Resolved implemented; "Under Review" intermediate state is thin (admin UI toggles Open↔Resolved). |

### Matchmaking (Play)

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Match CRUD (social listing, no court reservation) | DONE | `modules/match`; `/matches` (+mine); mobile `(tabs)/play.tsx`, `play/create.tsx` | dev #20 | Deliberately lightweight; no FK to slots, no payment. |
| Join / leave / cancel a match | DONE | `/matches/{id}/join|leave`, `DELETE /matches/{id}`; mobile `play/[matchId].tsx` | dev #20 | |
| Matches at suspended/removed arena | DONE | `match/service.py` `join_match`; `messages.ARENA_UNAVAILABLE` | FEATURE_GAP_REPORT §F3 | Suspending or removing an arena already cancels its matches ("This match was cancelled."); joining a match whose arena is not live any other way now answers 409 "This arena is not available right now." Tests: `test_match.py`, `test_match_follows_booking.py`. |

### Owner Web Dashboard

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Arena management (create/edit/deactivate/resubmit) | DONE | `/owner/arenas/*`; web `owner/arenas/page.tsx`, `components/owner/photo-upload.tsx` | FR-O-02 | Real file upload built 2026-10-22 (`POST /uploads/image`, 6-photo cap, first = cover, client-side type/size pre-check), replacing the pasted-URL textarea. Known limitation: a photo uploaded then removed before the form is saved is an orphan file — documented as a go-live task in `docs/BEFORE_GOING_LIVE.md`, not fixed. |
| Court management + availability toggle | DONE | `/owner/.../courts`, `/owner/courts/{id}/availability`; web `owner/courts/page.tsx` | FR-O-03 | |
| Pricing: base + peak rules | DONE | `/owner/courts/{id}/pricing-rules`; web `owner/pricing/page.tsx` | FR-O-04, dev #12 | |
| Payment config: advance %, refund tiers, discounts, bank accounts | DONE | arena fields; `/owner/.../discounts`, `/bank-details`; web `owner/payments/page.tsx` | FR-O-05 | |
| Bookings list + filters + CSV export | DONE | `/owner/dashboard/bookings`; web `owner/bookings/page.tsx` | FR-O-07 | |
| Calendar / schedule (day/week/month) | DONE | `/owner/.../bookings/calendar`; web `owner/calendar/page.tsx` | FR-O-07 | |
| Live Board (courts×hours, "now" line) | DONE | web `owner/page.tsx` | SESSION_HANDOFF item 4, RESTYLE_LOG | Built from the calendar endpoint; no new backend. |
| Revenue / earnings + pending settlements | DONE | `/owner/dashboard/revenue`, `/analytics`; web `owner/revenue/page.tsx` | FR-O-09 | No payout/commission data (left out by decision). |
| Owner slot screen (generate/block/edit) + blocked dates | PARTIAL | generate in Courts dialog; blocked dates: `components/owner/blocked-dates.tsx`, wired into the arena form | FR-O-02 ("blocked dates"), FEATURE_GAP_REPORT §A1/§D | Blocked dates (whole-day holiday) got a dedicated UI 2026-10-22, including a past-date guard (backend + inline message) and an app Dialog for "Unblock" (no `window.confirm`). Block/edit/delete of an **individual slot** still has no screen — narrower remaining gap than before. |
| Notification center + unread badge | DONE | web `owner/notifications/page.tsx` | FR-O-11 | |
| Choose amenities for an arena (owner form) | NOT BUILT | `POST /owner/arenas` takes `amenity_ids`; there is no list-amenities route for owners and no picker in `owner/arena-form`; the `amenities` table is filled only by `backend/scripts/seed_dummy_data.py` | FR-P-06 (arena shows amenities) | Found 2026-10-23 while building the Must have filter: nothing in the product lets an owner pick amenities, so a live arena has none unless seeded. Needs a decision: the standard list of amenities, and an owner picker. |
| "Use my current location" button (arena form) | DONE | web `components/owner/arena-form.tsx` (`useMyLocation`, `navigator.geolocation`) | optional item approved 2026-10-22 | Fills the existing latitude/longitude fields, rounded to 6 decimals; no new library. Found and fixed a real bug during verification: `next.config.ts`'s Permissions-Policy was blocking geolocation site-wide (`geolocation=()` → `geolocation=(self)`). |

### Admin (Web)

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Metrics dashboard + decision queue | DONE | `/admin/dashboard/overview`; web `admin/page.tsx` | FR-A-07, MASTER §S5 | 13 KPI cards ship without sparklines (no time-series endpoint). |
| Arena verification (approve / reject w/ reason) | DONE | `/admin/arenas/{id}/approve|reject`; web `admin/arenas/page.tsx` | FR-A-03 | Owner now notified of the result (notice added). |
| Arena moderation (suspend/reactivate/remove) | DONE | `/admin/arenas/{id}/suspend|reactivate`, `DELETE`; web `admin/arenas/all/page.tsx` | FEATURE_GAP_REPORT §F1 | Cancels upcoming bookings with full refund; audited. |
| User & owner management (suspend/reactivate/delete) | PARTIAL | `/admin/users/*`; web `admin/users`, `admin/owners` | FR-A-02 | Detail shows a booking **count**, not full booking history. |
| Admin delete = scrubbing soft-delete | DONE | `DELETE /admin/users/{id}`; `modules/admin` | dev #22 | Anonymizes PII, keeps financial rows; admins can't be deleted (403). |
| Booking monitoring | DONE | `/admin/bookings`; web `admin/bookings/page.tsx` | FR-A-04 | |
| Payment monitoring | DONE | `/admin/payments`; web `admin/payments/page.tsx` | FR-A-05 | Reads Completed, Part refunded or Refunded in the list, the status filter and the CSV (`test_admin_force_refund.py`). |
| System settings + announcements + audit log | DONE | `/admin/settings`, `/admin/audit-logs`; web `admin/settings/page.tsx` | FR-A-07, MASTER §S5 | |
| Reports & analytics | DONE | `/admin/reports`; web `admin/reports/page.tsx` | FR-A-07 | See Reports. |

### Admin (Mobile)

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Mobile admin app (Overview, Approvals, Complaints, More) | DONE | mobile `app/admin/(tabs)/*`; `/admin/phone/overview` | `MOBILE_ADMIN_PLAN.md` (2026-10-13) | **Beyond frozen plan** (MASTER scopes Admin as web Next.js); explicitly decided later. Not a conflict, but a documented scope add. |
| Mobile arena approve/suspend/reactivate | DONE | mobile `admin/approvals/[id].tsx`, `admin/arenas/[id].tsx`; `/admin/arena-cards`, `/arenas/{id}/summary` | MOBILE_ADMIN_PLAN | 409 "already handled" guard. |
| Mobile user suspend/reactivate | DONE | mobile `admin/users/[id].tsx` | MOBILE_ADMIN_PLAN | |
| Mobile payments + refunds (mark-paid) | DONE | mobile `admin/payments.tsx`; `/admin/refunds/{id}/mark-paid` | MOBILE_ADMIN_PLAN | Reports, settings, reviews, audit log intentionally web-only. |

### Reports

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Player booking-history report (file) | DONE | `GET /reports/my-bookings`; mobile `profile/report.tsx` | FR-P-17 | Was A1 gap; mobile screen now exists (MOBILE_SCREEN_INVENTORY). CSV/PDF. |
| Owner reports (bookings, occupancy) CSV/PDF | DONE | `GET /owner/reports`; web `owner/reports/page.tsx` | FR-O-10 | |
| Owner payment report | DONE | `GET /owner/reports`; web `owner/reports/page.tsx` | FR-O-10 | Built; test added 2026-10-22 covering multiple payments/methods and a date filter. O-10 is now fully done. |
| Admin reports (users/bookings/revenue/arenas/system) PDF+CSV | DONE | `GET /admin/reports`; `test_report` all types | FR-A-07 | |
| Excel (.xlsx) export | SKIPPED | — | finalCheckList §8, TRACEABILITY "known open" | Skipped by decision: the spec asks for PDF and CSV only. |

### System / Infra / Deployment

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Standard response envelope + error handler | DONE | `shared/response.py`, `core/handlers.py` | guidelines §Standard API response | |
| OpenAPI `/docs` + pagination | DONE | FastAPI app; `shared/pagination.py` | FR (API), MASTER | |
| Real-phone helper scripts (`send_test_push.py`, `check_integrations.py`) | DONE | `backend/scripts/send_test_push.py`, `backend/scripts/check_integrations.py`; `test_push_delivery.py`, `test_check_integrations.py` | real-phone checklist | Added 2026-10-23. The test push prints only "Sent." or the reason, never a token; the integration check prints only SET or MISSING for each service (Google, Cloudinary, Sentry, Stripe, SMTP, support email, JazzCash, EasyPaisa), never a value. |
| Structured logging (structlog) | DONE | `core/logging.py` | dev #16 | |
| One migration per module, reversible | DONE | `backend/alembic/versions/*` | dev §Migration policy | |
| Cloudinary image upload (prod) | DONE | `shared/storage.py` `_configure_cloudinary()` + `_upload_to_cloudinary()` fully implemented | dev #9, FR-P-03/FR-O-02 | Code complete; `CLOUDINARY_URL` is SET on this machine. Local `/uploads/` is the by-design dev fallback when it is unset (dev #9). |
| Camera-based receipt/photo upload | WAITING FOR REAL PHONE | mobile `lib/pick-photo.ts`, `hooks/usePhotoPicker.tsx`, `constants/photos.ts`; `app.json` camera text | FR-P-09, FR-O-02 | Built 2026-10-23: the receipt screen and the profile picture both open an "Add a photo" sheet (Take photo, Choose from gallery, Cancel); file rules unchanged (JPEG/PNG/WebP, 5 MB, the server strips EXIF); a refused camera or photo permission shows a short message and nothing crashes. Proven in the browser at four phone widths (the sheet, Cancel, the camera hint on Take photo only, the file rules). Needed on the phone: tap Take photo, allow the camera prompt, take a receipt photo and send it. |
| CSP / security headers | PARTIAL | `frontend/web/next.config.ts`; `middleware/hardening.py` | MASTER §S5 security checklist | Headers set; `script-src` still allows `unsafe-inline/eval` (Next runtime) — nonce policy deferred. |
| Docker / docker-compose | SKIPPED | `.github/workflows` only `.gitkeep`-era; no Dockerfiles | dev #1 (no Docker until Sprint 5), MASTER §S5 | Skipped by decision (dev #1): no Docker until the deployment phase. |
| Deployment (HTTPS, monitoring, APK/AAB, DB backup automation) | SKIPPED | `docs/BEFORE_GOING_LIVE.md`, `DEV_BUILD_AND_GOOGLE_PUSH.md` | dev #1, MASTER §S5 checklists | Skipped by decision (dev #1): done in the deployment phase. The procedures are written down (`docs/BEFORE_GOING_LIVE.md`, the first-APK steps in `DEV_BUILD_AND_GOOGLE_PUSH.md`). |

### Skipped-by-decision roundup (not failures)

| Feature | Source |
|---|---|
| Owner staff sub-accounts / permission tiers | dev #10 (Sprint 5 stretch, model-ready only) |
| SMS / text-message OTP | dev #7, MOBILE_REQUIREMENTS §Decided-out-of-scope |
| Excel export | finalCheckList §8 |
| Docker + full deployment/monitoring | dev #1 |
| Add-to-calendar (.ics) polish, full-screen photo viewer, sharing | MOBILE_REQUIREMENTS #32, G3 §58 |
| Biometric admin unlock (mobile) | MOBILE_ADMIN_PLAN §5 |
| Terms & privacy screen, "Contact us" block | MOBILE_SCREEN_INVENTORY (BEFORE_GOING_LIVE) |
| Version tags per sprint (only v1.0.0 at submission) | memory: no-version-tags-until-end |

---

## 4. Not in any plan document (code-only features)

Features present in the code that are **not** traceable to the frozen plan or the 15 specs. Flagged
rather than silently given a status.

| Feature | Evidence | Where it came from | Note |
|---|---|---|---|
| **Google sign-in** | `/auth/google`, `/auth/google/phone`; `integrations/google.py`; mobile `one-more-step.tsx` | Later working session; `DEV_BUILD_AND_GOOGLE_PUSH.md`, `MOBILE_SCREEN_INVENTORY.md` | **Now accepted scope** — deviation #6 rewritten to accept Google sign-in, recorded in `ADR-009`. Conflict C2 resolved. |
| **Support assistant** | `modules/assistant/`, `/assistant/ask`; mobile `support/assistant.tsx`, `support/faq.tsx` | `ASSISTANT_ANSWERS.md` (2026-10-14) | **Now accepted scope** — deviation #3 rewritten to carve out the rule-based assistant, recorded in `ADR-010` (rule-based, data-aware, no external ML). Conflict C3 resolved. |
| **Mobile admin app** | mobile `app/admin/**`; `/admin/phone/*`, `/admin/arena-cards` | `MOBILE_ADMIN_PLAN.md` (2026-10-13) | Beyond the frozen plan (Admin = web). Explicitly decided in a working doc; documented, not rogue. |
| **Owner booking-reminder nudge** | `POST /owner/dashboard/bookings/{id}/remind` | RESTYLE_FOLLOWUPS "Remind" | Small addition; lets an owner nudge an unpaid booking. Not in any FR. |
| **Payment step/event history** | `GET /payments/{id}/events` | — | Route exists, no screen, no FR. Backend-only. |
| **Admin dashboard dual route** | `GET /admin/dashboard` and `/admin/dashboard/overview` | — | Two overview endpoints; owner web also calls `/admin/dashboard/overview`. Looks like an internal reuse, not a decided feature. |

---

## 5. Suggestions (not required, not decided)

Ideas a reviewer *might* expect on a sports-booking platform that are neither planned nor built.
**These are suggestions only — nobody has decided them. Do not treat them as scope.**

- **Owner slot / blocked-date UI** — the backend routes exist with no screen; the single biggest
  functional gap (players can't book without slots). Technically already "decided" as a backend
  feature; only the UI decision is pending, so it is really a pending decision rather than a pure
  suggestion.
- **In-app wallet / saved payment methods** — not mentioned anywhere; could simplify repeat booking.
- **Group-split payments** for a match (each player pays a share) — natural with the Play feature,
  but matches deliberately carry no payment (dev #20).
- **Waitlist / notify-when-free** for a fully-booked slot — complements "alternatives when full".
- **Owner multi-arena bulk operations** (bulk pricing, bulk block) — only per-arena today.
- **Player referral / loyalty** — common in booking apps; absent by design (not FYP scope).

_These are explicitly NOT entered as status rows because no document decided them._
