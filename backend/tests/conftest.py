"""Shared pytest fixtures.

The async HTTP client drives the ASGI app in-process (no running server).

Two flavours of test:
- Hermetic (e.g. health): override the DB dependency + patch Redis themselves.
- DB-backed (auth/user): use ``db_session``, which binds a real Postgres
  connection inside a transaction that is rolled back after the test, and the
  autouse ``fake_redis`` fixture, which swaps a fresh in-memory Redis per test
  so token/rate-limit state never leaks between tests.
"""

from collections.abc import AsyncIterator

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.cache import redis as redis_cache
from app.core.config import get_settings
from app.database.session import get_db
from app.main import app


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
