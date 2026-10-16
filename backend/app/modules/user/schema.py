"""Pydantic request/response models for the user/profile module."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.user.model import UserRole
from app.shared.request_model import RequestModel, ShortName


class UserPublic(BaseModel):
    """Safe public projection of a user — never exposes the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone: str | None  # empty only for a Google account before "One more step"
    role: UserRole
    is_verified: bool
    is_active: bool
    profile_picture: str | None = None
    bio: str | None = None
    preferred_sports: list = Field(default_factory=list)
    preferred_locations: list = Field(default_factory=list)
    notification_preferences: dict = Field(default_factory=dict)
    created_at: datetime


class UpdateProfileRequest(RequestModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    bio: str | None = Field(default=None, max_length=2000)
    profile_picture: str | None = Field(default=None, max_length=500)
    preferred_sports: list[ShortName] | None = Field(default=None, max_length=30)
    preferred_locations: list[ShortName] | None = Field(default=None, max_length=30)
    notification_preferences: dict[ShortName, dict[ShortName, bool]] | None = Field(
        default=None, max_length=30
    )


class ChangePasswordRequest(RequestModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordVerifyRequest(RequestModel):
    code: str = Field(min_length=6, max_length=6)


class PhoneChangeRequest(RequestModel):
    new_phone: str = Field(min_length=10, max_length=20)


class PhoneChangeVerifyRequest(RequestModel):
    code: str = Field(min_length=6, max_length=6)


class EmailChangeRequest(RequestModel):
    new_email: EmailStr
    # asked again before a code is sent to the new address
    current_password: str = Field(min_length=1, max_length=128)


class EmailChangeVerifyRequest(RequestModel):
    code: str = Field(min_length=6, max_length=6)
