"""Bank transfer has no gateway (docs/PROJECT_GUIDELINES.md deviation #2):
the player transfers via their own banking app and uploads a receipt; the
arena owner verifies it manually. This "provider" exists only so
bank_transfer fits the same ``PaymentProvider`` interface as the real
gateways — none of its methods talk to a network.
"""

import uuid
from decimal import Decimal

from app.core.exceptions import ValidationError
from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent


class ManualProvider:
    async def initiate(self, *, amount: Decimal, currency: str, reference: str) -> InitiateResult:
        return InitiateResult(gateway_transaction_id=f"manual_{uuid.uuid4().hex}")

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        raise ValidationError("bank_transfer has no webhook; approval is manual.")

    async def refund(self, *, gateway_transaction_id: str, amount: Decimal) -> RefundResult:
        # No gateway to call back — the owner/admin transfers the refund
        # themselves and marks it processed via the refund-approval endpoint.
        return RefundResult(provider_reference=gateway_transaction_id, status="pending")
