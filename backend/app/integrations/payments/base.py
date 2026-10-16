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
    # The card page to open (Stripe's hosted checkout); None for the wallets (the request goes
    # to the player's wallet app) and bank_transfer (no gateway round trip).
    client_secret: str | None = None
    redirect_url: str | None = None


@dataclass
class WebhookEvent:
    gateway_transaction_id: str
    status: str  # "completed" | "failed"
    amount: Decimal
    currency: str


@dataclass
class RefundResult:
    provider_reference: str
    status: str  # "processed" | "pending" | "failed"


def mask_wallet(number: str) -> str:
    """ "0300•••4567": enough for the player to recognise, never the whole number in a log."""
    digits = "".join(c for c in number if c.isdigit())
    if len(digits) < 8:
        return "•••"
    return f"{digits[:4]}•••{digits[-4:]}"


class PaymentProvider(Protocol):
    async def initiate(
        self,
        *,
        amount: Decimal,
        currency: str,
        reference: str,
        wallet_number: str | None = None,
        return_url: str | None = None,
    ) -> InitiateResult:
        """Start a charge. ``wallet_number``: the player's JazzCash/EasyPaisa number, where the
        wallet sends its payment request. ``return_url``: the app address to come back to after
        an outside payment page (card)."""
        ...

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent: ...

    async def refund(
        self, *, gateway_transaction_id: str, amount: Decimal, idempotency_key: str | None = None
    ) -> RefundResult: ...
