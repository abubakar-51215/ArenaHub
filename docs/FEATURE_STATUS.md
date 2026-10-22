# ArenaHub — Feature Status Audit

Cross-references every feature **decided** in a planning/spec document against what is
**actually built** in the codebase (backend routes/services, web pages, mobile screens).
Each row's status was verified against real source, not against another document's claim of
completion (several status docs are stale — see Conflicts).

- **Verified:** 2026-10-22, branch `abubakar`.
- **Authoritative order when docs disagree:** `MASTER_DEVELOPMENT_PLAN.md` wins, unless
  `docs/PROJECT_GUIDELINES.md` explicitly overrides it (it records 23 deliberate deviations).
- **Ground truth for "what routes exist":** `docs/ROUTES_AND_ROLES.md` (auto-generated from the
  running app — 169 routes). Most recent code-level audit: `docs/BACKEND_COMPLETENESS.md` (2026-10-15).

Status values: `DONE` · `PARTIAL` · `NOT BUILT` · `DEFERRED BY DECISION` · `NEEDS PHONE` ·
`NEEDS ACCOUNT OR KEY`.

---

## 1. Summary

**Total feature rows audited: 97**

| Status | Count |
|---|---|
| DONE | 68 |
| PARTIAL | 11 |
| NOT BUILT | 2 |
| DEFERRED BY DECISION | 9 |
| NEEDS PHONE | 2 |
| NEEDS ACCOUNT OR KEY | 5 |

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
| Owner Web Dashboard | 10 |
| Admin (Web) | 9 |
| Admin (Mobile) | 4 |
| Reports | 5 |
| System / Infra / Deployment | 9 |

**Headline findings**

- The project is substantially complete. Nearly everything decided in the frozen plan and the 40
  functional requirements is built. The remaining gaps are concentrated in: (a) real payment
  gateway credentials, (b) a handful of backend routes with no UI (blocked-dates, admin
  force-refund, payment-event history, pay-balance-through-gateway), (c) deployment phase (deferred
  by deviation #1), and (d) device-only verification (push delivery, camera uploads).
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
| C2 | **Google / social sign-in** | `PROJECT_GUIDELINES.md` deviation #6 ("deferred… don't build unless asked"; doc 06 marks it optional) **vs.** the code (`/auth/google`, `/auth/google/phone` in ROUTES_AND_ROLES.md; mobile `app/one-more-step.tsx`, `lib/google-sign-in.ts`; `backend/app/integrations/google.py`; documented in `DEV_BUILD_AND_GOOGLE_PUSH.md` and `MOBILE_SCREEN_INVENTORY.md` 2026-10-14). | **RESOLVED** — Google sign-in is now accepted scope: deviation #6 has been rewritten to accept it and `ADR-009` records the reasoning (Apple stays deferred). The code was built in a later working session ahead of the guideline; the gap is now closed. (Status row: NEEDS ACCOUNT OR KEY — code is done, but it is off until `GOOGLE_CLIENT_IDS` is set.) |
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
| Phone-channel OTP delivery | PARTIAL | `integrations/email`; no SMS provider | FR-P-01 ("email or phone"), dev #7 | "Phone" code is sent as an email to the number-as-address; never arrives. Registration/login use email. SMS explicitly out of scope (MOBILE_REQUIREMENTS §Decided-out-of-scope). |
| Login + JWT access(15m)/refresh(7d) | DONE | `core/security.py`; `/auth/login`, `/refresh`, `/logout`, `/logout-all` (route table) | FR-P-02, FR-S-04, dev #17 | |
| Refresh-token rotation + replay detection (Redis) | DONE | `core/security.py` + `cache/redis.py`; `test_auth` replay-revokes-family | dev #17, MASTER §S2 | |
| Account lockout after 5 fails / 15 min | DONE | `modules/auth/service.py`; `test_auth` lockout test | FR-P-02 | |
| Login by email OR phone (single field) | DONE | `/auth/login` `identifier`; web + mobile login | SCOPE-LOCK §5, MOBILE_REQUIREMENTS #20/#38 | Pakistani phone forms normalized; admins email-only. |
| Password strength + last-3 reuse prevention | DONE | `core/security.py`; `finalCheckList` §1 | FR-P-01, MASTER §S2 | |
| Forgot/reset password by 6-digit code | DONE | `/auth/forgot-password`, `/auth/reset-password`; web `reset-password/page.tsx`; mobile `reset-password.tsx` | FR-P-02, SCOPE-LOCK §5 | Reset ends old sessions. Codes are stored hashed (HMAC-SHA256 via `code_hash()`), never plaintext — `app/shared/codes.py`. |
| Change email / phone / password via OTP | DONE | `/users/me/email`, `/phone`, `/password` (+`/verify`); mobile `profile/change-*.tsx` | Multi-city+OTP memory decision, FR-P-03 | Phone-change OTP has the same email-delivery gap as registration. |
| Admin login (email+password → emailed code) | DONE | `/auth/admin/verify-code`, `/resend-code`; web `admin/login/page.tsx`; mobile `(auth)/admin-code.tsx` | FR-A-01, SCOPE-LOCK §1/§3 | Prod needs working mail or no admin can sign in. No admin password reset / email-loss recovery (open gap). |
| Role-based authorization (player/owner/admin) | DONE | `shared/auth.py` `require_role`; `tests/modules/test_authorization_matrix.py` (every route) | FR-S-04, dev #10 | |
| Redis rate limiting (stricter on auth) | DONE | `middleware/rate_limit.py`, `shared/abuse.py` | MASTER §S2, NFR | 100/min/IP; owner pages can hit it (WEB_COMPLETENESS §6). |
| Google / social sign-in | NEEDS ACCOUNT OR KEY | `/auth/google`, `/auth/google/phone`; `integrations/google.py`; mobile `one-more-step.tsx`, `lib/google-sign-in.ts` | deviation #6 (now accepts Google), `ADR-009` (was Conflict C2, resolved) | Code complete; refuses with "not available yet" until `GOOGLE_CLIENT_IDS` set. Native flow needs a dev build. |
| Owner business name + business contact at signup | PARTIAL | web `register/page.tsx` collects name/email/phone only | FR-O-01 | Not collected at signup; arena carries business contact instead. |

### Player Profile & Account

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| View / edit profile (name, phone, bio) | DONE | `/users/me` GET/PUT; mobile `profile/edit.tsx` | FR-P-03 | |
| Preferred sports / locations | DONE | `modules/user` prefs; `/users/me` | FR-P-03 | |
| Profile picture upload | PARTIAL | `/uploads/image`; mobile `lib/pick-photo.ts` | FR-P-03 | Saves to local `/uploads/` in dev; the Cloudinary remote path is implemented (see Infra) but needs a real `CLOUDINARY_URL` to exercise. |
| Notification preferences | DONE | `modules/user`; mobile `profile/settings.tsx` | FR-O-11/FR-P-16, dev list | |
| Change password (in-app) | DONE | `/users/me/password` (+`/verify`) | FR-P-03 | |
| Soft-delete account (grace period) | DONE | `/users/me/delete` (+`/verify`); mobile `profile/settings.tsx` | FR-P-03, dev #22 | Distinct from admin scrubbing delete. |
| Liked / saved arenas | DONE | `/arenas/{id}/like`, `/arenas/liked`; mobile `profile/liked.tsx` | FR-P-12 | |

### Search, Discovery & AI

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Search by name/city/sport/price | DONE | `GET /arenas`; mobile `(tabs)/search.tsx`, `results.tsx` | FR-P-04 | |
| Filter by rating/availability/sport | PARTIAL | `app/filters.tsx` | FR-P-04 | Amenity "must have", time-of-day and radius filter rows deferred (MOBILE_REQUIREMENTS G2). |
| Sort by distance | NOT BUILT | no distance in `modules/arena/service.py` | FR-P-04 | Backend has no distance search/sort; app filters by nearest city only. Deferred pending a frame (MOBILE_REQUIREMENTS #42). |
| Sort by price / rating | DONE | `GET /arenas?sort=` | FR-P-04 | |
| Distance / "near me" + distance on cards | DEFERRED BY DECISION | — | MOBILE_REQUIREMENTS #42 ("confirmed… Not started: waits for a frame") | Confirmed in scope but deliberately not started; no frame yet. |
| Recent search history | DONE | mobile `store/search-history` (AsyncStorage, last 8) | FR-P-04 | |
| NLP / smart search | DONE | `GET /search/nlp`; `modules/ai`; mobile `results.tsx` "Understood" chips | FR-P-05, dev #3 | |
| AI recommendations + alternatives-when-full | DONE | `GET /recommendations`; mobile Home; `components/venue.tsx` | FR-P-15 | Recommendation cards carry `avg_rating`/`review_count`/`min_price` (`test_search_list_cards.py::test_recommendations_carry_the_list_card_fields`); the card component reads all three. |
| Trending arenas (recent-booking-count + fallback) | DONE | `GET /arenas/trending`; mobile Home carousel | dev #21 | |

### Arena Details

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Arena detail: images, amenities, courts, pricing, hours | DONE | `GET /arenas/{id}`, `/courts`, `/slots-today`; mobile `arena/[id].tsx` | FR-P-06 | |
| Average rating + reviews on detail | DONE | `/arenas/{id}/reviews`, `/reviews/summary`; mobile `arena/[id]/reviews.tsx` | FR-P-06, FR-P-14 | |
| Embedded map + navigation | PARTIAL | mobile `components/static-map.tsx` (not wired to a screen) | FR-P-06, dev #8 | Static OSM mosaic component exists but the Location/"Get Directions" block is dropped pending a frame (MOBILE_REQUIREMENTS G3). |
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
| Reschedule / move booking | DONE | `/bookings/group/{id}/reschedule` + `reschedule-preview`; mobile `booking/move/[groupId].tsx` | FR-P-11 | Dearer slot → balance paid at arena (no online balance; deviation, MOBILE_REQUIREMENTS #72). |
| Auto-cancel after 24h + reminders (24h/1h) | DONE | `tasks/scheduler.py` (APScheduler) | MASTER §S3, dev #14 | |
| QR code for confirmed bookings | PARTIAL | generated: `shared/qr.py`, set in `payment/service.py:314` (`qr_code_url`) | MASTER §S3, finalCheckList §2 | Generated + stored server-side; **no app screen displays it** ("View pass" not built, MOBILE_SCREEN_INVENTORY). |
| Pay outstanding balance via gateway | NOT BUILT | `POST /payments/initiate-balance` exists, no screen | FR-P-09 (advance), BACKEND_COMPLETENESS | Route exists; balance is paid at the arena today. No UI drawn (decision pending). |

### Payments & Refunds

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Payment-provider abstraction layer | DONE | `integrations/payments/` (`PaymentProvider` interface) | dev #2, ADR-008 | Swappable: stripe/jazzcash/easypaisa/manual/mock. |
| Bank transfer (manual receipt → owner verify) | DONE | `/payments/{id}/receipt`, `/owner/payments/{id}/approve|reject`; mobile `booking/bank/[groupId].tsx` | dev #2, #2b | The only method that actually completes a payment today. |
| Card payment (Stripe test mode) | NEEDS ACCOUNT OR KEY | `integrations/payments/stripe_provider.py`; `GET /payments/methods` | FR-P-09, dev #2 | Clean 503 "not available yet" without a real key (not a 500 anymore, MOBILE_REQUIREMENTS #62). |
| JazzCash payment | NEEDS ACCOUNT OR KEY | `integrations/payments/jazzcash.py` (simulator) | FR-P-09, dev #2 | Listed "coming soon"; cannot be started until gateway configured. |
| EasyPaisa payment | NEEDS ACCOUNT OR KEY | `integrations/payments/easypaisa.py` (simulator) | FR-P-09, dev #2 | As JazzCash. |
| Webhook auto-confirm (card/wallets) | NEEDS ACCOUNT OR KEY | `POST /webhooks/{method}`; `payment/service.py _confirm_group` | dev #2b, ADR-008 | Logic built + signed; needs a live gateway to exercise end-to-end. |
| Full vs advance payment | DONE | `modules/payment`; arena advance %; mobile checkout "Pay now" | FR-P-09, FR-O-05 | |
| Owner approve/reject bank-transfer | DONE | `/owner/payments/{id}/approve|reject`; web `owner/bookings` verify dialog | FR-O-06, dev #2b | Receipt dialog image URL is relative in dev (WEB_COMPLETENESS §7 — prod Cloudinary fixes it). |
| Digital receipt (PDF) | DONE | `/payments/{id}/receipt.pdf`; mobile booking detail | FR-P-09, FR-P-17 | |
| Refund system (tiered, auto per policy) | DONE | `modules/payment` refunds; `/owner/refunds`, `/admin/refunds`; `test_payment` | FR-P-11, FR-O-05 | |
| Refund retry with backoff + manual handoff | DONE | refund retry schedule (FEATURE_GAP_REPORT §F1) | dev-era decision | "Pending refund" badge on admin Bookings/Payments. |
| Admin force-refund (100%) | NOT BUILT | `POST /admin/bookings/{id}/force-refund` exists, no screen | MASTER §S3 ("admin force-refund") | Route + logic exist; no admin button drawn (decision pending, BACKEND_COMPLETENESS). |

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
| Push notifications (delivery) | NEEDS PHONE | `integrations/push/expo_push.py`; mobile `usePushRegistration` | FR-P-16, FR-S-03, dev vs C5 | Expo Push (not raw FCM). Actual delivery needs a dev build + device; receipt/dead-token cleanup is hardening-TODO (DEV_BUILD doc). |
| Email notifications | PARTIAL | `integrations/email` | FR-P-16, finalCheckList §9 | Wired via SMTP; real delivery needs configured mail creds (NEEDS ACCOUNT in prod). |
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
| Matches at suspended/removed arena | PARTIAL | — | FEATURE_GAP_REPORT §F3 | Open matches at a suspended arena can still be joined (known follow-up). |

### Owner Web Dashboard

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Arena management (create/edit/deactivate/resubmit) | PARTIAL | `/owner/arenas/*`; web `owner/arenas/page.tsx` | FR-O-02 | Works; images are pasted URLs only (no file upload). |
| Court management + availability toggle | DONE | `/owner/.../courts`, `/owner/courts/{id}/availability`; web `owner/courts/page.tsx` | FR-O-03 | |
| Pricing: base + peak rules | DONE | `/owner/courts/{id}/pricing-rules`; web `owner/pricing/page.tsx` | FR-O-04, dev #12 | |
| Payment config: advance %, refund tiers, discounts, bank accounts | DONE | arena fields; `/owner/.../discounts`, `/bank-details`; web `owner/payments/page.tsx` | FR-O-05 | |
| Bookings list + filters + CSV export | DONE | `/owner/dashboard/bookings`; web `owner/bookings/page.tsx` | FR-O-07 | |
| Calendar / schedule (day/week/month) | DONE | `/owner/.../bookings/calendar`; web `owner/calendar/page.tsx` | FR-O-07 | |
| Live Board (courts×hours, "now" line) | DONE | web `owner/page.tsx` | SESSION_HANDOFF item 4, RESTYLE_LOG | Built from the calendar endpoint; no new backend. |
| Revenue / earnings + pending settlements | DONE | `/owner/dashboard/revenue`, `/analytics`; web `owner/revenue/page.tsx` | FR-O-09 | No payout/commission data (left out by decision). |
| Owner slot screen (generate/block/edit) + blocked dates | PARTIAL | generate in Courts dialog; `/owner/.../blocked-dates` routes exist, no screen | FR-O-02 ("blocked dates"), FEATURE_GAP_REPORT §A1/§D | Block/edit/delete-slot and blocked-dates (whole-day holiday) have **no dedicated UI**. Decision pending (BACKEND_COMPLETENESS). |
| Notification center + unread badge | DONE | web `owner/notifications/page.tsx` | FR-O-11 | |

### Admin (Web)

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Metrics dashboard + decision queue | DONE | `/admin/dashboard/overview`; web `admin/page.tsx` | FR-A-07, MASTER §S5 | 13 KPI cards ship without sparklines (no time-series endpoint). |
| Arena verification (approve / reject w/ reason) | DONE | `/admin/arenas/{id}/approve|reject`; web `admin/arenas/page.tsx` | FR-A-03 | Owner now notified of the result (notice added). |
| Arena moderation (suspend/reactivate/remove) | DONE | `/admin/arenas/{id}/suspend|reactivate`, `DELETE`; web `admin/arenas/all/page.tsx` | FEATURE_GAP_REPORT §F1 | Cancels upcoming bookings with full refund; audited. |
| User & owner management (suspend/reactivate/delete) | PARTIAL | `/admin/users/*`; web `admin/users`, `admin/owners` | FR-A-02 | Detail shows a booking **count**, not full booking history. |
| Admin delete = scrubbing soft-delete | DONE | `DELETE /admin/users/{id}`; `modules/admin` | dev #22 | Anonymizes PII, keeps financial rows; admins can't be deleted (403). |
| Booking monitoring | DONE | `/admin/bookings`; web `admin/bookings/page.tsx` | FR-A-04 | |
| Payment monitoring | DONE | `/admin/payments`; web `admin/payments/page.tsx` | FR-A-05 | Fully-refunded payment still reads "Completed" (known follow-up). |
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
| Player booking-history report (file) | PARTIAL→DONE | `GET /reports/my-bookings`; mobile `profile/report.tsx` | FR-P-17 | Was A1 gap; mobile screen now exists (MOBILE_SCREEN_INVENTORY). CSV/PDF. |
| Owner reports (bookings, occupancy) CSV/PDF | DONE | `GET /owner/reports`; web `owner/reports/page.tsx` | FR-O-10 | |
| Owner payment report | NOT BUILT (within partial O-10) | — | FR-O-10 | The one O-10 sub-item still missing. |
| Admin reports (users/bookings/revenue/arenas/system) PDF+CSV | DONE | `GET /admin/reports`; `test_report` all types | FR-A-07 | |
| Excel (.xlsx) export | DEFERRED BY DECISION | — | finalCheckList §8, TRACEABILITY "known open" | Beyond the spec's PDF/CSV; not built. |

### System / Infra / Deployment

| Feature | Status | Evidence (code) | Source(s) | Notes |
|---|---|---|---|---|
| Standard response envelope + error handler | DONE | `shared/response.py`, `core/handlers.py` | guidelines §Standard API response | |
| OpenAPI `/docs` + pagination | DONE | FastAPI app; `shared/pagination.py` | FR (API), MASTER | |
| Structured logging (structlog) | DONE | `core/logging.py` | dev #16 | |
| One migration per module, reversible | DONE | `backend/alembic/versions/*` | dev §Migration policy | |
| Cloudinary image upload (prod) | DONE | `shared/storage.py` `_configure_cloudinary()` + `_upload_to_cloudinary()` fully implemented | dev #9, FR-P-03/FR-O-02 | Code complete. Local `/uploads/` is a by-design dev fallback when `CLOUDINARY_URL` is unset (dev #9). NEEDS ACCOUNT OR KEY to exercise the live remote path with a real `CLOUDINARY_URL`. |
| Camera-based receipt/photo upload | NEEDS PHONE | mobile `lib/pick-photo.ts` (expo-image-picker) | FR-P-09, FR-O-02 | Web build uses file picker; true camera capture needs a device. |
| CSP / security headers | PARTIAL | `frontend/web/next.config.ts`; `middleware/hardening.py` | MASTER §S5 security checklist | Headers set; `script-src` still allows `unsafe-inline/eval` (Next runtime) — nonce policy deferred. |
| Docker / docker-compose | DEFERRED BY DECISION | `.github/workflows` only `.gitkeep`-era; no Dockerfiles | dev #1 (no Docker until Sprint 5), MASTER §S5 | Explicitly deferred to the final sprint. |
| Deployment (HTTPS, monitoring, APK/AAB, DB backup automation) | DEFERRED BY DECISION | `docs/BEFORE_GOING_LIVE.md`, `DEV_BUILD_AND_GOOGLE_PUSH.md` | dev #1, MASTER §S5 checklists | Procedures documented; not executed (post-build phase). |

### Deferred-by-decision roundup (not failures)

| Feature | Source |
|---|---|
| Owner staff sub-accounts / permission tiers | dev #10 (Sprint 5 stretch, model-ready only) |
| SMS / text-message OTP | dev #7, MOBILE_REQUIREMENTS §Decided-out-of-scope |
| Distance / near-me search | MOBILE_REQUIREMENTS #42 |
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
