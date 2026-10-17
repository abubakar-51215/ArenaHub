"""Auth endpoints (doc 10 §1). All responses use the shared envelope."""

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceUnavailableError
from app.database.session import get_db
from app.modules.auth import google_service, service
from app.modules.auth.schema import (
    AdminCodeRequest,
    AdminLoginChallenge,
    AdminResendRequest,
    ForgotPasswordRequest,
    GooglePhoneRequest,
    GoogleSignInRequest,
    LoginRequest,
    LogoutRequest,
    OtpVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResendOtpRequest,
    ResetPasswordRequest,
)
from app.shared import codes
from app.shared.auth import get_current_user
from app.shared.response import success

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer()


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="Register a new account")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    result = await service.register(db, data)
    message = (
        f"We sent a 6-digit code to {result.otp_sent_to}."
        if result.code_sent
        else codes.NOT_SENT_MESSAGE
    )
    return success(data=result, message=message)


@router.post("/verify-otp", summary="Verify registration OTP")
async def verify_otp(data: OtpVerifyRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tokens = await service.verify_otp(db, data)
    return success(data=tokens, message="Account verified.")


RESEND_MESSAGE = "If that email can receive a code, we sent one."


@router.post("/resend-otp", summary="Resend the registration OTP")
async def resend_otp(data: ResendOtpRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    # one answer for every address, sent or not, so it never tells whether an account exists
    # (a failed send is logged with its reason); "Wait N seconds" is counted per address
    await service.resend_otp(db, data.email)
    return success(message=RESEND_MESSAGE)


@router.post("/login", summary="Login and receive JWT tokens")
async def login(
    data: LoginRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    result = await service.login(db, data, background)
    if isinstance(result, AdminLoginChallenge):
        # admins: no tokens yet, a code was emailed
        return success(data=result, message="Enter the 6-digit code we emailed you.")
    return success(data=result, message="Login successful.")


@router.post("/admin/verify-code", summary="Finish an admin sign-in with the emailed code")
async def verify_admin_code(
    data: AdminCodeRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    tokens = await service.verify_admin_code(db, data)
    return success(data=tokens, message="Login successful.")


@router.post("/admin/resend-code", summary="Email a new admin sign-in code")
async def resend_admin_code(
    data: AdminResendRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    # only someone holding a valid sign-in challenge (the right password) gets here, so the answer
    # says what happened: sent, "Wait N seconds ..." (429) or "Too many codes ..." (429)
    if not await service.resend_admin_code(db, data):
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message="We sent a new code to your email.")


@router.post("/refresh", summary="Rotate the access + refresh tokens")
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    tokens = await service.refresh(db, data.refresh_token)
    return success(data=tokens, message="Tokens refreshed.")


@router.post("/logout", summary="Invalidate the current session")
async def logout(
    data: LogoutRequest,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    _user: Any = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.logout(db, credentials.credentials, data.refresh_token)
    return success(message="Logged out.")


@router.post("/logout-all", summary="Log out everywhere: end every sign-in of this account")
async def logout_all(
    user: Any = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    await service.logout_everywhere(db, user)
    return success(message="Logged out everywhere.")


@router.post("/forgot-password", summary="Request a password-reset token")
async def forgot_password(
    data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    await service.forgot_password(db, data)
    return success(message="If that email has an account, we sent a 6-digit code to it.")


@router.post("/reset-password", summary="Reset password using a reset token")
async def reset_password(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    await service.reset_password(db, data)
    return success(message="Password has been reset. Please log in again.")


@router.post("/google", summary="Continue with Google (players on the phone)")
async def google_sign_in(
    data: GoogleSignInRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    result = await google_service.sign_in(db, data.id_token, background)
    message = "Signed in with Google."
    if result.password_removed:
        message = google_service.PASSWORD_REMOVED
    return success(data=result, message=message)


@router.post("/google/phone", summary="Save the phone of an account made with Google")
async def google_save_phone(
    data: GooglePhoneRequest,
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_user),
) -> dict[str, Any]:
    saved = await google_service.save_phone(db, user, data.phone)
    return success(data=saved, message="Phone number saved.")
