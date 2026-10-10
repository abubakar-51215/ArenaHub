"""Email template rendering: the branded HTML must carry the code/token and
never leak unrendered placeholders; text fallback must stand alone."""

import pytest

from app.integrations.email.templates import (
    admin_login_email,
    notification_email,
    otp_email,
    reset_email,
)
from app.modules.notification.service import EVENT_META
from app.shared.otp import OtpPurpose


def test_otp_email_contains_code_in_both_parts() -> None:
    subject, text, html = otp_email("482913", "registration", ttl_minutes=10)
    assert "482913" in subject
    assert "482913" in text and "10 minutes" in text
    assert "482913" in html and "ArenaHub" in html
    assert "{" not in html.split("</style>")[1]  # no unrendered format placeholders


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


def test_password_reset_code_email_says_reset_not_verify() -> None:
    subject, text, html = otp_email("482913", "password_reset", ttl_minutes=10)
    assert "password reset code" in subject
    assert "Reset your password" in html and "Reset your password" in text
    assert "Verify your account" not in html and "Verify your account" not in text


def test_registration_code_email_still_says_verify() -> None:
    _, _, html = otp_email("482913", "registration", ttl_minutes=10)
    assert "Verify your account" in html


@pytest.mark.parametrize("purpose", [p.value for p in OtpPurpose])
def test_every_otp_purpose_renders_the_code_in_both_parts(purpose: str) -> None:
    subject, text, html = otp_email("482913", purpose, ttl_minutes=10, requested_by="a@b.pk")
    assert "482913" in text and "482913" in html
    assert "10 minutes" in text and "10 minutes" in html
    assert text.strip() and "<" not in text  # the plain text stands alone
    assert "{" not in html.replace("{-", "").split("</style>")[1]  # no unrendered placeholders
    if purpose != "admin_login":
        assert "482913" in subject


def test_admin_sign_in_email_subject_has_no_code() -> None:
    subject, text, html = admin_login_email("482913", 10, "admin@arenahub.pk")
    assert "482913" not in subject
    assert subject == "Your ArenaHub admin sign-in code"
    assert "admin@arenahub.pk" in text and "admin@arenahub.pk" in html
    assert "482913" in text and "482913" in html
    # the inbox preview line must not carry the code either
    assert "482913" not in html.split("<body")[1].split("</div>")[0]


def test_html_supports_dark_mode_and_keeps_light_colours_inline() -> None:
    _, _, html = otp_email("482913", "registration", ttl_minutes=10)
    assert "prefers-color-scheme: dark" in html
    assert 'name="color-scheme" content="light dark"' in html
    assert "background-color:#F1F2EF" in html  # light paper stays the inline default
    assert "#0F1A15" in html and "#C4F546" in html  # ink code box, lime digits


def test_html_in_titles_and_bodies_is_escaped() -> None:
    _, text, html = notification_email("<b>Hi</b>", "Reason: <script>alert(1)</script>")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "<b>Hi</b>" in text  # plain text is not HTML, so it is left as written


def test_reset_token_is_escaped_in_html() -> None:
    _, _, html = reset_email("<img src=x>", ttl_minutes=30)
    assert "<img src=x>" not in html and "&lt;img src=x&gt;" in html


@pytest.mark.parametrize("event", sorted(EVENT_META))
def test_every_notice_renders_as_an_email(event: str) -> None:
    meta = EVENT_META[event]
    subject, text, html = notification_email(meta["title"], meta["body"])
    assert subject == f"ArenaHub — {meta['title']}"
    assert text.startswith(meta["title"])
    assert "<!doctype html>" in html and "prefers-color-scheme: dark" in html


def test_every_email_carries_the_40px_badge_above_the_title() -> None:
    for html in (
        otp_email("482913", "registration", ttl_minutes=10)[2],
        reset_email("tok", ttl_minutes=30)[2],
        notification_email("Booking confirmed", "See you on the court!")[2],
    ):
        assert "/brand/email-badge@2x.png" in html
        assert 'width="40" height="40"' in html
        assert html.index("email-badge") < html.index("font-size:22px")  # before the heading
