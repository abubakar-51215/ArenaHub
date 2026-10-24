"""SafePay card payments on SafePay's own hosted checkout (the card page is SafePay's; no card
number ever reaches ArenaHub).

STAGE A (this file today): the provider exists, is registered, and is configured, but it **does
nothing yet**. Every method refuses safely (a payment cannot be started, a webhook confirms
nothing, a refund is not sent) until the SafePay contract items below are confirmed in the
SafePay sandbox. Nothing here may guess them. The list, and the evidence that closes each item,
is in docs/SAFEPAY_INTEGRATION.md.

Contract items that block each stage (all UNVERIFIED on 24 Oct 2026):

* Stage B, starting a payment: the checkout address layout, how ``redirect_url`` / ``cancel_url``
  are encoded and whether SafePay appends ``tracker`` to a return address that already has a
  query, the unit of ``amount`` when creating a tracker, the ``intent`` and ``mode`` for a
  one-time PKR card payment, which sign-in (merchant-secret header or JWT) each call needs, and
  the lifetime of the checkout (``tbt``) token.
* Stage C, webhooks: whether the signature (``X-SFPY-SIGNATURE``, HMAC-SHA512, hex) is computed
  over the raw bytes received or over a re-serialised copy, and the unit of ``amount`` in the
  event; the authoritative status call (amount and currency fields).
* Stage D, refunds: the REST path, sign-in and amount unit of refund / reversal / void, and which
  one applies to a payment younger than 24 hours.
"""

from decimal import Decimal

import structlog

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError, ValidationError
from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent

log = structlog.get_logger()

NOT_AVAILABLE = "Card payments are not available yet."


class SafepayProvider:
    """The ``safepay`` provider behind the ``card`` payment method (``CARD_PROVIDER=safepay``)."""

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
        # Stage B is not built: never start a payment, whatever the flags say.
        log.warning(
            "safepay_checkout_not_built",
            configured=settings.safepay_configured,
            enabled=settings.safepay_checkout_enabled,
        )
        raise ServiceUnavailableError(NOT_AVAILABLE)

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        # Stage C is not built: a callback is refused, so it can never confirm a booking.
        log.warning("safepay_webhook_not_built")
        raise ValidationError("SafePay webhooks are not enabled yet.")

    async def refund(
        self, *, gateway_transaction_id: str, amount: Decimal, idempotency_key: str | None = None
    ) -> RefundResult:
        # Stage D is not built: raising makes the refund stay pending and retry (with the
        # existing manual-review safeguard), and nothing is sent to SafePay.
        log.warning("safepay_refund_not_built")
        raise ServiceUnavailableError(NOT_AVAILABLE)
