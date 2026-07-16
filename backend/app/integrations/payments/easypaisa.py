"""EasyPaisa mobile wallet (docs/PROJECT_GUIDELINES.md deviation #2).

Same situation as JazzCash — no merchant sandbox available, so this is a
deterministic simulator behind the ``PaymentProvider`` interface (FYP risk
register mitigation). See ``jazzcash.py`` for the identical rationale and the
same HMAC-signed-webhook requirement (``X-Signature`` header, hex-encoded,
keyed by ``EASYPAISA_WEBHOOK_SECRET``, over the raw body).
"""

import hashlib
import hmac
import json
import uuid
from decimal import Decimal

import structlog

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.integrations.payments.base import InitiateResult, RefundResult, WebhookEvent

log = structlog.get_logger()


class EasyPaisaProvider:
    async def initiate(self, *, amount: Decimal, currency: str, reference: str) -> InitiateResult:
        txn_id = f"ep_test_{uuid.uuid4().hex}"
        log.info(
            "easypaisa_simulated_initiate", reference=reference, amount=str(amount), txn=txn_id
        )
        return InitiateResult(
            gateway_transaction_id=txn_id,
            redirect_url=f"https://sandbox.easypaisa.example/pay/{txn_id}",
        )

    def verify_webhook(self, payload: bytes, headers: dict[str, str]) -> WebhookEvent:
        settings = get_settings()
        if not settings.easypaisa_webhook_secret:
            log.warning("easypaisa_webhook_unverified_dev_mode")
            raise ValidationError("EasyPaisa webhook secret not configured.")

        signature = headers.get("x-signature", "")
        expected = hmac.new(
            settings.easypaisa_webhook_secret.encode(), payload, hashlib.sha256
        ).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            raise ValidationError("Invalid EasyPaisa webhook signature.")

        data = json.loads(payload)
        return WebhookEvent(
            gateway_transaction_id=data["gateway_transaction_id"],
            status=data["status"],
            amount=Decimal(str(data["amount"])),
            currency=str(data["currency"]),
        )

    async def refund(self, *, gateway_transaction_id: str, amount: Decimal) -> RefundResult:
        log.info("easypaisa_simulated_refund", gateway_transaction_id=gateway_transaction_id)
        return RefundResult(provider_reference=f"epr_{uuid.uuid4().hex}", status="processed")
