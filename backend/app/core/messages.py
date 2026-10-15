"""User-visible text the security work added, in ONE place so the owner can read and approve it.

Approved by the owner on 2026-10-15 (see docs/SECURITY.md). Nothing here names a support email,
phone or hours.
"""

import math
from datetime import datetime
from zoneinfo import ZoneInfo

KARACHI = ZoneInfo("Asia/Karachi")

# Phase 2: a password on the common list
COMMON_PASSWORD = "Choose a less common password."


def too_many_attempts(seconds: float) -> str:
    """ "Too many attempts. Try again in N minutes." (N rounded up; "1 minute" when it is one)."""
    minutes = max(1, math.ceil(seconds / 60))
    unit = "minute" if minutes == 1 else "minutes"
    return f"Too many attempts. Try again in {minutes} {unit}."


def _karachi(when: datetime) -> str:
    local = when.astimezone(KARACHI)
    hour = local.hour % 12 or 12
    half = "AM" if local.hour < 12 else "PM"
    return (
        f"{local.day} {local.strftime('%b %Y')}, {hour}:{local.minute:02d} {half} (Pakistan time)"
    )


# Phase 3: emailed to the account owner after a change (what changed, when, what to do)
def password_changed_notice(when: datetime) -> tuple[str, str]:
    """(subject, body) for a password change."""
    subject = "Your ArenaHub password was changed"
    body = (
        f"The password for your ArenaHub account was changed on {_karachi(when)}.\n\n"
        "If this was not you, log in and change your password."
    )
    return subject, body


def email_changed_notice(new_masked: str, when: datetime) -> tuple[str, str]:
    """(subject, body) for a change of email, sent to the OLD address."""
    subject = "Your ArenaHub email was changed"
    body = (
        f"The email for your ArenaHub account was changed to {new_masked} on {_karachi(when)}.\n\n"
        "If this was not you, log in and change your password."
    )
    return subject, body
