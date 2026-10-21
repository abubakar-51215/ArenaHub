"""Write every email type to an HTML file with sample data. NOT part of the test suite, never
runs in CI, and never sends a real email — it only calls the template builder functions
(``app/integrations/email/templates.py``) directly and writes their HTML to disk.

Run it yourself (from backend/):
    uv run python scripts/email_preview.py

Output goes to backend/scripts/.email_preview/ (gitignored). To build the contact-sheet picture
of all of them, light and dark, run (from the repo root, needs Node + the root playwright dep
already used for the design-prototype screenshots):
    node scripts/email_contact_sheet.mjs
"""

from datetime import UTC, datetime
from pathlib import Path

from app.integrations.email.templates import (
    code_email,
    email_changed_email,
    notification_email,
    owner_login_alert_email,
    password_changed_email,
    password_reset_email,
    player_login_alert_email,
)

OUT_DIR = Path(__file__).resolve().parent / ".email_preview"
SAMPLE_WHEN = datetime(2026, 10, 16, 15, 30, tzinfo=UTC)  # 8:30 PM in Pakistan
SAMPLE_WHEN_TEXT = "Fri, 16-Oct-2026 at 08:30:00 PM"
SUPPORT_EMAIL = "arenahub.support@gmail.com"


def _write(name: str, html: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.html"
    path.write_text(html, encoding="utf-8")
    print(f"wrote {path.relative_to(OUT_DIR.parent.parent.parent)}")


def main() -> None:
    # Layout A — the login alert (player and owner)
    _write(
        "01-login-alert-owner",
        owner_login_alert_email(
            "Ayesha Khan",
            "ayesha.khan@example.com",
            SAMPLE_WHEN_TEXT,
            "Password",
            "Chrome on Windows",
            "203.0.113.42",
            SUPPORT_EMAIL,
        )[2],
    )
    _write(
        "02-login-alert-player",
        player_login_alert_email(
            "Bilal Ahmed",
            "bilal.ahmed@example.com",
            SAMPLE_WHEN_TEXT,
            "Google",
            "Safari on iPhone",
            "198.51.100.7",
            SUPPORT_EMAIL,
        )[2],
    )
    _write(
        "02b-login-alert-unavailable",
        player_login_alert_email(
            "Zara Sheikh",
            "zara.sheikh@example.com",
            SAMPLE_WHEN_TEXT,
            "Password",
            "Not available",
            "Not available",
            SUPPORT_EMAIL,
        )[2],
    )

    # Layout B — every emailed code except password reset
    _write("03-code-registration", code_email("482913", "registration", 10, "Hassan Raza")[2])
    _write("04-code-admin-login", code_email("739201", "admin_login", 10, "Admin")[2])
    _write("05-code-password-change", code_email("184756", "password_change", 10, "Sara Iqbal")[2])
    _write("06-code-email-change", code_email("563920", "email_change", 10, "Omer Malik")[2])
    _write("07-code-phone-change", code_email("912384", "phone_change", 10, "Nida Farooq")[2])

    # Layout C — password reset
    _write(
        "08-password-reset",
        password_reset_email("657348", 10, "Imran Qureshi", SUPPORT_EMAIL)[2],
    )
    _write(
        "08b-password-reset-no-name",
        password_reset_email("657348", 10, None, SUPPORT_EMAIL)[2],
    )

    # Unrestyled (no mockup given this round): kept for a complete contact sheet
    _write(
        "09-email-changed-notice",
        email_changed_email("h***@gmail.com", SAMPLE_WHEN)[2],
    )
    _write("10-password-changed-notice", password_changed_email(SAMPLE_WHEN)[2])
    _write(
        "11-notification-booking-confirmed",
        notification_email(
            "Booking confirmed", "Your court is booked for Saturday 6:00 PM. See you there!"
        )[2],
    )

    written = len(list(OUT_DIR.glob("*.html")))
    rel = OUT_DIR.relative_to(OUT_DIR.parent.parent.parent)
    print(f"\n{rel}: {written} files written")


if __name__ == "__main__":
    main()
