"""A real send (``smtp`` mode) never reaches a reserved or fake address, even with
EMAIL_SEND_IN_DEV=1 — see app/integrations/email/smtp.py's module docstring."""

import pytest
from structlog.testing import capture_logs

from app.integrations.email import smtp


@pytest.mark.parametrize(
    "address",
    [
        "someone@example.com",
        "someone@example.org",
        "someone@example.net",
        "someone@sub.example.com",
        "someone@arena.test",
        "someone@arena.invalid",
        "someone@arena.localhost",
        "someone@arena.example",
        "someone@localhost",  # no dot at all
        "someone@arenahub",  # no dot at all
    ],
)
def test_reserved_and_no_dot_addresses_are_recognised(address: str) -> None:
    assert smtp._is_reserved_address(address) is True


@pytest.mark.parametrize(
    "address",
    ["someone@gmail.com", "someone@arenahub.pk", "someone@sub.arenahub.pk"],
)
def test_real_looking_addresses_are_not_reserved(address: str) -> None:
    assert smtp._is_reserved_address(address) is False


async def test_a_real_send_to_a_reserved_address_never_opens_a_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        smtp, "email_mode", lambda: {"mode": "smtp", "host": "smtp.gmail.com", "port": 587}
    )

    def never_called(*args: object, **kwargs: object) -> None:
        raise AssertionError("_send_sync must never run for a reserved address")

    monkeypatch.setattr(smtp, "_send_sync", never_called)

    with capture_logs() as logs:
        delivered = await smtp.send_email(
            "someone@example.com", "Your ArenaHub code: 123456", "body", kind="code:registration"
        )
    assert delivered is False
    skip_logs = [entry for entry in logs if entry.get("event") == "email_skipped"]
    assert len(skip_logs) == 1
    assert skip_logs[0]["reason"] == "reserved_address"
    # never the address or anything that looks like a 6-digit code
    assert "example.com" not in str(skip_logs[0])
    assert "123456" not in str(skip_logs[0])


async def test_a_real_looking_address_still_goes_through_send_sync(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        smtp, "email_mode", lambda: {"mode": "smtp", "host": "smtp.gmail.com", "port": 587}
    )
    called = []
    monkeypatch.setattr(smtp, "_send_sync", lambda *a, **k: called.append(True))
    delivered = await smtp.send_email("someone@gmail.com", "Subject", "body", kind="test")
    assert delivered is True
    assert called == [True]
