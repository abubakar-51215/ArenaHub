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
from typing import Any

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
# JazzCash/EasyPaisa webhook simulators require a signed request (see
# app/integrations/payments/{jazzcash,easypaisa}.py) — tests that exercise
# the webhook path sign their payload with these same well-known secrets.
os.environ.setdefault("JAZZCASH_WEBHOOK_SECRET", "test-jazzcash-webhook-secret")
os.environ.setdefault("EASYPAISA_WEBHOOK_SECRET", "test-easypaisa-webhook-secret")

from collections.abc import AsyncIterator, Iterator  # noqa: E402

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
def payment_gateways_open(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """The card and wallet providers have no real credentials here, so the
    payment-flow tests run them as the simulators. A test that checks the real
    "not available yet" rules opts out with ``@pytest.mark.real_gateway_rules``."""
    if request.node.get_closest_marker("real_gateway_rules"):
        return
    from app.integrations import payments as providers
    from app.integrations.payments.mock import MockProvider
    from app.modules.payment import methods, service

    monkeypatch.setitem(providers._LIVE_PROVIDERS, "card", MockProvider("card"))
    monkeypatch.setattr(methods, "ensure_usable", lambda method: None)
    monkeypatch.setattr(service.methods, "ensure_usable", lambda method: None)


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> fakeredis.aioredis.FakeRedis:
    """Give every test its own clean in-memory Redis."""
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_cache, "get_redis", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    """The suite never really sends email, however many purposes exercise ``send_email``.

    Whatever backend/.env has (real Gmail credentials, EMAIL_SEND_IN_DEV=1), every ``send_email``
    call still goes through its own mode detection, retry and logging exactly as in production —
    only the one line that opens a real network socket (``smtp._send_sync``, run off the event
    loop by ``send_email``) is swapped for an instant success. A test that wants to see a real
    failure still can: it monkeypatches ``send_email`` itself in its own module (several already
    do), which runs instead of ever reaching this. Before this fixture, a full run paid a real
    SMTP round trip (several seconds) for every one of the suite's many emailed-code and notice
    tests; this is the fix for that, not a workaround for it."""
    from app.integrations.email import smtp

    monkeypatch.setattr(smtp, "_send_sync", lambda *args, **kwargs: None)


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


@pytest.fixture(scope="session", autouse=True)
def _record_route_hits() -> Iterator[None]:
    """Remember which route templates the whole suite called, and which answered below 400.

    Written to the file named by ROUTE_HITS_FILE when that is set (docs/BACKEND_COMPLETENESS.md,
    scripts/security-check): it shows which routes no test reaches with a successful answer.
    """
    from fastapi.routing import APIRoute

    called: set[str] = set()
    worked: set[str] = set()
    original = APIRoute.handle

    async def handle(self: Any, scope: Any, receive: Any, send: Any) -> None:
        status: dict[str, int] = {}

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        await original(self, scope, receive, send_wrapper)
        key = f"{scope['method']} {self.path}"
        called.add(key)
        if status.get("code", 500) < 400:
            worked.add(key)

    APIRoute.handle = handle  # type: ignore[method-assign]
    yield
    APIRoute.handle = original  # type: ignore[method-assign]
    target = os.environ.get("ROUTE_HITS_FILE")
    if target:
        import json

        Path(target).write_text(json.dumps({"called": sorted(called), "worked": sorted(worked)}))
