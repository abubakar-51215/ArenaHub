"""Pydantic request/response models for the auth module.

Registration is limited to player/owner — admins are provisioned out-of-band,
never self-registered (doc 05 permission matrix).
"""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.modules.user.schema import UserPublic
from app.shared.request_model import RequestModel

RegisterRole = Literal["player", "owner"]


class RegisterRequest(RequestModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    role: RegisterRole = "player"


class OtpVerifyRequest(RequestModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendOtpRequest(RequestModel):
    email: EmailStr


class LoginRequest(RequestModel):
    """Sign in with an email or a phone number in ``identifier``. The older
    ``email`` field still works (the mobile app sends it); ``identifier`` wins
    when both are sent."""

    identifier: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    password: str = Field(max_length=128)

    @model_validator(mode="after")
    def _need_who(self) -> "LoginRequest":
        if not (self.identifier and self.identifier.strip()) and not self.email:
            raise ValueError("Enter your email or phone number.")
        return self

    @property
    def who(self) -> str:
        return (self.identifier or self.email or "").strip()


class RefreshRequest(RequestModel):
    refresh_token: str


class LogoutRequest(RequestModel):
    refresh_token: str


class ForgotPasswordRequest(RequestModel):
    email: EmailStr


class ResetPasswordRequest(RequestModel):
    """Reset with the emailed 6-digit code. (The old emailed-link token was never sent by this
    version and is gone.)"""

    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)


class AdminLoginChallenge(BaseModel):
    """What /auth/login returns to an admin with the right password: no tokens
    yet; a code has been emailed and this value carries them to the next step."""

    mfa_required: bool = True
    challenge_token: str
    expires_in: int
    sent_to: str = ""  # the masked address the code went to ("a***@gmail.com")
    code_sent: bool = True  # False: the email could not be sent; "Send a new code" works at once


class AdminCodeRequest(RequestModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=6)


class AdminResendRequest(RequestModel):
    challenge_token: str


class GoogleSignInRequest(RequestModel):
    # the ID token Google gave the phone; everything else comes from inside it, checked
    id_token: str = Field(min_length=20, max_length=4096)


class GooglePhoneRequest(RequestModel):
    phone: str = Field(min_length=10, max_length=20)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class GoogleSignInResponse(TokenResponse):
    # the account has no phone yet: the phone app asks for it ("One more step") before booking
    phone_needed: bool
    # an unconfirmed sign-up with this email was confirmed by Google and its password wiped
    password_removed: bool = False
    user: UserPublic


class RegisterResponse(BaseModel):
    user: UserPublic
    # OTP delivery channel used, so the client can prompt correctly.
    otp_sent_to: str
    # False when the email could not be sent: the screen then says
    # "We could not send the code. Tap Resend."
    code_sent: bool = True
