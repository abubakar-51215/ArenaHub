# ArenaHub — Master Development Plan (Full Project)

> **⚠️ MASTER SOURCE OF TRUTH — FROZEN**
>
> This document is the MASTER SOURCE OF TRUTH for ArenaHub development. If any
> specification, prompt, roadmap, or previous conversation conflicts with this
> document, this document takes precedence unless
> [docs/PROJECT_GUIDELINES.md](docs/PROJECT_GUIDELINES.md) explicitly overrides
> it. Do not invent functionality not defined here. When requirements are
> ambiguous, stop and ask instead of assuming.
>
> Treat this file as read-only except for genuine requirement changes. Track
> ongoing progress in [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md), not here.

## ▶ Immediate Next Actions (do today)

1. **Umer:** scaffold `frontend/web` (Next.js 15 + Tailwind 4 + shadcn/ui +
   TanStack Query v5 + Zustand v5, TS strict), wire a `/health` call through the
   API client.
2. **Abubakar:** scaffold `frontend/mobile` (Expo SDK 54 + TS + TanStack + Zustand
   + expo-router), wire a health-check screen.
3. **Either:** add CI — `.github/workflows/backend.yml` + `frontend.yml`.
4. Open the "Web Scaffold" / "Mobile Scaffold" GitHub Issues → PR to `main` →
   tag **v0.1.0** → append the session to
   [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md).

*(Full sprint detail is below for reference.)*

---

## Weekly Cadence — Every Sunday

- Review completed GitHub Issues; move unfinished tasks forward.
- Update [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) (Completed /
  Challenges / Next).
- Merge completed PRs into `main`; keep `main` always runnable.
- If the sprint's exit criteria are met, tag the milestone + cut a GitHub Release.
- Re-check progress against the completion-percentage targets (below) so
  supervision meetings have a clear number.

---

## Context

ArenaHub is a two-person Final Year Project: a sports-arena booking platform for
Pakistan (Player React Native app + Owner/Admin Next.js dashboards, on a FastAPI
+ PostgreSQL + Redis backend). An 18-week / 5-sprint Agile plan already exists in
[docs/15_DEVELOPMENT_ROADMAP.md](docs/15_DEVELOPMENT_ROADMAP.md); 19 deliberate
deviations from the specs are recorded in
[docs/PROJECT_GUIDELINES.md](docs/PROJECT_GUIDELINES.md) (that file wins on any
conflict).

**Why this plan:** the roadmap gives sprint headlines but not an execution
breakdown, and the deviations materially reshape it (no Docker until Sprint 5,
Expo instead of bare RN, OSM instead of Google Maps, webhook auto-confirm
instead of blanket owner approval, no Celery, feature-based modules). This
document turns the roadmap into a concrete, module-by-module build order split
into two balanced parallel workstreams with defined integration points, so both
teammates work without blocking each other and every merge lands on `main`
demo-ready. **Intended outcome:** a clear path from today (end of Sprint 1) to
v1.0.0 submission, each sprint ending on a tagged, runnable milestone.

---

## Progress Targets (for supervision meetings)

| Sprint | Weeks | Expected overall completion |
|---|---|---|
| Sprint 1 | 1-3 | **15 %** |
| Sprint 2 | 4-7 | **40 %** |
| Sprint 3 | 8-11 | **70 %** |
| Sprint 4 | 12-15 | **90 %** |
| Sprint 5 | 16-18 | **100 %** |

---

## Current State (verified)

**Done — Sprint 1 backend core** (`abubakar` branch, merged to `main` via PRs #1/#2):
- FastAPI foundation: [backend/app/main.py](backend/app/main.py) app factory,
  [core/config.py](backend/app/core/config.py), [core/logging.py](backend/app/core/logging.py)
  (structlog), [core/exceptions.py](backend/app/core/exceptions.py) +
  [core/handlers.py](backend/app/core/handlers.py), [shared/response.py](backend/app/shared/response.py)
  (envelope), [cache/redis.py](backend/app/cache/redis.py) (RESP2 client),
  [database/](backend/app/database/) (async engine, session, Base, mixins, metadata).
- 7-table core schema across `modules/{user,auth,arena,court}/model.py`, one
  Alembic migration (`0c8d2b789ebe`), forward/backward verified.
- Health endpoint `GET /api/v1/health` ([modules/health/api.py](backend/app/modules/health/api.py)).
- Tooling: `pyproject.toml` (uv), ruff/black/mypy, pytest + 2 health tests,
  `.pre-commit-config.yaml`, root `package.json` task-runner, 8 ADRs.

**Not yet built:** `frontend/web`, `frontend/mobile`, CI (only `.gitkeep`);
every module beyond `model.py`; `core/security.py`, `app/integrations/`,
`app/tasks/`, `app/websocket/`, `app/middleware/`; booking/payment/slot/
equipment/review/complaint/notification/ai/admin/report modules.

---

## Constraints That Shape Every Sprint (must-remember deviations)

1. **No Docker until Sprint 5.** Local-native dev (Postgres 18.4, Memurai, uv
   venv, `npx expo start`, `npm run dev`). All secrets in `.env`.
2. **Payments:** methods = `card | jazzcash | easypaisa | bank_transfer` +
   `payment_provider` column; gateway layer = common interface in
   `app/integrations/`; card = Stripe **test mode**; bank transfer = manual
   receipt upload, no webhook.
3. **Approval split:** card/JazzCash/EasyPaisa auto-confirm via webhook; only
   `bank_transfer` uses the owner `pending_approval` step.
4. **Feature-based modules:** each `app/modules/<x>/` owns
   `api/service/repository/schema/model.py`; logic in services, DB in repos only.
5. **No Celery:** `BackgroundTasks` + APScheduler.
6. **Maps = OpenStreetMap** (Leaflet web / react-native-maps + OSM mobile);
   Haversine on `arenas.lat/lng`.
7. **Auth = JWT with refresh-token rotation** + replay detection (Redis, TTL).
8. **One migration per module**, descriptive names, forward+backward tested.
9. **Definition of Done** gates every task (types + lint + format, reversible
   migration, endpoints in `/docs`, happy + failure tests, concurrency test for
   booking/payment, manual verification before merge).
10. **Milestones:** tag on `main` per sprint (v0.1.0 → v1.0.0); one Issue per
    feature; PRs `abubakar`/`umer` → `main` (user-opened).

---

## Two-Person Track Ownership

| Track | Owner | Branch | Primary domain |
|---|---|---|---|
| **A — Engine & Player Core** | Abubakar | `abubakar` | Heavy backend: auth/security, booking engine + Redis locking + WebSocket, payments + refunds, notifications backend, AI/NLP, background jobs. Sprint 4: mobile auth + mobile booking flow + AI integration. |
| **B — Management & Web** | Umer | `umer` | Management backend: arena/court/pricing/payment-config, equipment, reviews, admin verification + admin service, reports, notifications UI. Owns the Next.js web scaffold + owner dashboard + admin panel. Sprint 4: mobile UI polish, profile, settings. |

**Rationale:** Abubakar owns the transactional core (hardest, highest-risk) and
the mobile *engine* screens (auth + booking + AI). Umer owns the CRUD-heavy
management backend, both web dashboards, and the mobile *presentation* layer
(UI polish, profile, settings, notifications UI) — the mobile app is split
between them rather than owned by one person, keeping load balanced.

### Code review responsibilities (cross-review so both know the whole codebase)
- **Backend PRs → reviewed by Umer.**
- **Frontend PRs (web + mobile) → reviewed by Abubakar.**
- A PR merges to `main` only after the assigned reviewer approves + CI is green.

### Standing integration contract
- API surface follows [docs/10_API_SPECIFICATION.md](docs/10_API_SPECIFICATION.md);
  every endpoint returns the [shared/response.py](backend/app/shared/response.py) envelope.
- Auth dependency (`get_current_user` + `require_role`) built once by Track A in
  Sprint 2 and imported by all protected routes.
- Frontends share a typed API client, Zustand (client) + TanStack Query (server);
  shared TS types mirror backend schemas.
- Rebase personal branches on `main` frequently.

---

## Performance Targets (evaluation-facing; align with docs/04 NFRs)

| Operation | Target |
|---|---|
| General API response | < 300 ms |
| Search results | < 500 ms |
| WebSocket slot update to client | < 1 s |
| Booking confirmation (end-to-end) | < 2 s |
| Redis lock acquire/release | < 100 ms |

Measure these during Sprint 3-5 verification; record numbers in the dev log.

---

## Database Backup Policy (every migration, even in dev)

```
pg_dump ArenaHub  →  run alembic migration  →  verify (upgrade+downgrade)  →  commit
```

- Dump before applying any new migration so a bad migration is always
  recoverable: `pg_dump -U <user> ArenaHub > backups/ArenaHub_<sprint>_<desc>.sql`.
- Keep dumps out of git (add `backups/` to `.gitignore`).
- Sprint 5 adds a scheduled/automated backup for the deployed DB.

---

## Sprint 1 (finish) — Scaffolding + CI → **tag v0.1.0** (target 15 %)

**Track B (Umer) — Web scaffold** `frontend/web/`: Next.js 15 App Router, React 19,
TS strict, Tailwind 4, ESLint + Prettier, shadcn/ui, TanStack Query v5, Zustand
v5. Route groups `(auth)/ owner/ admin/` + `components/ui`, `components/features`,
`services/ hooks/ lib/ store/ types/ utils/ config/`, `middleware.ts`. `.env`
(`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MAP_TILE_URL`). One health call end-to-end.

**Track A (Abubakar) — Mobile scaffold** `frontend/mobile/`: Expo SDK 54, TS,
TanStack + Zustand + expo-router, typed API client, `.env`
(`EXPO_PUBLIC_API_URL`), one health screen.

**Shared — CI** `.github/workflows/`: `backend.yml` (uv sync, ruff, black --check,
mypy, pytest with Postgres+Redis service containers for the runner only, alembic
upgrade/downgrade); `frontend.yml` (`tsc --noEmit`, eslint, prettier --check,
build web + mobile).

**Exit:** both frontends start + hit `/health`; CI green; merge → tag **v0.1.0**
"Scaffold"; update dev log.

---

## Sprint 2 (Weeks 4-7) — Auth + Core Management → **tag v0.2.0** (target 40 %)

### Track A (Abubakar) — Auth & security
- `core/security.py`: bcrypt, JWT access (15m) + refresh (7d), refresh **rotation
  + replay detection** (used-token IDs in Redis), password strength + last-3
  reuse.
- `modules/auth/`: add `schema/repository/service/api.py`. Endpoints: register,
  verify-OTP, login, refresh, logout, forgot/reset. OTP real, **console-log
  delivery in dev** (deviation #7).
- Shared auth dependency `get_current_user` + `require_role` — hand to Track B early.
- `middleware/`: Redis rate limiter (stricter on auth).
- `modules/user/`: profile CRUD, phone-change OTP, notification prefs, soft-delete
  grace, password change.
- Tests: register→verify→login→refresh; lockout after 5 fails; rotated-token
  reuse revokes family; cross-role → 403.

### Track B (Umer) — Arena / court / pricing / verification + web auth UI
- `modules/arena/`: CRUD, image upload (Cloudinary interface / local fallback),
  amenities, blocked dates, operating hours, search stub, status transitions.
- `modules/court/`: CRUD, availability toggle, base pricing, court images.
- Pricing (base + peak rules + discount codes) and **payment config** (advance %
  / full-payment / refund tiers JSONB) on arena.
- `modules/admin/` verification slice: queue, approve/reject-with-reason (reuse
  `require_role("admin")`).
- Migrations: `add_pricing_and_discounts`, `add_blocked_dates` (per module,
  reversible).
- Web: login + protected owner shell + arena/court/pricing forms per
  [design/wireframes/ArenaOwners.PNG](design/wireframes/).

**Integration checkpoint:** Track A publishes auth dependency; Track B swaps stubs
to real guards; verify player register/login + owner arena → admin approve.

**Exit:** auth + profile works; owner registers arena/courts/pricing; admin
approves/rejects; all endpoints role-guarded + in `/docs`. Tag **v0.2.0**.

---

## Sprint 3 (Weeks 8-11) — Booking Engine, Locking, Payments → **tags v0.3.0, v0.4.0** (target 70 %)

### Track A (Abubakar) — Booking engine + payments
- `modules/slot/`: auto-generate from operating hours, manual edit, disable/block.
  Migration `add_time_slots`.
- **Redis locking** (`cache/`): `SET lock:court:{id}:date:{d}:slot:{s} {txn} NX PX
  30000`, release on success/failure, 30s expiry (docs/11, FR-S-01).
- `modules/booking/`: create (select → lock → final check → `pending_payment`),
  multi-slot, equipment addon, status machine, reschedule, cancel-with-refund,
  auto-cancel-after-24hr. Keep **both** `booking_status` + cached `payment_status`
  (deviation #11). Migration `add_bookings`.
- `websocket/`: per-court channel, broadcast slot changes, auto-reconnect contract.
- `modules/payment/` + `integrations/` gateway interface: `PaymentProvider`
  interface; Stripe test-mode; JazzCash/EasyPaisa; **bank_transfer** manual
  (receipt → owner verify). Webhooks auto-confirm card/JazzCash/EasyPaisa; full/
  advance logic; refunds (auto per policy + admin force-refund); receipt PDF.
  Migration `add_payments_and_refunds` (deviation-#2 enum + `payment_provider` +
  `receipt_proof_url`).
- `tasks/` (APScheduler): auto-cancel, reminders 24h/1h, OTP/session cleanup.
- Pricing calc helper in `shared/`: base → peak → discount → +equipment (deviation #12).
- QR generation for confirmed bookings.
- **Tests (mandatory):** concurrency — two simultaneous attempts on one slot,
  exactly one wins; payment status transitions; refund tiers.

### Track B (Umer) — Equipment, reviews, owner booking views
- `modules/equipment/`: CRUD, availability, addon attach, release on cancel.
  Migration `add_equipment`.
- `modules/review/`: submit (post-completed, one per booking), edit (30d)/delete,
  owner response, report/flag, rating recompute. Migration `add_reviews`.
- Owner dashboard: booking approval panel (bank_transfer receipts), calendar,
  revenue/earnings widgets.

**Integration checkpoint:** equipment addon plugs into booking create; verify full
book→pay→confirm→(bank_transfer approve)→QR path.

### ⛔ API Freeze (end of Sprint 3)
Once v0.4.0 is tagged, the `/api/v1` contract is **frozen**: only bug fixes and
non-breaking additions afterward. No breaking endpoint/schema changes — this
protects Sprint 4-5 frontend work from rework. Any unavoidable break needs an
agreed `/api/v2` route + an ADR.

**Exit:** concurrent double-booking prevented; booking transitions through all
statuses per method; refund policy applies on cancel. Tag **v0.3.0** "Booking
Engine" then **v0.4.0** "Payments".

---

## Sprint 4 (Weeks 12-15) — Frontends + AI/NLP → **tag v0.5.0** (target 90 %)

Mobile app split between both teammates (engine vs presentation) to balance load.

### Track A (Abubakar) — mobile engine + AI
- **Mobile authentication:** register/OTP/login/refresh, secure token storage,
  protected navigation.
- **Mobile booking flow:** arena detail real-time slots (WebSocket), select →
  pay → confirm/wait, My Bookings (upcoming/completed/cancelled), QR display.
- **AI/NLP backend** `modules/ai/` (docs/12): keyword extraction feeding search;
  content-based recommendations (proximity/sport/history/rating/price);
  alternatives-when-full; trending. Graceful degradation (AI failure never
  blocks search).
- **Booking + AI integration** into mobile home + search + arena detail.

### Track B (Umer) — mobile presentation + web
- **Mobile UI polishing:** onboarding, home layout, search + filters + map
  (react-native-maps + OSM), arena cards/detail styling, responsive phone +
  tablet, loading/empty states.
- **Notifications UI:** in-app notification center + badges (mobile).
- **Profile + Settings** screens (mobile).
- **Remaining owner dashboard** (docs/07): stats, calendar, revenue charts,
  equipment, review responses, payment config — complete it.

**Exit:** mobile app works end-to-end (register → search → book → pay → manage) on
Android/iOS; owner dashboard drives approval; NLP search returns relevant results;
recommendations render on home. Tag **v0.5.0** "Apps & AI".

---

## Sprint 5 (Weeks 16-18) — Admin, Reports, Notifications, Testing, Deployment → **tag v1.0.0** (target 100 %)

### Track B (Umer) — Next.js admin panel
Per [docs/08_ADMIN_MODULE.md](docs/08) + [design/wireframes/Admin.PNG](design/wireframes/):
metrics dashboard, user/owner management, arena verification queue, booking +
payment monitoring, complaint management (`modules/complaint/` categorized
ticketing), review moderation, platform settings, announcements, audit-log
browser. Backend `modules/admin/` + `modules/complaint/` + audit-log service
completed alongside.

### Track A (Abubakar) — Notifications + reports backend
- `modules/notification/` + `integrations/`: Firebase FCM push (all event types),
  email (SMTP/SendGrid), in-app center, scheduled reminders (APScheduler from
  Sprint 3). Graceful degradation (notification failure never blocks booking).
- `modules/report/`: PDF (+ CSV/Excel) for player/owner/admin report sets with
  date-range filters.

### Both — Testing, security, deployment
- Fill coverage: unit per module, booking+payment integration, **repeat the Redis
  concurrency test**, responsive checks.
- **Docker now introduced** (deviation #1 lifts): `Dockerfile`s +
  `docker-compose.yml` (backend/postgres/redis/web), env-var management, DB backup.
- Finalize docs, seeds in `database/seeds/`, ERD in `database/diagrams/`.

### 🔒 Security Checklist (must pass before Sprint 5 closes)
- [ ] JWT access/refresh expiry verified.
- [ ] Refresh-token rotation + replay detection verified.
- [ ] SQL-injection tests (ORM-parameterized paths).
- [ ] XSS protection (output sanitization / CSP on web).
- [ ] Rate limiting active on all endpoints (stricter on auth).
- [ ] File-upload validation (type + size; malware scan or documented gap).
- [ ] Password policy (strength + last-3 reuse) verified.
- [ ] Role-based authorization verified (cross-role → 403 across every module).

### 🚀 Production / Deployment Checklist
- [ ] Environment variables set (all `.env.example` keys) ✓
- [ ] HTTPS / TLS ✓
- [ ] PostgreSQL backup configured ✓
- [ ] Redis running ✓
- [ ] Build succeeds (backend + web + mobile) ✓
- [ ] Mobile APK generated (EAS build) ✓
- [ ] Web deployed ✓
- [ ] Backend deployed ✓
- [ ] Monitoring enabled ✓
- [ ] Logging enabled (structlog JSON in prod) ✓

**Exit:** admin panel functional; reports download for all roles; FCM delivers all
event types; all tests pass; security + deployment checklists complete; single
`docker compose up` runs the stack. Tag **v1.0.0** "Final Submission".

---

## Cross-Cutting Standards (every task)

- **Envelope:** all responses via [shared/response.py](backend/app/shared/response.py);
  pagination metadata inside `data`.
- **Errors:** raise domain errors from [core/exceptions.py](backend/app/core/exceptions.py).
- **Structure:** each module keeps `api/service/repository/schema/model.py`; logic
  in services, DB in repos; async throughout; functions < 50 lines.
- **Migrations:** one per module, descriptive, forward+backward on a fresh DB
  before merge — and dump the DB first (backup policy above).
- **Secrets:** only in `.env`; new keys added to `.env.example`.
- **Git:** conventional commits with issue refs; PRs `abubakar`/`umer` → `main`
  (user opens/merges); cross-review per the review responsibilities; tag per
  milestone.
- **Ambiguity:** if a business rule isn't in the docs, **stop and ask** — never
  invent.
- **Dev log + ADR:** append a session entry each time; new ADR for any non-obvious
  tech choice.

---

## Versioning Rules

Semantic-style milestone tags on `main`:

- **v0.1.0** — Scaffold
- **v0.2.0** — Authentication
- **v0.3.0** — Booking Engine
- **v0.4.0** — Payments
- **v0.5.0** — Frontends + AI
- **v1.0.0** — Final Submission

Patch versions (e.g. **v0.4.1**, **v0.4.2**) are for **bug fixes only** — no new
features, no breaking changes. This keeps release management and the viva
history unambiguous.

---

## Verification (per sprint, before each milestone tag)

1. **Backend:** ruff + black --check + mypy + pytest green; `alembic upgrade head
   → downgrade base → upgrade head` clean on a fresh DB; live `/health` fully
   healthy against real Postgres + Memurai.
2. **Endpoints:** correct in `/docs` (OpenAPI) with request/response schemas.
3. **Frontend:** `tsc --noEmit`, eslint, prettier clean; app builds; the sprint's
   key flow driven manually against the running backend.
4. **Performance:** spot-check the targets table (Sprint 3-5).
5. **Sprint-specific must-pass:**
   - S2: register→verify→login→refresh→profile; arena register→admin approve;
     cross-role → 403.
   - S3: **two concurrent booking attempts → exactly one succeeds**; each payment
     method transitions statuses; refund tier applies on cancel.
   - S4: mobile book-and-pay end-to-end; owner approves bank_transfer; NLP query
     returns relevant arenas.
   - S5: FCM push per event type; each role's report downloads; security +
     deployment checklists pass; `docker compose up` runs the full stack.
6. **CI green** on the PR; **manually verified end-to-end by the author** before
   merge (DoD).

---

## Risk Register (for the FYP report / viva)

| Risk | Impact | Mitigation |
|---|---|---|
| Payment gateway sandbox unavailable | High | Stay on Stripe test mode; mock gateway/webhook responses behind the `PaymentProvider` interface so flows still demo. |
| Redis / Memurai failure | Medium | Graceful fallback where possible (search cache optional, WS polling fallback); restart Memurai; locking is short-lived (30s TTL) so no deadlock. |
| AI recommendations slower / harder than expected | Medium | Ship rule-based (content-based weighted) recommendations first; AI failure never blocks search (deviation-driven graceful degradation). |
| Team member unavailable | High | Work is modular (feature-based modules + two tracks); cross-review means either developer can pick up the other's area after reading the PRs. |
| PostgreSQL migration failure | High | `pg_dump` before every migration; verify `upgrade`+`downgrade` on a fresh DB; one migration per module keeps blast radius small. |
| Scope creep beyond 18 weeks | Medium | Excluded-scope list in docs/01 is firm; API freeze after Sprint 3 protects the frontend; defer staff sub-accounts / social login. |

---

## Final Deliverables (submission checklist)

- [ ] Backend source code (FastAPI)
- [ ] Next.js web application (owner + admin)
- [ ] React Native (Expo) mobile application
- [ ] PostgreSQL schema
- [ ] Alembic migrations (reversible)
- [ ] API documentation (OpenAPI `/docs` + docs/10)
- [ ] Project guidelines & specs (docs/PROJECT_GUIDELINES.md + 15 spec files + 8 ADRs)
- [ ] Deployment guide (Docker Compose + env setup)
- [ ] User manual (player)
- [ ] Admin manual (owner + admin)
- [ ] FYP report
- [ ] Presentation slides
- [ ] Demo video
- [ ] GitHub repository (Issues → PRs → milestone tags history)
- [ ] Final tagged release **v1.0.0**
