"""User/profile endpoints (doc 10 §2 + phone-change per the master plan).

Every route is authenticated via ``get_current_user``; a user can only ever
act on their own record, so there is no id in the path.
"""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.user import service
from app.modules.user.model import User
from app.modules.user.schema import (
    ChangePasswordRequest,
    PhoneChangeRequest,
    PhoneChangeVerifyRequest,
    UpdateProfileRequest,
)
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


@router.put("/me/password", summary="Change own password")
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.change_password(db, user, data)
    return success(message="Password changed. Please log in again.")


@router.delete("/me", summary="Delete (soft) own account")
async def delete_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_account(db, user)
    return success(message="Account scheduled for deletion.")


@router.post("/me/phone", summary="Request a phone-number change (sends OTP)")
async def request_phone_change(
    data: PhoneChangeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.request_phone_change(db, user, data)
    return success(message="OTP sent to the new number.")


@router.post("/me/phone/verify", summary="Confirm a phone-number change")
async def verify_phone_change(
    data: PhoneChangeVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.verify_phone_change(db, user, data)
    return success(data=result, message="Phone number updated.")
