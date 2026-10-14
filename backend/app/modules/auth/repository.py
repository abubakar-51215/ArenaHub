"""Data access for auth flows — users, OTPs, reset tokens, password history.

Repository layer: queries and inserts only, no business rules. Callers own the
transaction (commit in the service). Inserts flush so server defaults / ids are
populated on the returned instance.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import OtpVerification, PasswordHistory, PasswordResetToken
from app.modules.user.model import User, UserRole
from app.shared.otp import OtpPurpose
from app.shared.phone import stored_digit_forms


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Email is matched without regard to case (Ali@x.com signs in as ali@x.com).
    The oldest account wins if old data holds two that differ only in case."""
    result = await db.execute(
        select(User)
        .where(func.lower(User.email) == email.strip().lower())
        .order_by(User.created_at)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_user_by_google_sub(db: AsyncSession, sub: str) -> User | None:
    result = await db.execute(select(User).where(User.google_sub == sub).limit(1))
    return result.scalar_one_or_none()


def _phone_matches(phone: str):
    """Rows whose stored phone is this number, whatever its spelling (see
    app.shared.phone). Deleted accounts hold an anonymised value and never match."""
    return (
        func.regexp_replace(User.phone, "[^0-9]", "", "g").in_(stored_digit_forms(phone)),
        User.deleted_at.is_(None),
    )


async def get_user_by_phone(db: AsyncSession, phone: str) -> User | None:
    result = await db.execute(select(User).where(*_phone_matches(phone)).limit(1))
    return result.scalar_one_or_none()


async def get_users_by_phone(db: AsyncSession, phone: str, limit: int = 2) -> list[User]:
    """Up to ``limit`` accounts holding this phone, so a caller can tell one from
    several. Admins are left out: they sign in by email only."""
    result = await db.execute(
        select(User).where(*_phone_matches(phone), User.role != UserRole.admin).limit(limit)
    )
    return list(result.scalars().all())


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def create_user(
    db: AsyncSession,
    *,
    full_name: str,
    email: str,
    phone: str,
    password_hash: str,
    role: UserRole,
) -> User:
    user = User(
        full_name=full_name,
        email=email,
        phone=phone,
        password_hash=password_hash,
        role=role,
    )
    db.add(user)
    await db.flush()
    return user


async def create_otp(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    code_hash: str,
    channel: str,
    purpose: OtpPurpose,
    expires_at: datetime,
) -> OtpVerification:
    otp = OtpVerification(
        user_id=user_id,
        code_hash=code_hash,
        channel=channel,
        purpose=purpose.value,
        expires_at=expires_at,
    )
    db.add(otp)
    await db.flush()
    return otp


async def count_recent_otps(
    db: AsyncSession, user_id: uuid.UUID, purpose: OtpPurpose, within: timedelta
) -> int:
    """How many codes of one purpose went out to a user in the last ``within`` (a code whose
    email could not be sent does not count)."""
    total = await db.scalar(
        select(func.count())
        .select_from(OtpVerification)
        .where(
            OtpVerification.user_id == user_id,
            OtpVerification.purpose == purpose.value,
            OtpVerification.created_at >= func.now() - within,
            OtpVerification.delivery_failed.is_(False),
        )
    )
    return int(total or 0)


async def end_all_otps(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    """Every code of a user that is still waiting, whatever its purpose, stops working."""
    await db.execute(
        update(OtpVerification)
        .where(OtpVerification.user_id == user_id, OtpVerification.used_at.is_(None))
        .values(used_at=now)
    )


async def clear_password_history(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Forget an account's earlier passwords (a never-confirmed sign-up taken over by a new one)."""
    await db.execute(delete(PasswordHistory).where(PasswordHistory.user_id == user_id))


async def end_active_otps(
    db: AsyncSession, user_id: uuid.UUID, purpose: OtpPurpose, now: datetime
) -> None:
    """A new code ends every older code of the same purpose (one active code at a time)."""
    await db.execute(
        update(OtpVerification)
        .where(
            OtpVerification.user_id == user_id,
            OtpVerification.purpose == purpose.value,
            OtpVerification.used_at.is_(None),
        )
        .values(used_at=now)
    )


async def get_latest_otp(
    db: AsyncSession, user_id: uuid.UUID, purpose: OtpPurpose, *, for_update: bool = False
) -> OtpVerification | None:
    """Most recently issued, still-unused OTP of one purpose for a user.
    ``for_update`` locks the row (SELECT ... FOR UPDATE) until the transaction
    ends, so concurrent checks of one code are counted one after the other."""
    stmt = (
        select(OtpVerification)
        .where(
            OtpVerification.user_id == user_id,
            OtpVerification.purpose == purpose.value,
            OtpVerification.used_at.is_(None),
        )
        .order_by(OtpVerification.expires_at.desc())
        .limit(1)
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_reset_token(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
) -> PasswordResetToken:
    token = PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(token)
    await db.flush()
    return token


async def get_reset_token(db: AsyncSession, token_hash: str) -> PasswordResetToken | None:
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def add_password_history(db: AsyncSession, user_id: uuid.UUID, password_hash: str) -> None:
    db.add(PasswordHistory(user_id=user_id, password_hash=password_hash))
    await db.flush()


async def get_recent_password_hashes(db: AsyncSession, user_id: uuid.UUID, limit: int) -> list[str]:
    result = await db.execute(
        select(PasswordHistory.password_hash)
        .where(PasswordHistory.user_id == user_id)
        .order_by(PasswordHistory.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def delete_expired_otps(db: AsyncSession, now: datetime) -> int:
    ids = await db.scalars(select(OtpVerification.id).where(OtpVerification.expires_at < now))
    id_list = list(ids)
    if id_list:
        await db.execute(delete(OtpVerification).where(OtpVerification.id.in_(id_list)))
    return len(id_list)


async def delete_expired_reset_tokens(db: AsyncSession, now: datetime) -> int:
    ids = await db.scalars(select(PasswordResetToken.id).where(PasswordResetToken.expires_at < now))
    id_list = list(ids)
    if id_list:
        await db.execute(delete(PasswordResetToken).where(PasswordResetToken.id.in_(id_list)))
    return len(id_list)
