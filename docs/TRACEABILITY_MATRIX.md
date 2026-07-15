# ArenaHub — Requirements Traceability Matrix

Maps every functional requirement in `03_FUNCTIONAL_REQUIREMENTS.md` (v2.0) to
its implementing backend module, API surface, UI, and automated test coverage.
Statuses: ✅ implemented as specified · 🔀 implemented per a documented
deviation (`PROJECT_GUIDELINES.md`) · ⚠️ partial (sub-bullet gap, noted).

Backend paths are under `backend/app/`, mobile under `frontend/mobile/`,
web under `frontend/web/`, tests under `backend/tests/`.

## Player (FR-P)

| FR | Requirement | Backend module | API | UI | Tests | Status |
|---|---|---|---|---|---|---|
| FR-P-01 | Registration + OTP | `modules/auth` | `POST /auth/register`, `/auth/verify-otp`, `/auth/resend-otp` | `(auth)/register.tsx`, `verify-otp.tsx` (with resend) | `test_auth`: register/verify/duplicate/weak-password/resend | 🔀 email OTP only (deviation #7 — no SMS gateway) |
| FR-P-02 | Login, JWT 15m/7d, rotation, lockout, reset | `modules/auth`, `core/security` | `/auth/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` | `login.tsx`, `forgot-password.tsx`; auto-refresh in `lib/api.ts` | `test_auth`: lockout-after-5, replay-revokes-family | ✅ (reset delivers a token, not a clickable link — dev logs it, prod emails it) |
| FR-P-03 | Profile view/edit, prefs, delete | `modules/user` | `GET/PUT /users/me`, `DELETE /users/me` | `profile/edit.tsx`, `settings.tsx` | `test_user` | ✅ |
| FR-P-04 | Search by name/city/sport/price, filters, sort, map, recent searches | `modules/arena` | `GET /arenas` (q/city/sport/price/sort) | `(tabs)/search.tsx` (recent-search chips via `store/search-history`), `static-map.tsx` | `test_arena` search assertions | 🔀 OSM not Google Maps (deviation #6); recent searches stored on-device (AsyncStorage, last 8) |
| FR-P-05 | NLP search | `modules/ai` | `GET /search/nlp` | `search.tsx` free-text mode with parsed chips | `test_ai::test_nlp_search_parses_sport_and_city` | ✅ |
| FR-P-06 | Arena details (gallery/amenities/pricing/reviews/map) | `modules/arena`, `review`, `court` | `GET /arenas/{id}`, `/arenas/{id}/reviews`, `/courts` | `arena/[id].tsx` | `test_arena`, `test_review` | ✅ |
| FR-P-07 | Real-time slots + peak pricing | `modules/slot`, `app/websocket` | `GET /courts/{id}/slots`, `WS /ws/courts/{id}/slots` | `court/[id]/slots.tsx` + `useCourtSlots` (reconnects) | `test_slot`, `test_websocket_manager` | ✅ |
| FR-P-08 | Booking with Redis locking | `modules/booking`, `cache/locking` | `POST /bookings` | booking flow screens | `test_booking::test_concurrent_booking_attempts_exactly_one_succeeds` | ✅ lock key/TTL match FR-S-01 exactly |
| FR-P-09 | Payments (Stripe/JazzCash/EasyPaisa, full/advance, receipts) | `modules/payment`, `integrations/payments` | `/payments/*`, `/webhooks/*` | `payment/[groupId].tsx` | `test_payment` | 🔀 + bank transfer added (deviation #2) |
| FR-P-10 | Post-payment owner approval | `modules/payment` | owner approve/reject endpoints | booking status screens | `test_payment` bank-transfer flow | 🔀 deviation #2b: gateway payments auto-confirm; manual approval applies to bank transfer only |
| FR-P-11 | Booking history, cancel, refund policy | `modules/booking` | `GET /bookings`, `/bookings/{id}/cancel` | `(tabs)/bookings.tsx` tabs | `test_booking` cancel/refund-tier tests | ✅ |
| FR-P-12 | Liked arenas | `modules/arena` (`ArenaLike`) | `POST/DELETE /arenas/{id}/like`, `GET /arenas/liked` | heart on `arena/[id].tsx`, `profile/liked.tsx` | `test_arena` like/unlike/list/404/401 | ✅ |
| FR-P-13 | Equipment rental | `modules/equipment` | equipment endpoints + booking addon | booking flow equipment step | `test_equipment` incl. stock release on cancel | ✅ |
| FR-P-14 | Reviews (1–5, edit/delete, dedupe, live rating) | `modules/review` | review endpoints | `arena/[id]/reviews.tsx` | `test_review` (12 tests) | ✅ |
| FR-P-15 | AI recommendations + alternatives when full | `modules/ai` | `GET /recommendations` | Home "Recommended for You", slots-screen alternatives | `test_ai` incl. cold start | ✅ |
| FR-P-16 | Push notifications + in-app history | `modules/notification`, `integrations/push` | `/notifications/*` | notification center, `usePushRegistration` | `test_notification` | 🔀 Expo Push service, not raw FCM (managed Expo app — Expo fans out to FCM/APNs) |
| FR-P-17 | Downloadable booking report + receipts | `modules/report`, `payment` | `GET /reports/my-bookings`, `/payments/{id}/receipt.pdf` | `profile/payments.tsx` receipt download | `test_report` | ✅ |

## Arena Owner (FR-O)

| FR | Requirement | Backend module | API | UI | Tests | Status |
|---|---|---|---|---|---|---|
| FR-O-01 | Owner registration + OTP + JWT | `modules/auth` (role=owner) | same auth endpoints | web `/register` + `/login` | `test_auth`, `test_arena` role guards | ⚠️ business name/contact not collected at signup — arena carries the business contact info instead |
| FR-O-02 | Arena registration/management, pending until verified | `modules/arena` | `/owner/arenas/*` | web `/owner/arenas` | `test_arena` pending→approve flow | ✅ (⚠️ no in-app "new submission" ping to admin — admins work the pending queue) |
| FR-O-03 | Court management + availability toggle | `modules/court` | `/owner/.../courts/*` | web `/owner/courts` | `test_court` | ✅ (incl. `capacity`) |
| FR-O-04 | Base + peak pricing | `modules/court` pricing rules | pricing endpoints | web `/owner/pricing`; peak shown on mobile slots | `test_court`/`test_slot` peak pricing | ✅ |
| FR-O-05 | Advance % / full payment, refund tiers | `modules/arena` fields | arena create/update | web `/owner/pricing` | `test_booking` refund-tier test | ✅ |
| FR-O-06 | Booking approval + notifications | `modules/payment` | approve/reject | web `/owner/payments` queue | `test_payment` | 🔀 deviation #2b (bank transfer only) |
| FR-O-07 | Bookings list + calendar + cancel notifications | `modules/dashboard`, `booking` | `/owner/bookings`, `/owner/.../calendar` | web `/owner/bookings`, `/owner/calendar` | `test_dashboard` | ✅ |
| FR-O-08 | Equipment CRUD + availability | `modules/equipment` | `/owner/.../equipment` | web `/owner/equipment` | `test_equipment` | ✅ |
| FR-O-09 | Revenue: daily/weekly/monthly, settlements | `modules/dashboard` | `/owner/dashboard/*` | web `/owner/revenue` charts | `test_dashboard` | ✅ |
| FR-O-10 | Owner reports (booking/revenue/payment/occupancy), PDF | `modules/report` | `GET /owner/reports?type=bookings\|occupancy` (CSV+PDF) | Report-type select + export buttons on `/owner/revenue` | `test_report` incl. occupancy | ✅ |
| FR-O-11 | Owner notifications + dashboard notification center | `modules/notification` | `/notifications` | web `/owner/notifications` + sidebar bell with unread badge | `test_notification` | ✅ |

## Administrator (FR-A)

| FR | Requirement | Backend module | API | UI | Tests | Status |
|---|---|---|---|---|---|---|
| FR-A-01 | Admin login, elevated RBAC | `modules/auth`, `shared/auth` | `/auth/login` + `require_role("admin")` | web `/admin/login` | RBAC 403 tests across 8 files | ✅ |
| FR-A-02 | User/owner management | `modules/admin` | `/admin/users/*` (list/detail/suspend/reactivate/delete) | web `/admin/users`, `/admin/owners` | `test_admin` incl. delete + login-block + suspension notification | ✅ (account holder notified on suspend/reactivate — email is the channel that matters, since a suspended account can't open the app) |
| FR-A-03 | Arena verification with reasons | `modules/admin` + arena state machine | `/admin/arenas/*` | web `/admin/arenas` | `test_arena` reject-with-reason/resubmit | ✅ |
| FR-A-04 | Booking monitoring | `modules/admin` | `/admin/bookings` | web `/admin/bookings` | `test_admin` | ✅ (⚠️ no admin ping on owner approvals — moot for auto-confirmed methods per deviation #2b) |
| FR-A-05 | Payment monitoring w/ gateway IDs | `modules/admin` | `/admin/payments` | web `/admin/payments` | `test_admin` | ✅ |
| FR-A-06 | Complaints: open→under review→resolved | `modules/complaint` | `/complaints`, `/admin/complaints/*` | web `/admin/complaints` (+ Assigned To) | `test_complaint` (5 tests) | ✅ |
| FR-A-07 | System-wide reports, PDF, dashboard metrics | `modules/report`, `admin` | `/admin/reports?type=users\|bookings\|revenue\|arenas\|system` | web `/admin/reports`, `/admin` dashboard | `test_report` all types × CSV/PDF + system content | ✅ |

## System (FR-S)

| FR | Requirement | Implementation | Tests | Status |
|---|---|---|---|---|
| FR-S-01 | Redis lock `lock:court:{id}:date:{d}:slot:{s}`, 30s expiry | `cache/locking.py` — key format and `LOCK_TTL_MS = 30_000` match verbatim | booking concurrency test | ✅ |
| FR-S-02 | WebSocket slot sync to all clients | `app/websocket/` broadcast per court | `test_websocket_manager` | ✅ |
| FR-S-03 | Push via FCM | `integrations/push` via Expo Push service | `test_notification` | 🔀 Expo Push (fans out to FCM/APNs); no Firebase project needed |
| FR-S-04 | JWT + RBAC, three roles | `core/security`, `shared/auth` | `test_user::test_require_role_blocks_cross_role` + 16 cross-role 403 assertions | ✅ |
| FR-S-05 | Responsive web + mobile | Tailwind responsive classes; RN flex layouts | manual (visual) | ✅ code-level; final device sweep due in deployment phase |

## Known open items (tracked, not silent)

- ⚠️ items above: owner business fields at signup (O-01), admin
  new-arena-submission ping (O-02). Both cosmetic; everything else from the
  original list has since been built (recent-search history, occupancy
  report, owner web notification center, suspension notification, CSP
  headers).
- Excel (.xlsx) export — `finalCheckList.md` lists it beyond the spec's
  PDF/CSV; not built.
- Malware scanning on uploads — type+size validation only; this line is the
  checklist-permitted documented gap (no AV integration at FYP scale).
- CSP hardening — headers are configured in `next.config.ts`;
  `script-src` still allows `'unsafe-inline'`/`'unsafe-eval'` (Next.js
  runtime + dev fast-refresh). A nonce-based policy is the
  deployment-phase follow-up.
- Deployment phase (Docker, HTTPS, monitoring, APK/AAB, manuals) — deferred
  per deviation #1.
