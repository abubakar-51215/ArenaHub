"""Pydantic request/response models for the payment module."""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.booking.model import PaymentPlan, PaymentStatus
from app.modules.payment.model import (
    PaymentLifecycleStatus,
    PaymentMethod,
    PaymentPurpose,
    RefundStatus,
)
from app.shared.receipt_links import ReceiptLink
from app.shared.request_model import RequestModel


class PaymentInitiateRequest(RequestModel):
    booking_group_id: uuid.UUID
    payment_method: PaymentMethod
    # JazzCash / EasyPaisa: the player's wallet number, where the payment request is sent
    wallet_number: str | None = Field(default=None, max_length=20)
    # card: the app address to come back to after Stripe's card page
    return_url: str | None = Field(default=None, max_length=500)


class ReceiptUploadRequest(RequestModel):
    receipt_proof_url: str = Field(min_length=1, max_length=500)


class RejectRequest(RequestModel):
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
    lifecycle_status: PaymentLifecycleStatus
    payment_type: PaymentPlan
    purpose: PaymentPurpose
    receipt_proof_url: ReceiptLink = None
    created_at: datetime


class PaymentRefundItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: Decimal
    status: RefundStatus
    reason: str
    created_at: datetime
    processed_at: datetime | None = None


class PaymentHistoryItem(PaymentResponse):
    """A payment plus display context for the player's history list."""

    arena_name: str | None = None
    booking_date: date | None = None
    booking_code: str | None = None
    # refunds taken from this payment (a cancelled booking, a cheaper reschedule), oldest first
    refunds: list["PaymentRefundItem"] = []


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


class PaymentEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_status: PaymentLifecycleStatus | None = None
    to_status: PaymentLifecycleStatus
    note: str | None = None
    created_at: datetime


class OwnerRefundItem(BaseModel):
    """One refund on the arena owner's own arenas (the owner Refunds list)."""

    id: uuid.UUID
    status: RefundStatus
    amount: Decimal
    reason: str
    payment_method: PaymentMethod
    player_name: str
    booking_code: str
    arena_name: str
    court_name: str
    booking_date: date
    start_time: time
    end_time: time
    created_at: datetime
    processed_at: datetime | None = None
    # true only for a pending bank-transfer refund: the owner sends the money and marks it paid
    can_mark_paid: bool


class OwnerRefundMarkPaidResponse(BaseModel):
    refund: OwnerRefundItem
    already_processed: bool
