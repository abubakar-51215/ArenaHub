"""Common payment gateway interface (docs/PROJECT_GUIDELINES.md deviation #2).

Every provider — Stripe (card), JazzCash, EasyPaisa, or the manual
bank-transfer "provider" — implements this so the payment module never
branches on which gateway it's talking to.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


@dataclass
class InitiateResult:
    """What a provider hands back after starting a charge."""

    gateway_transaction_id: str
    # A client secret (Stripe) or redirect URL (JazzCash/EasyPaisa); None for
    # bank_transfer, which has no gateway round trip.
    client_secret: str | None = None
    redirect_url: str | None = None


@dataclass
class WebhookEvent:
    gateway_transaction_id: str
    status: str  # "completed" | "failed"


@dataclass
class RefundResult:
    provider_reference: str
    status: str  # "processed" | "pending" | "failed"


class PaymentProvider(Protocol):
    async def initiate(
        self, *, amount: Decimal, currency: str, reference: str
    ) -> InitiateResult: ...

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent: ...

    async def refund(self, *, gateway_transaction_id: str, amount: Decimal) -> RefundResult: ...
