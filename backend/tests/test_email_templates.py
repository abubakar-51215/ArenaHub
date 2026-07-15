"""Email template rendering: the branded HTML must carry the code/token and
never leak unrendered placeholders; text fallback must stand alone."""

from app.integrations.email.templates import notification_email, otp_email, reset_email


def test_otp_email_contains_code_in_both_parts() -> None:
    subject, text, html = otp_email("482913", "registration", ttl_minutes=10)
    assert "482913" in subject
    assert "482913" in text and "10 minutes" in text
    assert "482913" in html and "ArenaHub" in html
    assert "{" not in html.replace("{-", "")  # no unrendered format placeholders


def test_reset_email_contains_token() -> None:
    token = "abc123XYZ-token"
    _, text, html = reset_email(token, ttl_minutes=30)
    assert token in text and token in html
    assert "30 minutes" in text


def test_notification_email_wraps_title_and_body() -> None:
    subject, text, html = notification_email("Booking confirmed", "See you on the court!")
    assert subject == "ArenaHub — Booking confirmed"
    assert "Booking confirmed" in html and "See you on the court!" in html
    assert text.startswith("Booking confirmed")
