"""Shared pytest fixtures.

The async HTTP client drives the ASGI app in-process (no running server).

Two flavours of test:
- Hermetic (e.g. health): override the DB dependency + patch Redis themselves.
- DB-backed (auth/user): use ``db_session``, which binds a real Postgres
  connection inside a transaction that is rolled back after the test, and the
  autouse ``fake_redis`` fixture, which swaps a fresh in-memory Redis per test
  so token/rate-limit state never leaks between tests.

Per-test rollback only isolates tests *from each other* — it does nothing if
the suite points at the same database a running dev server (or its
APScheduler jobs) is concurrently reading/writing, or one seeded with dev
fixture data. So before anything imports ``app.main`` (which builds the
``Settings`` singleton at module scope), this file repoints ``DATABASE_URL``
at a dedicated ``<db>_test`` database, read from ``.env`` directly rather
than via the app's cached settings (which would already be too late). Create
it once with:
    createdb -U postgres arenahub_test
    DATABASE_URL=postgresql+asyncpg://.../arenahub_test uv run alembic upgrade head
"""

import os
from pathlib import Path

from dotenv import dotenv_values


def _test_database_url() -> str:
    override = os.environ.get("TEST_DATABASE_URL")
    if override:
        return override
    env_path = Path(__file__).resolve().parent.parent / ".env"
    dev_url = os.environ.get("DATABASE_URL") or dotenv_values(env_path).get("DATABASE_URL")
    if not dev_url:
        raise RuntimeError("DATABASE_URL not set in the environment or backend/.env")
    root, _, dbname = dev_url.rpartition("/")
    if not dbname.endswith("_test"):
        dev_url = f"{root}/{dbname}_test"
    return dev_url


# Must run before `app.main` (or anything importing it) is ever imported —
# Settings() is built at module scope there and cached for the process.
os.environ["DATABASE_URL"] = _test_database_url()

from collections.abc import AsyncIterator  # noqa: E402

import fakeredis.aioredis  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

from app.cache import redis as redis_cache  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.database.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> fakeredis.aioredis.FakeRedis:
    """Give every test its own clean in-memory Redis."""
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_cache, "get_redis", lambda: fake)
    return fake


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """A transaction-scoped session bound into the app via dependency override.

    Service-layer ``commit()`` calls land on a savepoint; the outer transaction
    is rolled back on teardown so tests never mutate the real database.
    """
    engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    conn = await engine.connect()
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_db] = _override
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        await session.close()
        await trans.rollback()
        await conn.close()
        await engine.dispose()
