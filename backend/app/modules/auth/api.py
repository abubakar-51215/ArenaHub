"""Auth endpoints (doc 10 §1). All responses use the shared envelope."""

from typing import Any

from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.auth import service
from app.modules.auth.schema import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    OtpVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResendOtpRequest,
    ResetPasswordRequest,
)
from app.shared.auth import get_current_user
from app.shared.response import success

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer()


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="Register a new account")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    result = await service.register(db, data)
    return success(data=result, message="Registration successful. Check your email for the OTP.")


@router.post("/verify-otp", summary="Verify registration OTP")
async def verify_otp(data: OtpVerifyRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tokens = await service.verify_otp(db, data)
    return success(data=tokens, message="Account verified.")


@router.post("/resend-otp", summary="Resend the registration OTP")
async def resend_otp(data: ResendOtpRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    # Same message whether or not the account exists/needs verifying, so the
    # endpoint can't be used to enumerate registered emails.
    await service.resend_otp(db, data.email)
    return success(message="If that account needs verification, a new code has been sent.")


@router.post("/login", summary="Login and receive JWT tokens")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tokens = await service.login(db, data)
    return success(data=tokens, message="Login successful.")


@router.post("/refresh", summary="Rotate the access + refresh tokens")
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tokens = await service.refresh(db, data.refresh_token)
    return success(data=tokens, message="Tokens refreshed.")


@router.post("/logout", summary="Invalidate the current session")
async def logout(
    data: LogoutRequest,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    _user: Any = Depends(get_current_user),
) -> dict[str, Any]:
    await service.logout(credentials.credentials, data.refresh_token)
    return success(message="Logged out.")


@router.post("/forgot-password", summary="Request a password-reset token")
async def forgot_password(
    data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    await service.forgot_password(db, data)
    return success(message="If that email is registered, a reset link has been sent.")


@router.post("/reset-password", summary="Reset password using a reset token")
async def reset_password(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    await service.reset_password(db, data)
    return success(message="Password has been reset. Please log in again.")
