"""Data access for auth flows — users, OTPs, reset tokens, password history.

Repository layer: queries and inserts only, no business rules. Callers own the
transaction (commit in the service). Inserts flush so server defaults / ids are
populated on the returned instance.
"""

import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import OtpVerification, PasswordHistory, PasswordResetToken
from app.modules.user.model import User, UserRole


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_phone(db: AsyncSession, phone: str) -> User | None:
    result = await db.execute(select(User).where(User.phone == phone))
    return result.scalar_one_or_none()


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
    code: str,
    channel: str,
    expires_at: datetime,
) -> OtpVerification:
    otp = OtpVerification(user_id=user_id, code=code, channel=channel, expires_at=expires_at)
    db.add(otp)
    await db.flush()
    return otp


async def get_latest_otp(db: AsyncSession, user_id: uuid.UUID) -> OtpVerification | None:
    """Most recently issued, still-unused OTP for a user."""
    result = await db.execute(
        select(OtpVerification)
        .where(OtpVerification.user_id == user_id, OtpVerification.is_used.is_(False))
        .order_by(OtpVerification.created_at.desc())
        .limit(1)
    )
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
