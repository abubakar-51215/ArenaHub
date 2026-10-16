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
from app.modules.payment import methods, service
from app.modules.payment.schema import PaymentInitiateRequest, ReceiptUploadRequest, RejectRequest
from app.modules.user.model import User
from app.shared import abuse, idempotency
from app.shared.auth import get_current_user, require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/payments", tags=["payments"])
owner_router = APIRouter(prefix="/owner/payments", tags=["payments-owner"])
owner_refund_router = APIRouter(prefix="/owner/refunds", tags=["refunds-owner"])
admin_refund_router = APIRouter(prefix="/admin/refunds", tags=["refunds-admin"])
admin_router = APIRouter(prefix="/admin/bookings", tags=["payments-admin"])
webhook_router = APIRouter(prefix="/webhooks", tags=["payments-webhooks"])

_owner = require_role("owner")
_admin = require_role("admin")


@router.get("/methods", summary="The four ways to pay and whether each works yet")
async def list_payment_methods(_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return success(data=methods.list_methods(), message="Payment methods retrieved.")


@router.get("/my", summary="My payment history")
async def list_my_payments(
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_my_payments(db, user, params)
    return success(data=data, message="Payments retrieved.")


@router.get("/by-group/{booking_group_id}", summary="Resolve the payment for a booking group")
async def get_payment_by_group(
    booking_group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payment = await service.get_payment_by_group(db, user, booking_group_id)
    return success(data=payment, message="Payment retrieved.")


@router.post(
    "/initiate",
    summary="Start paying for a booking group",
    dependencies=[Depends(abuse.per_user("payment", 30, 3600))],
)
async def initiate_payment(
    request: Request,
    data: PaymentInitiateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    async def action() -> dict[str, Any]:
        result = await service.initiate_payment(db, user, data)
        return success(data=result, message="Payment initiated.")

    return await idempotency.run_once(request, user.id, "payment", data, action)


@router.post("/initiate-balance", summary="Pay an outstanding balance online")
async def initiate_balance_payment(
    data: PaymentInitiateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.initiate_balance_payment(db, user, data)
    return success(data=result, message="Balance payment initiated.")


@router.post(
    "/{payment_id}/receipt",
    summary="Upload a bank transfer receipt",
    dependencies=[Depends(abuse.per_user("payment", 30, 3600))],
)
async def upload_receipt(
    payment_id: uuid.UUID,
    request: Request,
    data: ReceiptUploadRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    async def action() -> dict[str, Any]:
        payment = await service.upload_receipt(db, user, payment_id, data.receipt_proof_url)
        return success(data=payment, message="Receipt uploaded, awaiting owner approval.")

    return await idempotency.run_once(request, user.id, f"receipt:{payment_id}", data, action)


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


@router.get("/{payment_id}/events", summary="Payment lifecycle audit trail")
async def payment_events(
    payment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    events = await service.list_payment_events(db, user, payment_id)
    return success(data=events, message="Payment events retrieved.")


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


@owner_refund_router.get("", summary="Refunds on my arenas (pending, processed or all)")
async def list_owner_refunds(
    status: str = Query("pending", pattern="^(pending|processed|all)$"),
    arena_id: uuid.UUID | None = None,
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_owner_refunds(db, user, status, params, arena_id)
    return success(data=data, message="Refunds retrieved.")


@owner_refund_router.post("/{refund_id}/mark-paid", summary="Mark a bank-transfer refund as paid")
async def mark_refund_paid(
    refund_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.mark_refund_paid(db, user, refund_id)
    message = "Already marked as paid." if result.already_processed else "Refund marked as paid."
    return success(data=result, message=message)


@admin_refund_router.get("", summary="Refunds across every arena (pending, processed or all)")
async def list_admin_refunds(
    status: str = Query("pending", pattern="^(pending|processed|all)$"),
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_admin_refunds(db, status, params)
    return success(data=data, message="Refunds retrieved.")


@admin_refund_router.post(
    "/{refund_id}/mark-paid", summary="Mark a bank-transfer refund as paid (admin)"
)
async def admin_mark_refund_paid(
    refund_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.admin_mark_refund_paid(db, user, refund_id)
    message = "Already marked as paid." if result.already_processed else "Refund marked as paid."
    return success(data=result, message=message)


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
