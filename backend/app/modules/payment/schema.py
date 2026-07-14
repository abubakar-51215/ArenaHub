"""Pydantic request/response models for the payment module."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.booking.model import PaymentPlan, PaymentStatus
from app.modules.payment.model import PaymentMethod, RefundStatus


class PaymentInitiateRequest(BaseModel):
    booking_group_id: uuid.UUID
    payment_method: PaymentMethod


class ReceiptUploadRequest(BaseModel):
    receipt_proof_url: str = Field(min_length=1, max_length=500)


class RejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_group_id: uuid.UUID
    player_id: uuid.UUID
    amount: Decimal
    currency: str
    payment_method: PaymentMethod
    payment_provider: str
    gateway_transaction_id: str | None = None
    status: PaymentStatus
    payment_type: PaymentPlan
    receipt_proof_url: str | None = None


class PaymentInitiateResponse(BaseModel):
    payment: PaymentResponse
    client_secret: str | None = None
    redirect_url: str | None = None


class RefundResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    payment_id: uuid.UUID
    amount: Decimal
    reason: str
    status: RefundStatus
    processed_at: datetime | None = None
