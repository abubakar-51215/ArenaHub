"""Pydantic request/response models for the user/profile module."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.user.model import UserRole


class UserPublic(BaseModel):
    """Safe public projection of a user — never exposes the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: EmailStr
    phone: str
    role: UserRole
    is_verified: bool
    is_active: bool
    profile_picture: str | None = None
    bio: str | None = None
    preferred_sports: list = Field(default_factory=list)
    preferred_locations: list = Field(default_factory=list)
    notification_preferences: dict = Field(default_factory=dict)
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    bio: str | None = Field(default=None, max_length=2000)
    profile_picture: str | None = Field(default=None, max_length=500)
    preferred_sports: list[str] | None = None
    preferred_locations: list[str] | None = None
    notification_preferences: dict | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


class ChangePasswordVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class PhoneChangeRequest(BaseModel):
    new_phone: str = Field(min_length=10, max_length=20)


class PhoneChangeVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class EmailChangeRequest(BaseModel):
    new_email: EmailStr


class EmailChangeVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
