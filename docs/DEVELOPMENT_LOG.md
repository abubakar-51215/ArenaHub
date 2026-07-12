# ArenaHub — Development Log

A running build log. Newest entries at the top. One entry per working session:
what got done, what was tricky, and what's next.

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
