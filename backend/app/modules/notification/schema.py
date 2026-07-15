"""Pydantic request/response models for the notification module."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeviceTokenRegister(BaseModel):
    token: str = Field(min_length=1, max_length=255)
    platform: str = Field(pattern="^(android|ios)$")


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event: str
    title: str
    body: str
    data: dict
    read_at: datetime | None = None
    created_at: datetime
