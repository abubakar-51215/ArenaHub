"""Deterministic in-memory payment provider for local dev and tests.

Selected for the gateway methods (card/JazzCash/EasyPaisa) when
``PAYMENT_MODE=mock`` (see ``app/core/config.py``). Every call succeeds
synthetically — no network, no credentials, no real charge — so a developer
can exercise the full pay -> confirm flow offline and deterministically.

This is separate from each real provider's own "no credentials -> simulate"
fallback: MockProvider is an explicit, always-on simulation that doesn't
depend on whether a given gateway's keys happen to be set.
"""

import uuid
from decimal import Decimal

from app.core.exceptions import ValidationError
from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent


class MockProvider:
    def __init__(self, name: str = "mock") -> None:
        self._name = name

    async def initiate(self, *, amount: Decimal, currency: str, reference: str) -> InitiateResult:
        txn = f"{self._name}_test_{uuid.uuid4().hex}"
        return InitiateResult(
            gateway_transaction_id=txn,
            client_secret=f"{txn}_secret",
        )

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        # The mock has no signature to verify — real webhook testing uses the
        # dev simulate-confirm endpoint, which drives the same code path.
        raise ValidationError("MockProvider has no webhook; use the dev simulate-confirm endpoint.")

    async def refund(self, *, gateway_transaction_id: str, amount: Decimal) -> RefundResult:
        return RefundResult(provider_reference=f"mock_re_{uuid.uuid4().hex}", status="processed")
