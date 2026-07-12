"""Shared pytest fixtures.

The async HTTP client drives the ASGI app in-process (no running server).
Tests that don't want real infra override the DB dependency and patch Redis
so the suite stays hermetic (runnable in CI without PostgreSQL/Redis).
"""

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
