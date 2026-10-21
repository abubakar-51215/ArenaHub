"""Email templates: Layout B (every emailed code except password reset) and Layout C (password
reset) say the same words in HTML and text, carry no links except an allowed support mailto, a
plain-text version always exists, and HTML is escaped with dark mode supported. Also covers the
unrestyled notice emails (email_changed/password_changed/notification), unchanged in this round."""

import re
from datetime import UTC, datetime

import pytest

from app.core import messages
from app.integrations.email.templates import (
    CODE_PURPOSE_WORDS,
    code_email,
    email_changed_email,
    notification_email,
    password_changed_email,
    password_reset_email,
)
from app.modules.notification.service import EVENT_META
from app.shared.otp import OtpPurpose

# password_reset is Layout C, not Layout B.
_LAYOUT_B_PURPOSES = [p.value for p in OtpPurpose if p.value != "password_reset"]


@pytest.mark.parametrize("purpose", _LAYOUT_B_PURPOSES)
def test_every_layout_b_code_email_says_the_same_in_html_and_text(purpose: str) -> None:
    subject, text, html = code_email("482913", purpose, ttl_minutes=10, name="Zara Khan")
    assert subject == "Your ArenaHub code: 482913"
    for line in (
        CODE_PURPOSE_WORDS[purpose],
        messages.CODE_EXPLANATION_WORDS[purpose],
        "This code is valid for 10 minutes.",
        messages.CODE_DO_NOT_SHARE,
        messages.CODE_IGNORE_SHORT_LINE,
        "Hello Zara Khan,",
        "482913",
    ):
        assert line in text, line
        assert line in html, line
    assert text.strip() and "<" not in text  # the plain text stands alone
    assert "{" not in html.split("</style>")[1]  # no unrendered placeholders


def test_a_code_email_with_no_name_uses_the_bare_greeting() -> None:
    _, text, html = code_email("482913", "registration", ttl_minutes=10, name=None)
    assert "Hello," in text and "Hello," in html
    assert "Hello None" not in text and "Hello None" not in html


def test_the_purposes_are_in_plain_words() -> None:
    assert CODE_PURPOSE_WORDS["registration"] == "Confirm your email"
    assert CODE_PURPOSE_WORDS["admin_login"] == "Sign in as admin"
    assert CODE_PURPOSE_WORDS["password_reset"] == "Reset your password"
    assert CODE_PURPOSE_WORDS["email_change"] == "Confirm your new email"


def test_a_layout_b_code_email_has_no_links_or_support_address() -> None:
    _, text, html = code_email("482913", "registration", ttl_minutes=10, name="Zara")
    assert "<a " not in html and "href" not in html  # no links at all
    assert "@" not in text  # no address of any kind in the text part
    assert not re.search(r"\b[a-z]+_[a-z_]+\b", text)  # no raw keys
    # the code is text the reader can select, in a large size (not an image)
    assert re.search(r"font-size:36px[^>]*>\s*482913<", html.replace("\n", " "))
    # Layout B's own logo IS an image (the grey top bar), with alt text as the fallback
    assert html.count("<img") == 1
    assert 'alt="ArenaHub"' in html


def test_layout_b_is_600px_wide_and_supports_dark_mode() -> None:
    _, _, html = code_email("482913", "registration", ttl_minutes=10)
    assert "max-width:600px" in html
    assert "prefers-color-scheme: dark" in html
    assert 'name="color-scheme" content="light dark"' in html
    assert "background-color:#F1F2EF" in html  # light paper stays the inline default
    assert "#0F1A15" in html and "#C4F546" in html  # ink code box, lime digits


def test_password_reset_is_layout_c_left_aligned_with_only_the_support_link() -> None:
    subject, text, html = password_reset_email("739201", 10, "Omer Raza", "help@example.test")
    assert subject == "Your ArenaHub code: 739201"
    for line in (
        "Reset your password",
        "Hi Omer Raza,",
        messages.RESET_EXPLANATION,
        "This code is valid for 10 minutes.",
        messages.CODE_IGNORE_SHORT_LINE,
        "739201",
        "Cheers,",
        "The ArenaHub Team",
    ):
        assert line in text, line
        assert line in html, line
    assert "help@example.test" in text
    # the only link anywhere is the support mailto — no button, no reset link
    assert html.count("<a ") == 1
    assert 'href="mailto:help@example.test"' in html
    assert "reset-password" not in html.lower() and "token=" not in html
    assert html.count("<img") == 1 and 'alt="ArenaHub"' in html  # the logo, left-aligned
    assert "max-width:600px" in html


def test_password_reset_with_no_name_uses_the_bare_greeting() -> None:
    _, text, _ = password_reset_email("111111", 10, None, "help@example.test")
    assert "Hi there," in text


def test_password_reset_never_includes_a_second_link_or_tracking() -> None:
    _, text, html = password_reset_email("111111", 10, "A", "help@example.test")
    assert html.count("href=") == 1  # the one allowed support mailto
    assert not re.search(r"\b[a-z]+_[a-z_]+\b", text)  # no raw keys in the text


def test_every_code_email_has_a_plain_text_version() -> None:
    for _subject, text, html in (
        code_email("482913", "registration", 10, "A"),
        code_email("482913", "admin_login", 10, None),
        password_reset_email("482913", 10, "A", "help@example.test"),
    ):
        assert text.strip() and "<" not in text
        assert html.strip().startswith("<!doctype html>")


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


def test_notice_emails_carry_the_badge_and_code_emails_do_not_reuse_it() -> None:
    """The badge is inlined as a data URI (no external address a mail client could fail to
    reach), not referenced by file name."""
    html = notification_email("Booking confirmed", "See you on the court!")[2]
    assert "data:image/png;base64," in html and 'width="40" height="40"' in html
    assert html.index("data:image/png;base64,") < html.index("font-size:22px")  # before heading
    for other in (email_changed_email("n***@x.pk", datetime(2026, 10, 15, tzinfo=UTC))[2],):
        assert "data:image/png;base64," not in other
