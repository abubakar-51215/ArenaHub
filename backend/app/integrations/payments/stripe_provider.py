"""Stripe TEST MODE card processing (docs/PROJECT_GUIDELINES.md deviation #2:
"Stripe has no live Pakistani merchant support"; this is for the FYP demo
only — a production build swaps this for a local PSP behind the same
``PaymentProvider`` interface).

Falls back to a deterministic simulation when ``STRIPE_SECRET_KEY`` isn't
configured, mirroring the OTP-console-delivery pattern already used
elsewhere in dev (``shared/otp.py``): the seam is real, only the backing
call changes by environment. Sync Stripe SDK calls run in a thread so they
never block the event loop.
"""

import asyncio
import uuid
from decimal import Decimal
from typing import Any
from urllib.parse import quote

import stripe
import structlog

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError, ValidationError
from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent
from app.shared import payment_return

log = structlog.get_logger()


class StripeProvider:
    """Card payments on Stripe's own hosted page (Stripe Checkout): the app opens the page, the
    player pays there (no card number ever reaches ArenaHub), Stripe sends them back to the app
    through ``/api/v1/payments/return`` and confirms the payment with a signed webhook, which
    confirms the booking at once.

    Without a Stripe key, development uses a built-in test page instead
    (``/api/v1/payments/dev-checkout/...``); outside development card payments are then refused.
    """

    async def initiate(
        self,
        *,
        amount: Decimal,
        currency: str,
        reference: str,
        wallet_number: str | None = None,
        return_url: str | None = None,
    ) -> InitiateResult:
        settings = get_settings()
        back = payment_return.bounce(return_url)
        if not settings.stripe_configured:
            if settings.is_dev:
                txn = f"cs_sim_{uuid.uuid4().hex}"
                page = (
                    f"{settings.api_public_url.rstrip('/')}/api/v1/payments/dev-checkout/{txn}"
                    f"?to={quote(back, safe='')}"
                )
                log.info("stripe_simulated_checkout", reference=reference, txn=txn)
                return InitiateResult(gateway_transaction_id=txn, redirect_url=page)
            # No real key (empty or a placeholder): say so plainly instead of
            # calling Stripe and letting its rejection become a 500.
            log.warning("stripe_not_configured", reference=reference)
            raise ServiceUnavailableError("Card payments are not available yet.")

        stripe.api_key = settings.stripe_secret_key
        try:
            session = await asyncio.to_thread(
                stripe.checkout.Session.create,
                mode="payment",
                line_items=[
                    {
                        "quantity": 1,
                        "price_data": {
                            "currency": currency.lower(),
                            "unit_amount": int((amount * 100).to_integral_value()),
                            "product_data": {"name": "ArenaHub booking"},
                        },
                    }
                ],
                success_url=back,
                cancel_url=back,
                client_reference_id=reference,
                metadata={"reference": reference},
                payment_intent_data={"metadata": {"reference": reference}},
            )
        except stripe.error.StripeError as exc:
            log.error("stripe_initiate_failed", reference=reference, error=type(exc).__name__)
            raise ServiceUnavailableError(
                "Card payments are not available right now. Please try again later."
            ) from exc
        return InitiateResult(gateway_transaction_id=session.id, redirect_url=session.url)

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        settings = get_settings()
        if not settings.stripe_webhook_secret:
            log.warning("stripe_webhook_unverified_dev_mode")
            raise ValidationError(
                "Stripe webhook secret not configured; use the dev simulate-confirm endpoint."
            )
        try:
            event = stripe.Webhook.construct_event(
                payload, headers.get("stripe-signature", ""), settings.stripe_webhook_secret
            )
        except (stripe.error.SignatureVerificationError, ValueError) as exc:
            raise ValidationError("Invalid Stripe webhook signature.") from exc

        session = event["data"]["object"]
        kind = event["type"]
        paid_now = kind == "checkout.session.completed" and session.get("payment_status") == "paid"
        if paid_now or kind == "checkout.session.async_payment_succeeded":
            status = "completed"
        elif kind in ("checkout.session.expired", "checkout.session.async_payment_failed"):
            status = "failed"
        else:
            status = "ignored"  # any other Stripe event: acknowledged, nothing to do
        return WebhookEvent(
            gateway_transaction_id=str(session.get("id", "")),
            status=status,
            amount=Decimal(str(session.get("amount_total") or 0)) / Decimal(100),
            currency=str(session.get("currency") or "").upper(),
        )

    async def refund(
        self, *, gateway_transaction_id: str, amount: Decimal, idempotency_key: str | None = None
    ) -> RefundResult:
        settings = get_settings()
        if not settings.stripe_secret_key:
            log.info("stripe_dev_simulated_refund", gateway_transaction_id=gateway_transaction_id)
            return RefundResult(
                provider_reference=f"re_test_{uuid.uuid4().hex}", status="processed"
            )

        stripe.api_key = settings.stripe_secret_key
        # the same key on a retry makes Stripe return the first refund instead
        # of creating a second one
        extra: dict[str, Any] = {"idempotency_key": idempotency_key} if idempotency_key else {}
        intent = gateway_transaction_id
        if intent.startswith("cs_"):
            session = await asyncio.to_thread(stripe.checkout.Session.retrieve, intent)
            intent = str(session.payment_intent)
        refund = await asyncio.to_thread(
            stripe.Refund.create,
            payment_intent=intent,
            amount=int((amount * 100).to_integral_value()),
            **extra,
        )
        status = "processed" if refund.status == "succeeded" else "pending"
        return RefundResult(provider_reference=refund.id, status=status)
