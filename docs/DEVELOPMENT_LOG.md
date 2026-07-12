# ArenaHub — Development Log

A running build log. Newest entries at the top. One entry per working session:
what got done, what was tricky, and what's next.

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
