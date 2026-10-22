"""Reset a locked-out admin's password or email, run by hand on the server.

For when every admin account is locked out (forgotten password, lost access to the
inbox a sign-in code would go to) and nobody can use the normal in-app flows, which
all need either the old password or a working inbox. There is deliberately no web
route for this — only someone with a shell on the server can run it.

The new password is typed at the terminal with ``getpass`` (never echoed, never
logged, never written to a file) and is never printed back, not even partially. The
script never reads ``backend/.env`` itself; it reaches the database the same way
every other script here does, through the app's own settings/session machinery
(``app.database.session.SessionFactory``), which is what already owns that file.

Every use writes one ``audit_logs`` row. The row's actor is ``None`` (nobody is
signed in — this *is* the mechanism for when sign-in is impossible), so the trail
instead says what it was: ``action`` is prefixed ``admin.cli_`` and ``details``
notes "run from the server's own command line", which a security review should read
as "whoever had shell access on the server did this, check server access logs for
who that was at this timestamp" — the audit log itself cannot name a person here.

Usage (from backend/):
    uv run python scripts/admin_recovery.py reset-password admin@example.com
    uv run python scripts/admin_recovery.py reset-email admin@example.com
"""

import asyncio
import getpass
import sys

from pydantic import EmailStr, TypeAdapter
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.security import hash_password, validate_password_strength
from app.database.session import SessionFactory
from app.modules.auth.repository import get_user_by_email
from app.modules.user.model import User, UserRole
from app.shared.audit import audit

_RUN_VIA = "run from the server's own command line (scripts/admin_recovery.py)"


async def _find_admin(db: AsyncSession, email: str) -> User:
    user = await get_user_by_email(db, email)
    if user is None:
        raise ValidationError(f"No account with the email {email!r}.")
    if user.role != UserRole.admin:
        raise ValidationError(f"{email!r} is not an admin account (role: {user.role.value}).")
    return user


async def reset_admin_password(db: AsyncSession, email: str, new_password: str) -> User:
    """The core logic, apart from the terminal prompt so it can be tested directly."""
    user = await _find_admin(db, email)
    validate_password_strength(new_password)
    user.password_hash = hash_password(new_password)
    user.pending_password_hash = None  # drop any OTP-reset in flight, now moot
    await audit(
        db,
        "admin.cli_password_reset",
        actor=None,
        target_type="user",
        target_id=user.id,
        details={"via": _RUN_VIA},
        commit=True,
    )
    return user


async def reset_admin_email(db: AsyncSession, email: str, new_email: str) -> User:
    """The core logic, apart from the terminal prompt so it can be tested directly."""
    user = await _find_admin(db, email)
    try:
        validated = TypeAdapter(EmailStr).validate_python(new_email)
    except PydanticValidationError as exc:
        raise ValidationError(f"{new_email!r} is not a valid email address.") from exc
    if await get_user_by_email(db, validated) is not None:
        raise ValidationError(f"{validated!r} is already used by another account.")
    old_email = user.email
    user.email = validated
    user.pending_email = None  # drop any OTP-change in flight, now moot
    await audit(
        db,
        "admin.cli_email_reset",
        actor=None,
        target_type="user",
        target_id=user.id,
        details={"via": _RUN_VIA, "old_email": old_email, "new_email": validated},
        commit=True,
    )
    return user


async def _run_reset_password(email: str) -> None:
    async with SessionFactory() as db:
        password = getpass.getpass("New password: ")
        confirm = getpass.getpass("Type it again: ")
        if password != confirm:
            sys.exit("admin_recovery: the two entries did not match. Nothing changed.")
        try:
            await reset_admin_password(db, email, password)
        except ValidationError as exc:
            sys.exit(f"admin_recovery: {exc.message}")
    print(f"admin_recovery: password reset for {email}. An audit row was written.")


async def _run_reset_email(email: str) -> None:
    async with SessionFactory() as db:
        new_email = input("New email address: ").strip()
        try:
            await reset_admin_email(db, email, new_email)
        except ValidationError as exc:
            sys.exit(f"admin_recovery: {exc.message}")
    print(f"admin_recovery: email for {email} changed to {new_email}. An audit row was written.")


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("reset-password", "reset-email"):
        sys.exit(
            "Usage: uv run python scripts/admin_recovery.py reset-password <email>\n"
            "       uv run python scripts/admin_recovery.py reset-email <email>"
        )
    command, email = sys.argv[1], sys.argv[2]
    if command == "reset-password":
        asyncio.run(_run_reset_password(email))
    else:
        asyncio.run(_run_reset_email(email))


if __name__ == "__main__":
    main()
