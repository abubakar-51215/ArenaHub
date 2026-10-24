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


# Phase 4: retried requests (placeholders, wording not yet approved by the owner)
IDEMPOTENCY_BUSY = "This request is already being processed."
IDEMPOTENCY_MISMATCH = "This request key was already used for a different request."

# Phase 5: a text with control characters in it (placeholder, wording not yet approved)
BAD_CHARACTERS = "Remove the special characters and try again."

# Phase 6: size and time limits (placeholders, wording not yet approved by the owner)
REQUEST_TOO_LARGE = "That request is too large."
REQUEST_TOO_SLOW = "That took too long. Please try again."
# New wording, listed for approval: shown when the booking lock service (Redis) cannot be reached
BOOKING_TEMPORARILY_UNAVAILABLE = "Booking is not available for a moment. Please try again shortly."


# Owner login alert (wording from the owner; the support address is the SUPPORT_EMAIL setting)
OWNER_LOGIN_SUBJECT = "ArenaHub login alert"


def _login_alert_lines(
    name: str, when_text: str, support_email: str, account_noun: str
) -> tuple[str, str, str, str]:
    """(greeting, what happened, what to do if it was not you, sign-off)."""
    return (
        f"Dear {name},",
        f"This is to inform you that you have successfully logged into your ArenaHub "
        f"{account_noun} on {when_text} (Pakistan time).",
        "If this was not you, please change your password right away and contact ArenaHub "
        f"support at {support_email}.",
        "Thank you," + chr(10) + "ArenaHub",
    )


def owner_login_alert_lines(
    name: str, when_text: str, support_email: str
) -> tuple[str, str, str, str]:
    """The login-alert lines for an arena owner."""
    return _login_alert_lines(name, when_text, support_email, "owner account")


def player_login_alert_lines(
    name: str, when_text: str, support_email: str
) -> tuple[str, str, str, str]:
    """The login-alert lines for a player (role-neutral: "your ArenaHub account")."""
    return _login_alert_lines(name, when_text, support_email, "account")


# Email restyle, Layout B (every emailed code except password reset) — new wording.
CODE_GREETING_NAMED = "Hello {name},"
CODE_GREETING_BARE = "Hello,"
CODE_VALID_LINE = "This code is valid for 10 minutes."
CODE_DO_NOT_SHARE = "Do not share this code with anyone."
CODE_IGNORE_SHORT_LINE = "If you didn't request this, ignore this email."

# One line per code purpose saying what the code is for (Layout B's explanation line). The purpose
# names reuse the already-approved CODE_PURPOSE_WORDS as the centred title; these are new.
CODE_EXPLANATION_WORDS = {
    "registration": "Use this code to confirm your email address.",
    "admin_login": "Use this code to finish signing in as an admin.",
    "password_change": "Use this code to confirm your new password.",
    "email_change": "Use this code to confirm your new email address.",
    "phone_change": "Use this code to confirm your new phone number.",
    "account_deletion": "Use this code to confirm deleting your account.",
    "bank_details_change": "Use this code to confirm a change to your arena's bank account.",
}

# Email restyle, Layout C (password reset) — new wording.
RESET_GREETING_NAMED = "Hi {name},"
RESET_GREETING_BARE = "Hi there,"
RESET_EXPLANATION = "A password reset was requested for your ArenaHub account."
RESET_HELP_LINE = "Need help? Contact us at {support_email}."
RESET_SIGN_OFF = "Cheers," + chr(10) + "The ArenaHub Team"


# Paying by card or mobile wallet (approved by the owner on 2026-10-16)
WALLET_NUMBER_NEEDED = "Enter your {wallet} number."
WALLET_NUMBER_INVALID = "Enter a Pakistani mobile number, like 0300 1234567."
RETURN_ADDRESS_REFUSED = "This return address is not allowed."

# Owner blocked dates (approved by the owner on 2026-10-22)
BLOCKED_DATE_IN_PAST = "You can't block a date that has already passed."


# The test push the server owner sends before a real-phone check (backend/scripts/send_test_push.py)
TEST_PUSH_TITLE = "ArenaHub test notification"
TEST_PUSH_BODY = "Push notifications are working on this phone."

# Joining a match at an arena that is suspended, removed or not live
ARENA_UNAVAILABLE = "This arena is not available right now."

# The standard amenity list (a key that is not on it, or text an owner tries to add)
AMENITY_NOT_ON_LIST = "One or more amenities are not on the standard list."
AMENITY_EXTRA_CANNOT_ADD = "Older amenity text can be removed but not added."


# Owner single-slot management (wording for the owner's approval)
SLOT_STATUS_NOT_SETTABLE = "A slot can only be blocked or unblocked."
SLOT_DELETE_ONLY_FREE = "Only a free slot that never had a booking can be deleted."

# Complaint status steps (wording for the owner's approval)
COMPLAINT_MOVE_NOT_ALLOWED = "This complaint cannot be moved to that status."
