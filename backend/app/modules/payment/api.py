"""Payment endpoints.

* ``router`` (``/payments``) — player-facing: initiate, upload a
  bank_transfer receipt, dev-only simulate-confirm, receipt PDF.
* ``owner_router`` (``/owner/payments``) — bank_transfer approve/reject.
* ``admin_router`` (``/admin/bookings``) — force-refund.
* ``webhook_router`` (``/webhooks``) — unauthenticated gateway callbacks.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.payment import service
from app.modules.payment.schema import PaymentInitiateRequest, ReceiptUploadRequest, RejectRequest
from app.modules.user.model import User
from app.shared.auth import get_current_user, require_role
from app.shared.response import success

router = APIRouter(prefix="/payments", tags=["payments"])
owner_router = APIRouter(prefix="/owner/payments", tags=["payments-owner"])
admin_router = APIRouter(prefix="/admin/bookings", tags=["payments-admin"])
webhook_router = APIRouter(prefix="/webhooks", tags=["payments-webhooks"])

_owner = require_role("owner")
_admin = require_role("admin")


@router.post("/initiate", summary="Start paying for a booking group")
async def initiate_payment(
    data: PaymentInitiateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.initiate_payment(db, user, data)
    return success(data=result, message="Payment initiated.")


@router.post("/{payment_id}/receipt", summary="Upload a bank transfer receipt")
async def upload_receipt(
    payment_id: uuid.UUID,
    data: ReceiptUploadRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payment = await service.upload_receipt(db, user, payment_id, data.receipt_proof_url)
    return success(data=payment, message="Receipt uploaded, awaiting owner approval.")


@router.post(
    "/{payment_id}/simulate-confirm",
    summary="Dev-only: simulate a gateway webhook without a real round trip",
)
async def simulate_confirm(
    payment_id: uuid.UUID,
    success_flag: bool = Query(True, alias="success"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payment = await service.dev_simulate_confirm(db, user, payment_id, success_flag)
    return success(data=payment, message="Payment simulated.")


@router.get("/{payment_id}/receipt.pdf", summary="Download the payment receipt as a PDF")
async def receipt_pdf(
    payment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    pdf_bytes = await service.get_receipt_pdf(db, user, payment_id)
    return Response(content=pdf_bytes, media_type="application/pdf")


@owner_router.post("/{payment_id}/approve", summary="Approve a bank transfer receipt")
async def approve_bank_transfer(
    payment_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payment = await service.approve_bank_transfer(db, user, payment_id)
    return success(data=payment, message="Payment approved, booking confirmed.")


@owner_router.post("/{payment_id}/reject", summary="Reject a bank transfer receipt")
async def reject_bank_transfer(
    payment_id: uuid.UUID,
    data: RejectRequest,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payment = await service.reject_bank_transfer(db, user, payment_id, data.reason)
    return success(data=payment, message="Payment rejected.")


@admin_router.post("/{booking_id}/force-refund", summary="Force a 100% refund (force majeure)")
async def force_refund(
    booking_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    refund = await service.force_refund(db, user, booking_id)
    return success(data=refund, message="Refund forced.")


@webhook_router.post("/{payment_method}", summary="Gateway webhook (card/jazzcash/easypaisa)")
async def webhook(
    payment_method: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payload = await request.body()
    await service.handle_webhook(db, payment_method, payload, dict(request.headers))
    return success(message="Webhook processed.")
