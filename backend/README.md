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
