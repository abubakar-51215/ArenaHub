# ArenaHub Backend

FastAPI + PostgreSQL + Redis backend for ArenaHub.

## Stack
- Python 3.12 (pinned via `.python-version`, uv-managed toolchain)
- FastAPI 0.116+, SQLAlchemy 2.x (async), Pydantic 2.x
- Alembic migrations, structlog logging
- PostgreSQL 18 (native on Windows), Redis via Memurai

## Setup
```bash
cd backend
uv sync                      # install deps into .venv from pyproject.toml / uv.lock
cp .env.example .env         # then fill in real values
uv run alembic upgrade head  # apply migrations
uv run uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs — health check: http://localhost:8000/api/v1/health

## Running tests

Tests need their own database, separate from the one the dev server uses —
`tests/conftest.py` derives it automatically as `<your db>_test` from
`DATABASE_URL` in `.env` (override with `TEST_DATABASE_URL` if you want a
different name/host). Create it once and keep it migrated:
```bash
createdb -U postgres arenahub_test    # or: psql -U postgres -c "CREATE DATABASE arenahub_test"
DATABASE_URL=postgresql+asyncpg://postgres:<password>@localhost:5432/arenahub_test uv run alembic upgrade head
uv run pytest
```
Each test runs inside a transaction that's rolled back on teardown, so the
test DB itself stays empty between runs — this only isolates the suite from
the dev server (and its scheduler jobs) and from any dev/seed data, it
doesn't need re-seeding.

## Layout (feature-based)
```
app/
  core/         config, logging, exceptions
  database/     engine/session, declarative base, mixins
  shared/       cross-module utilities (response envelope, ...)
  modules/      one folder per domain feature (auth, user, arena, court, ...)
                each owns api.py / service.py / repository.py / schema.py / model.py
  main.py       app factory, routers, exception handlers
alembic/        migration environment + versions
tests/          mirrors app/modules/
```

## Common commands
```bash
uv run uvicorn app.main:app --reload   # dev server
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head            # apply
uv run alembic downgrade -1            # roll back one
uv run pytest                          # tests
uv run ruff check . && uv run black --check . && uv run mypy app
```
