"""Email templates: code emails say the same words in HTML and text, carry no links, images,
tracking or addresses; notice emails wrap their title and body; HTML is escaped and dark mode is
supported."""

import re
from datetime import UTC, datetime

import pytest

from app.integrations.email.templates import (
    CODE_IGNORE_LINE,
    CODE_PURPOSE_WORDS,
    code_email,
    email_changed_email,
    notification_email,
    password_changed_email,
)
from app.modules.notification.service import EVENT_META
from app.shared.otp import OtpPurpose


@pytest.mark.parametrize("purpose", [p.value for p in OtpPurpose])
def test_every_code_email_says_the_same_in_html_and_text(purpose: str) -> None:
    subject, text, html = code_email("482913", purpose, ttl_minutes=10)
    assert subject == "Your ArenaHub code: 482913"
    for line in (
        CODE_PURPOSE_WORDS[purpose],
        "It works for 10 minutes.",
        CODE_IGNORE_LINE,
        "482913",
    ):
        assert line in text, line
        assert line in html, line
    assert text.strip() and "<" not in text  # the plain text stands alone
    assert "{" not in html.split("</style>")[1]  # no unrendered placeholders


def test_the_purposes_are_in_plain_words() -> None:
    assert CODE_PURPOSE_WORDS["registration"] == "Confirm your email"
    assert CODE_PURPOSE_WORDS["admin_login"] == "Sign in as admin"
    assert CODE_PURPOSE_WORDS["password_reset"] == "Reset your password"
    assert CODE_PURPOSE_WORDS["email_change"] == "Confirm your new email"


def test_a_code_email_has_no_links_images_tracking_or_support_address() -> None:
    _, text, html = code_email("482913", "registration", ttl_minutes=10)
    assert "<a " not in html and "href" not in html  # no links
    assert "<img" not in html and "url(" not in html  # no remote images: nothing to track
    assert "@" not in text and "mailto" not in html  # no address of any kind
    assert not re.search(r"\b[a-z]+_[a-z_]+\b", text)  # no raw keys
    # the code is text the reader can select, in a large size (not an image)
    assert re.search(r"font-size:36px[^>]*>\s*482913<", html.replace("\n", " "))


def test_html_supports_dark_mode_and_keeps_light_colours_inline() -> None:
    _, _, html = code_email("482913", "registration", ttl_minutes=10)
    assert "prefers-color-scheme: dark" in html
    assert 'name="color-scheme" content="light dark"' in html
    assert "background-color:#F1F2EF" in html  # light paper stays the inline default
    assert "#0F1A15" in html and "#C4F546" in html  # ink code box, lime digits


def test_the_old_address_is_told_about_a_change_of_email() -> None:
    when = datetime(2026, 10, 15, 14, 5, tzinfo=UTC)  # 7:05 PM in Pakistan
    subject, text, html = email_changed_email("n***@gmail.com", when)
    assert subject == "Your ArenaHub email was changed"
    assert "n***@gmail.com" in text and "n***@gmail.com" in html
    assert "15 Oct 2026, 7:05 PM (Pakistan time)" in text
    assert "If this was not you, log in and change your password." in text
    assert "support" not in text.lower() and "@arenahub" not in text


def test_the_password_change_notice_says_what_when_and_what_to_do() -> None:
    when = datetime(2026, 10, 15, 14, 5, tzinfo=UTC)
    subject, text, html = password_changed_email(when)
    assert subject == "Your ArenaHub password was changed"
    assert "The password for your ArenaHub account was changed on 15 Oct 2026, 7:05 PM" in text
    assert "If this was not you, log in and change your password." in text
    assert "If this was not you, log in and change your password." in html
    assert "<a " not in html and "href" not in html and "<img" not in html


def test_notification_email_wraps_title_and_body() -> None:
    subject, text, html = notification_email("Booking confirmed", "See you on the court!")
    assert subject == "ArenaHub — Booking confirmed"
    assert "Booking confirmed" in html and "See you on the court!" in html
    assert text.startswith("Booking confirmed")


def test_html_in_titles_and_bodies_is_escaped() -> None:
    _, text, html = notification_email("<b>Hi</b>", "Reason: <script>alert(1)</script>")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "<b>Hi</b>" in text  # plain text is not HTML, so it is left as written


@pytest.mark.parametrize("event", sorted(EVENT_META))
def test_every_notice_renders_as_an_email(event: str) -> None:
    meta = EVENT_META[event]
    subject, text, html = notification_email(meta["title"], meta["body"])
    assert subject == f"ArenaHub — {meta['title']}"
    assert text.startswith(meta["title"])
    assert "<!doctype html>" in html and "prefers-color-scheme: dark" in html


def test_notice_emails_carry_the_badge_and_code_emails_do_not() -> None:
    html = notification_email("Booking confirmed", "See you on the court!")[2]
    assert "/brand/email-badge@2x.png" in html and 'width="40" height="40"' in html
    assert html.index("email-badge") < html.index("font-size:22px")  # before the heading
    for other in (
        code_email("482913", "registration", 10)[2],
        email_changed_email("n***@x.pk", datetime(2026, 10, 15, tzinfo=UTC))[2],
    ):
        assert "email-badge" not in other
