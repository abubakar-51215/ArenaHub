"""Health-check endpoint tests (hermetic — DB and Redis are faked)."""

from typing import Any

import pytest
from httpx import AsyncClient

from app.cache.redis import redis_client
from app.database.session import get_db
from app.main import app


class _FakeSession:
    """Minimal stand-in for AsyncSession — SELECT 1 succeeds."""

    async def execute(self, *args: Any, **kwargs: Any) -> None:
        return None


async def _override_db() -> Any:
    yield _FakeSession()


@pytest.fixture(autouse=True)
def _fake_db() -> Any:
    app.dependency_overrides[get_db] = _override_db
    yield
    app.dependency_overrides.pop(get_db, None)


async def test_health_ok_when_dependencies_up(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _ping() -> bool:
        return True

    monkeypatch.setattr(redis_client, "ping", _ping)

    resp = await client.get("/api/v1/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {"api": "ok", "database": "ok", "redis": "ok"}
    assert body["errors"] is None


async def test_health_degraded_when_redis_down(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _ping_fail() -> bool:
        raise ConnectionError("redis unreachable")

    monkeypatch.setattr(redis_client, "ping", _ping_fail)

    resp = await client.get("/api/v1/health")

    assert resp.status_code == 503
    body = resp.json()
    assert body["success"] is False
    assert body["data"]["redis"] == "error"
    assert body["data"]["database"] == "ok"
