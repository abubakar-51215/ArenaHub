"""User/profile endpoints (doc 10 §2 + phone-change per the master plan).

Every route is authenticated via ``get_current_user``; a user can only ever
act on their own record, so there is no id in the path.
"""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceUnavailableError
from app.database.session import get_db
from app.modules.user import service
from app.modules.user.model import User
from app.modules.user.schema import (
    AccountDeletionVerifyRequest,
    ChangePasswordRequest,
    ChangePasswordVerifyRequest,
    EmailChangeRequest,
    EmailChangeVerifyRequest,
    PhoneChangeRequest,
    PhoneChangeVerifyRequest,
    UpdateProfileRequest,
)
from app.shared import codes
from app.shared.auth import get_current_user
from app.shared.response import success

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", summary="Get own profile")
async def get_me(user: User = Depends(get_current_user)) -> dict[str, Any]:
    return success(data=service.get_profile(user), message="OK")


@router.put("/me", summary="Update own profile")
async def update_me(
    data: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.update_profile(db, user, data)
    return success(data=result, message="Profile updated.")


@router.put("/me/password", summary="Request a password change (sends OTP to current email)")
async def request_password_change(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not await service.request_password_change(db, user, data):
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(user.email)}.")


@router.post("/me/password/verify", summary="Confirm a password change")
async def verify_password_change(
    data: ChangePasswordVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.verify_password_change(db, user, data)
    return success(message="Password changed. Please log in again.")


@router.post("/me/delete", summary="Request account deletion (sends OTP to your own email)")
async def request_account_deletion(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not await service.request_account_deletion(db, user):
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(user.email)}.")


@router.post("/me/delete/verify", summary="Confirm account deletion (soft delete)")
async def verify_account_deletion(
    data: AccountDeletionVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.verify_account_deletion(db, user, data)
    return success(message="Account scheduled for deletion.")


@router.post("/me/phone", summary="Request a phone-number change (sends OTP)")
async def request_phone_change(
    data: PhoneChangeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not await service.request_phone_change(db, user, data):
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(data.new_phone)}.")


@router.post("/me/phone/verify", summary="Confirm a phone-number change")
async def verify_phone_change(
    data: PhoneChangeVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.verify_phone_change(db, user, data)
    return success(data=result, message="Phone number updated.")


@router.post("/me/email", summary="Request an email-address change (sends OTP to new address)")
async def request_email_change(
    data: EmailChangeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if not await service.request_email_change(db, user, data):
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(data.new_email)}.")


@router.post("/me/email/verify", summary="Confirm an email-address change")
async def verify_email_change(
    data: EmailChangeVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.verify_email_change(db, user, data)
    return success(data=result, message="Email address updated.")
