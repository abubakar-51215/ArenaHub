"""Pydantic request/response models for the auth module.

Registration is limited to player/owner — admins are provisioned out-of-band,
never self-registered (doc 05 permission matrix).
"""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.modules.user.schema import UserPublic

RegisterRole = Literal["player", "owner"]


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=8, max_length=72)
    role: RegisterRole = "player"


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset with the emailed one-time code (``email`` + ``otp``), or with the
    older reset ``token``. The token path stays for links already sent and is
    due for removal."""

    email: EmailStr | None = None
    otp: str | None = Field(default=None, min_length=6, max_length=6)
    token: str | None = None
    new_password: str = Field(min_length=8, max_length=72)

    @model_validator(mode="after")
    def _needs_otp_or_token(self) -> "ResetPasswordRequest":
        if not self.token and not (self.email and self.otp):
            raise ValueError("Provide email and otp, or a reset token.")
        return self


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    user: UserPublic
    # OTP delivery channel used, so the client can prompt correctly.
    otp_sent_to: str
