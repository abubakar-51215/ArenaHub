"""Search, the assistant and the other free-text routes with hostile text: quotes, SQL-looking
words, very long text, emoji, script tags and control characters. Nothing may break (no 500) and
nothing may run (the text only ever comes back as text)."""

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_user

HOSTILE = [
    "'; DROP TABLE users; --",
    '" OR 1=1 --',
    "' UNION SELECT password_hash FROM users --",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "%27%3B%20DROP%20TABLE%20users",
    "'; select pg_sleep(5); --",
    "{{7*7}} ${7*7} {0.__class__}",
    "🏟️⚽🔥" * 40,
    "x" * 900,
    "مرحبا بالعالم 你好 ñ",
    r"a%b_c\d",
]


@pytest.fixture(autouse=True)
def _no_address_limit(client: AsyncClient) -> None:
    from app.cache import redis as redis_cache

    real = client.request

    async def request(*args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        await redis_cache.get_redis().delete("ratelimit:api:127.0.0.1", "abuse:nlp")
        return await real(*args, **kwargs)

    client.request = request  # type: ignore[method-assign]


async def test_search_and_filters_survive_hostile_text(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    for bad in HOSTILE:
        for path, key in (
            ("/api/v1/search/nlp", "q"),
            ("/api/v1/arenas", "q"),
        ):
            res = await client.get(
                path, params={key: bad[:100] if key == "q" and path.endswith("arenas") else bad}
            )
            assert res.status_code in (200, 422), (path, bad[:30], res.status_code, res.text[:120])
            assert "Traceback" not in res.text and "sqlalchemy" not in res.text.lower()
    # the users table is still there
    assert await db_session.scalar(text("select count(*) from users")) is not None


async def test_the_assistant_survives_hostile_text(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "hostile-assist@example.com", "player")
    for bad in HOSTILE:
        res = await client.post(
            "/api/v1/assistant/ask", headers=auth_header(player), json={"text": bad}
        )
        assert res.status_code in (200, 422), (bad[:30], res.status_code, res.text[:150])
        assert "Traceback" not in res.text
        if res.status_code == 200:
            assert "password_hash" not in res.text


async def test_free_text_routes_keep_script_tags_as_plain_text_and_refuse_control_characters(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "hostile-profile@example.com", "player")
    headers = auth_header(player)
    ok = await client.put(
        "/api/v1/users/me", headers=headers, json={"full_name": "<script>alert(1)</script> 🏟️"}
    )
    assert ok.status_code == 200
    # kept exactly as typed: it is shown as text by the apps, never run
    assert ok.json()["data"]["full_name"] == "<script>alert(1)</script> 🏟️"
    for bad in ("nul\x00byte", "bell\x07", "esc\x1b[31m"):
        res = await client.put("/api/v1/users/me", headers=headers, json={"full_name": bad})
        assert res.status_code == 422, repr(bad)
    too_long = await client.put("/api/v1/users/me", headers=headers, json={"full_name": "x" * 300})
    assert too_long.status_code == 422
    # new lines are fine in a long text
    bio = await client.put("/api/v1/users/me", headers=headers, json={"bio": "line one\nline two"})
    assert bio.status_code == 200
