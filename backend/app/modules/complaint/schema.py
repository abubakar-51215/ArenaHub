"""Pydantic request/response models for the complaint module."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.complaint.model import ComplaintCategory, ComplaintStatus


class ComplaintCreate(BaseModel):
    category: ComplaintCategory
    description: str = Field(min_length=1, max_length=2000)


class ComplaintRespondRequest(BaseModel):
    admin_response: str = Field(min_length=1, max_length=2000)
    status: ComplaintStatus


class ComplaintResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    player_id: uuid.UUID
    player_name: str
    category: ComplaintCategory
    description: str
    status: ComplaintStatus
    admin_response: str | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    resolved_at: datetime | None
    created_at: datetime
