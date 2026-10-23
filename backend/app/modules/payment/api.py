"""Payment endpoints.

* ``router`` (``/payments``) — player-facing: initiate, upload a
  bank_transfer receipt, dev-only simulate-confirm, receipt PDF.
* ``owner_router`` (``/owner/payments``) — bank_transfer approve/reject.
* ``admin_router`` (``/admin/bookings``) — force-refund.
* ``webhook_router`` (``/webhooks``) — unauthenticated gateway callbacks.
"""

import html
import uuid
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.database.session import get_db
from app.modules.payment import methods, service
from app.modules.payment.schema import PaymentInitiateRequest, ReceiptUploadRequest, RejectRequest
from app.modules.user.model import User
from app.shared import abuse, idempotency, payment_return
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


@router.post(
    "/initiate-balance",
    summary="Pay an outstanding balance online",
    dependencies=[Depends(abuse.per_user("payment", 30, 3600))],
)
async def initiate_balance_payment(
    request: Request,
    data: PaymentInitiateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    async def action() -> dict[str, Any]:
        result = await service.initiate_balance_payment(db, user, data)
        return success(data=result, message="Balance payment initiated.")

    return await idempotency.run_once(request, user.id, "payment-balance", data, action)


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


@router.get("/return", summary="After the card page: back to the app", include_in_schema=False)
async def back_to_app(to: str = Query(..., max_length=500)) -> Response:
    # only app addresses are forwarded (app/shared/payment_return.py), so this never sends
    # anyone to another site
    if not payment_return.is_allowed(to):
        raise ValidationError(messages.RETURN_ADDRESS_REFUSED)
    return RedirectResponse(to, status_code=302)


@router.get("/dev-checkout/{txn}", include_in_schema=False)
async def dev_checkout_page(
    txn: str, to: str = Query(..., max_length=800), db: AsyncSession = Depends(get_db)
) -> HTMLResponse:
    """Development only: stands in for Stripe's card page while there is no Stripe key."""
    payment = await service.dev_checkout_payment(db, txn)
    amount = html.escape(f"Rs {payment.amount:,.0f}")
    await db.rollback()
    action = html.escape(f"/api/v1/payments/dev-checkout/{txn}?to={quote(to, safe='')}")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test card page</title></head>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<p style="color:#a33"><b>Development only.</b> This page stands in for Stripe's card page.</p>
<h1 style="font-size:22px">Pay {amount} by card</h1>
<form method="post" action="{action}&result=paid"><button style="width:100%;padding:14px;
font-size:16px">Pay {amount}</button></form>
<form method="post" action="{action}&result=cancel" style="margin-top:12px"><button
style="width:100%;padding:14px;font-size:16px">Cancel</button></form></body></html>"""
    return HTMLResponse(page, headers={"Cache-Control": "no-store"})


@router.post("/dev-checkout/{txn}", include_in_schema=False)
async def dev_checkout_finish(
    txn: str,
    to: str = Query(..., max_length=800),
    result: str = Query(..., pattern="^(paid|cancel)$"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.dev_finish_checkout(db, txn, paid=result == "paid")
    back = f"{get_settings().api_public_url.rstrip('/')}/api/v1/payments/return?to="
    if not to.startswith(back):
        raise ValidationError(messages.RETURN_ADDRESS_REFUSED)
    return RedirectResponse(to, status_code=303)


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
    data: RejectRequest,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    refund = await service.force_refund(db, user, booking_id, data.reason)
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
