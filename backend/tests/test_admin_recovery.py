"""The admin lockout recovery script (scripts/admin_recovery.py): its core logic, not
the interactive terminal prompt. Only ever operates on an admin account, writes an
audit row with no signed-in actor, and never exposes the new password."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.admin.model import AuditLog
from app.modules.user.model import User
from scripts.admin_recovery import reset_admin_email, reset_admin_password
from tests.helpers import make_admin, make_user


async def test_reset_admin_password_changes_the_hash_and_writes_an_audit_row(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_admin(client, db_session, "recover1@example.com")
    user = (
        await db_session.execute(select(User).where(User.email == "recover1@example.com"))
    ).scalar_one()
    old_hash = user.password_hash

    await reset_admin_password(db_session, "recover1@example.com", "NewStrongPass1!")
    await db_session.refresh(user)
    assert user.password_hash != old_hash
    assert user.pending_password_hash is None

    rows = (
        (
            await db_session.execute(
                select(AuditLog).where(AuditLog.action == "admin.cli_password_reset")
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].actor_id is None
    assert str(rows[0].target_id) == str(user.id)
    assert "run from the server" in rows[0].details["via"]


async def test_reset_admin_password_refuses_a_weak_password(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_admin(client, db_session, "recover2@example.com")
    with pytest.raises(ValidationError):
        await reset_admin_password(db_session, "recover2@example.com", "weak")


async def test_reset_admin_password_refuses_a_non_admin_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_user(client, db_session, "recover3@example.com", "player")
    with pytest.raises(ValidationError, match="not an admin"):
        await reset_admin_password(db_session, "recover3@example.com", "NewStrongPass1!")


async def test_reset_admin_password_refuses_an_unknown_email(db_session: AsyncSession) -> None:
    with pytest.raises(ValidationError, match="No account"):
        await reset_admin_password(db_session, "nobody-here@example.com", "NewStrongPass1!")


async def test_reset_admin_email_changes_it_and_refuses_a_taken_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_admin(client, db_session, "recover4@example.com")
    await make_admin(client, db_session, "recover4-other@example.com")

    await reset_admin_email(db_session, "recover4@example.com", "recover4-new@example.com")
    moved = (
        await db_session.execute(select(User).where(User.email == "recover4-new@example.com"))
    ).scalar_one()
    assert moved.pending_email is None

    with pytest.raises(ValidationError, match="already used"):
        await reset_admin_email(
            db_session, "recover4-new@example.com", "recover4-other@example.com"
        )


async def test_reset_admin_email_refuses_a_malformed_address(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_admin(client, db_session, "recover5@example.com")
    with pytest.raises(ValidationError, match="not a valid email"):
        await reset_admin_email(db_session, "recover5@example.com", "not-an-email")
