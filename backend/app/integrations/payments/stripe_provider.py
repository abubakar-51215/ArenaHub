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

import stripe
import structlog

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent

log = structlog.get_logger()


class StripeProvider:
    async def initiate(self, *, amount: Decimal, currency: str, reference: str) -> InitiateResult:
        settings = get_settings()
        if not settings.stripe_secret_key:
            log.info("stripe_dev_simulated_initiate", reference=reference, amount=str(amount))
            return InitiateResult(
                gateway_transaction_id=f"pi_test_{uuid.uuid4().hex}",
                client_secret=f"pi_test_{uuid.uuid4().hex}_secret_dev",
            )

        stripe.api_key = settings.stripe_secret_key
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=int((amount * 100).to_integral_value()),
            currency=currency.lower(),
            metadata={"reference": reference},
        )
        return InitiateResult(gateway_transaction_id=intent.id, client_secret=intent.client_secret)

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

        intent = event["data"]["object"]
        status = "completed" if event["type"] == "payment_intent.succeeded" else "failed"
        return WebhookEvent(
            gateway_transaction_id=intent["id"],
            status=status,
            amount=Decimal(str(intent.get("amount_received", intent["amount"]))) / Decimal(100),
            currency=str(intent["currency"]).upper(),
        )

    async def refund(self, *, gateway_transaction_id: str, amount: Decimal) -> RefundResult:
        settings = get_settings()
        if not settings.stripe_secret_key:
            log.info("stripe_dev_simulated_refund", gateway_transaction_id=gateway_transaction_id)
            return RefundResult(
                provider_reference=f"re_test_{uuid.uuid4().hex}", status="processed"
            )

        stripe.api_key = settings.stripe_secret_key
        refund = await asyncio.to_thread(
            stripe.Refund.create,
            payment_intent=gateway_transaction_id,
            amount=int((amount * 100).to_integral_value()),
        )
        status = "processed" if refund.status == "succeeded" else "pending"
        return RefundResult(provider_reference=refund.id, status=status)
