"""Sentry is off without a DSN, and when on it strips personal data from every
event before it is sent. The scrubber is tested as a plain function against one
fake event that carries every kind of personal data."""

import pytest

from app.core import config
from app.core.observability import init_sentry, redact_text, scrub_event


def _event_with_all_pii() -> dict:
    return {
        "request": {
            "url": "https://api.arenahub.pk/api/v1/payments",
            "method": "POST",
            "data": {"password": "hunter2", "card": "4242424242424242"},
            "headers": {"Authorization": "Bearer eyJhbGciOiJIUzI1Ni)secrettoken"},
            "cookies": {"session": "abc123"},
            "query_string": "token=eyJsecret&x=1",
            "env": {"REMOTE_ADDR": "203.0.113.9"},
        },
        "user": {
            "id": "11111111-1111-1111-1111-111111111111",
            "email": "player@example.com",
            "ip_address": "203.0.113.9",
            "username": "player1",
        },
        "message": "login failed for player@example.com from 03001234567",
        "breadcrumbs": [
            {"message": "GET /api/v1/media/receipts/abc123.jpg?expires=1&sig=deadbeef"},
            {"message": "token=eyJabcdefghijklmnop was used"},
        ],
        "extra": {
            "note": "contact +923001234567",
            "receipt": "/uploads/receipts/ff00.jpg",
            "api_key": "sk_live_realsecretvalue",
        },
    }


def test_request_body_headers_cookies_query_are_dropped() -> None:
    event = scrub_event(_event_with_all_pii())
    req = event["request"]
    assert "data" not in req
    assert "headers" not in req
    assert "cookies" not in req
    assert "query_string" not in req
    assert "env" not in req
    # the harmless parts stay
    assert req["method"] == "POST" and req["url"].endswith("/payments")


def test_user_is_reduced_to_an_anonymous_id() -> None:
    event = scrub_event(_event_with_all_pii())
    assert event["user"] == {"id": "11111111-1111-1111-1111-111111111111"}
    assert "email" not in event["user"]
    assert "ip_address" not in event["user"]
    assert "username" not in event["user"]


def test_emails_phones_tokens_and_receipt_links_are_redacted_everywhere() -> None:
    event = scrub_event(_event_with_all_pii())
    blob = repr(event)
    assert "player@example.com" not in blob
    assert "03001234567" not in blob and "+923001234567" not in blob
    assert "eyJabcdefghijklmnop" not in blob
    assert "receipts/abc123.jpg" not in blob
    assert "/uploads/receipts/ff00.jpg" not in blob
    # a key that *names* a secret is redacted whatever its value
    assert "sk_live_realsecretvalue" not in blob


def test_a_near_me_lat_or_lon_in_a_fetch_breadcrumb_is_redacted() -> None:
    """request.query_string is dropped wholesale by scrub_event, but Sentry also auto-captures
    breadcrumbs for the client's own outgoing fetch/XHR calls with the full URL as free text —
    this is the gap a near-me search's coordinates could otherwise leak through."""
    event = {
        "breadcrumbs": [
            {
                "category": "fetch",
                "data": {
                    "url": "https://api.arenahub.pk/api/v1/arenas?sort=near&lat=31.5204&lon=74.3587&radius_km=5&amenity_ids=7d5b7c52-0000&amenities=cctv&time_of_day=evening",
                    "method": "GET",
                },
            }
        ],
    }
    out = scrub_event(event)
    blob = repr(out)
    assert "31.5204" not in blob
    assert "74.3587" not in blob
    assert "lat=[redacted]" in blob
    assert "lon=[redacted]" in blob
    assert "7d5b7c52" not in blob and "evening" not in blob
    assert "amenity_ids=[redacted]" in blob and "time_of_day=[redacted]" in blob
    assert "cctv" not in blob and "amenities=[redacted]" in blob


def test_redact_text_handles_each_kind() -> None:
    assert redact_text("mail me at a@b.com") == "mail me at [redacted]"
    assert redact_text("call 03123456789") == "call [redacted]"
    assert redact_text("Bearer eyJxxxxxxxx") == "[redacted]"
    assert redact_text("see /uploads/receipts/zz.png now").startswith("see [redacted]")


def test_scrub_is_idempotent_and_keeps_shape() -> None:
    once = scrub_event(_event_with_all_pii())
    twice = scrub_event(scrub_event(_event_with_all_pii()))
    assert once.keys() == twice.keys()


def test_sentry_is_off_without_a_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/x_test")
    monkeypatch.setenv("ENVIRONMENT", "dev")
    settings = config.get_settings.__wrapped__()
    monkeypatch.setattr(config, "get_settings", lambda: settings)
    # reach init_sentry's get_settings through the patched module
    monkeypatch.setattr("app.core.observability.get_settings", lambda: settings)
    assert init_sentry() is False
