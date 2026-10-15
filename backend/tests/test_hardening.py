"""Headers, size and time limits, CORS, docs switched off, log redaction (Phase 6)."""

import asyncio
import inspect

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.core.config import Environment, get_settings
from app.core.logging import HIDDEN, redact_secrets
from app.main import app, create_app
from app.middleware import hardening


async def test_every_answer_carries_the_protective_headers(client: AsyncClient) -> None:
    res = await client.get("/api/v1/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["x-request-id"]
    # an error answer carries them too
    bad = await client.get("/api/v1/users/me")
    assert bad.status_code == 401
    assert bad.headers["cache-control"] == "no-store"
    assert bad.headers["x-content-type-options"] == "nosniff"


async def test_stored_pictures_cannot_run_as_pages(client: AsyncClient) -> None:
    res = await client.get("/uploads/does-not-exist.png")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in res.headers["content-security-policy"]


async def test_hsts_is_sent_only_outside_development() -> None:
    async def inner(scope, receive, send):  # noqa: ANN001, ANN202
        await JSONResponse({})(scope, receive, send)

    for production, expected in ((False, False), (True, True)):
        middleware = hardening.SecurityHeadersMiddleware(inner)
        middleware.production = production
        async with AsyncClient(transport=ASGITransport(app=middleware), base_url="http://t") as c:
            res = await c.get("/x")
        assert ("strict-transport-security" in res.headers) is expected


async def test_a_body_over_the_size_limit_is_refused_before_it_is_read(
    client: AsyncClient,
) -> None:
    res = await client.post("/api/v1/auth/login", content=b"x" * (2 * 1024 * 1024))
    assert res.status_code == 413
    assert res.json()["message"]
    assert res.headers["x-content-type-options"] == "nosniff"


async def test_a_body_that_lies_about_its_size_is_stopped_while_it_arrives(
    client: AsyncClient,
) -> None:
    async def chunks():  # noqa: ANN202
        for _ in range(3):
            yield b"y" * (600 * 1024)

    # sent in pieces, so there is no length header to check up front
    res = await client.post("/api/v1/auth/login", content=chunks())
    assert res.status_code in (400, 413)
    assert "Traceback" not in res.text


async def test_a_request_that_runs_too_long_is_ended(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hardening, "REQUEST_SECONDS", 0.05)

    async def slow(request):  # noqa: ANN001, ANN202
        await asyncio.sleep(1)
        return JSONResponse({})

    inner = Starlette(routes=[Route("/api/v1/slow", slow)])
    transport = ASGITransport(app=hardening.TimeLimitMiddleware(inner))
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        res = await c.get("/api/v1/slow")
    assert res.status_code == 504
    assert "Traceback" not in res.text


async def test_an_internal_error_shows_only_generic_text() -> None:
    boom = create_app()

    @boom.get("/api/v1/_boom")
    async def _boom() -> None:
        raise RuntimeError("secret table users at C:\\srv\\app\\db.py password=hunter2")

    transport = ASGITransport(app=boom, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        res = await c.get("/api/v1/_boom")
    assert res.status_code == 500
    assert res.json()["message"] == "Internal server error"
    for leak in ("hunter2", "db.py", "RuntimeError", "Traceback", "users"):
        assert leak not in res.text


async def test_cors_allows_only_the_listed_origins(client: AsyncClient) -> None:
    good = await client.get("/api/v1/health", headers={"Origin": "http://localhost:3000"})
    assert good.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert good.headers.get("access-control-allow-credentials") == "true"
    for evil in ("https://evil.example", "null", "http://localhost:3000.evil.example"):
        res = await client.get("/api/v1/health", headers={"Origin": evil})
        assert "access-control-allow-origin" not in res.headers, evil
    pre = await client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in pre.headers


class _Production:
    is_dev = False


def test_log_values_with_secret_names_are_hidden_outside_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.logging.get_settings", lambda: _Production())
    event = {
        "event": "x",
        "password": "hunter2",
        "new_password": "hunter3",
        "refresh_token": "abc",
        "Authorization": "Bearer abc",
        "code": "123456",
        "account_number": "PK36SCBL0000001123456702",
        "booking_code": "AH-1234",
        "user_id": "u1",
    }
    out = redact_secrets(None, "info", dict(event))
    hidden = (
        "password",
        "new_password",
        "refresh_token",
        "Authorization",
        "code",
        "account_number",
    )
    for key in hidden:
        assert out[key] == HIDDEN, key
    assert out["booking_code"] == "AH-1234"
    assert out["user_id"] == "u1"


def test_the_emailed_code_is_never_logged_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    """The line that prints the code sits inside the development-mode check, and the log filter
    hides a ``code`` value anyway."""
    from app.shared import codes

    lines = inspect.getsource(codes._deliver).splitlines()
    log_line = next(i for i, line in enumerate(lines) if "code_dev_delivery" in line)
    guard = next(i for i, line in enumerate(lines) if "if settings.is_dev:" in line)
    assert guard < log_line

    monkeypatch.setattr("app.core.logging.get_settings", lambda: _Production())
    out = redact_secrets(None, "info", {"event": "code_dev_delivery", "code": "123456"})
    assert out["code"] == HIDDEN


def test_the_docs_and_schema_are_switched_off_outside_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.main as main_module

    assert app.docs_url == "/docs"  # development

    class Staging:
        is_dev = False
        environment = Environment.staging
        allowed_hosts = "api.example.test"
        cors_allowed_origins = "https://app.example.test"
        media_url_prefix = "/uploads"
        media_root = "uploads"

    monkeypatch.setattr(main_module, "settings", Staging())
    built = main_module.create_app()
    assert built.docs_url is None and built.redoc_url is None and built.openapi_url is None
    assert get_settings().is_dev  # the real settings were not touched
