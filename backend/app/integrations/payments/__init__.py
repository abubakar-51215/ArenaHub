"""Payment gateway integrations (docs/PROJECT_GUIDELINES.md deviation #2).

A common ``PaymentProvider`` interface so the card processor (Stripe today,
a local PSP like Safepay/PayFast later) can be swapped without touching the
payment module. ``get_provider`` resolves a payment method to its provider.
"""

from app.integrations.payments.base import (
    InitiateResult,
    PaymentProvider,
    RefundResult,
    WebhookEvent,
)
from app.integrations.payments.easypaisa import EasyPaisaProvider
from app.integrations.payments.jazzcash import JazzCashProvider
from app.integrations.payments.manual import ManualProvider
from app.integrations.payments.stripe_provider import StripeProvider

_PROVIDERS: dict[str, PaymentProvider] = {
    "card": StripeProvider(),
    "jazzcash": JazzCashProvider(),
    "easypaisa": EasyPaisaProvider(),
    "bank_transfer": ManualProvider(),
}


def get_provider(payment_method: str) -> PaymentProvider:
    provider = _PROVIDERS.get(payment_method)
    if provider is None:
        raise ValueError(f"No payment provider registered for '{payment_method}'.")
    return provider


__all__ = [
    "EasyPaisaProvider",
    "InitiateResult",
    "JazzCashProvider",
    "ManualProvider",
    "PaymentProvider",
    "RefundResult",
    "StripeProvider",
    "WebhookEvent",
    "get_provider",
]
