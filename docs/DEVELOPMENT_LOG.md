# ArenaHub — Development Log

A running build log. Newest entries at the top. One entry per working session:
what got done, what was tricky, and what's next.

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
