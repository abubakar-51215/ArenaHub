"""JazzCash mobile wallet (docs/PROJECT_GUIDELINES.md deviation #2).

No JazzCash merchant sandbox is available in this environment (FYP risk
register: "Payment gateway sandbox unavailable ... mock gateway/webhook
responses behind the PaymentProvider interface so flows still demo"), so
this is a deterministic simulator behind the same interface real JazzCash
API calls would use. Swapping in the real hash-signed checkout API later is
a same-file change — nothing outside ``integrations/payments/`` depends on
this being simulated.
"""

import uuid
from decimal import Decimal

import structlog

from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent

log = structlog.get_logger()


class JazzCashProvider:
    async def initiate(self, *, amount: Decimal, currency: str, reference: str) -> InitiateResult:
        txn_id = f"jc_test_{uuid.uuid4().hex}"
        log.info("jazzcash_simulated_initiate", reference=reference, amount=str(amount), txn=txn_id)
        return InitiateResult(
            gateway_transaction_id=txn_id,
            redirect_url=f"https://sandbox.jazzcash.example/pay/{txn_id}",
        )

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        # A real integration would verify JazzCash's secure hash here.
        import json

        data = json.loads(payload)
        return WebhookEvent(
            gateway_transaction_id=data["gateway_transaction_id"], status=data["status"]
        )

    async def refund(self, *, gateway_transaction_id: str, amount: Decimal) -> RefundResult:
        log.info("jazzcash_simulated_refund", gateway_transaction_id=gateway_transaction_id)
        return RefundResult(provider_reference=f"jcr_{uuid.uuid4().hex}", status="processed")
