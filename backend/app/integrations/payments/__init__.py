"""Payment gateway integrations (docs/PROJECT_GUIDELINES.md deviation #2).

A common ``PaymentProvider`` interface so the card processor (Stripe today,
a local PSP like Safepay/PayFast later) can be swapped without touching the
payment module. ``get_provider`` resolves a payment method to its provider.
"""

from app.core.config import PaymentMode, get_settings
from app.integrations.payments.base import (
    InitiateResult,
    PaymentProvider,
    RefundResult,
    WebhookEvent,
)
from app.integrations.payments.easypaisa import EasyPaisaProvider
from app.integrations.payments.jazzcash import JazzCashProvider
from app.integrations.payments.manual import ManualProvider
from app.integrations.payments.mock import MockProvider
from app.integrations.payments.stripe_provider import StripeProvider

# The real gateway providers, keyed by payment method. bank_transfer is
# always manual regardless of PAYMENT_MODE (it has no gateway to mock).
_LIVE_PROVIDERS: dict[str, PaymentProvider] = {
    "card": StripeProvider(),
    "jazzcash": JazzCashProvider(),
    "easypaisa": EasyPaisaProvider(),
    "bank_transfer": ManualProvider(),
}
_MOCK_PROVIDERS: dict[str, PaymentProvider] = {
    "card": MockProvider("card"),
    "jazzcash": MockProvider("jazzcash"),
    "easypaisa": MockProvider("easypaisa"),
    "bank_transfer": ManualProvider(),
}


def get_provider(payment_method: str) -> PaymentProvider:
    """Resolve a payment method to its provider. In ``PAYMENT_MODE=mock`` the
    gateway methods resolve to the deterministic MockProvider; bank_transfer
    is always the manual provider."""
    mock_mode = get_settings().payment_mode == PaymentMode.mock
    table = _MOCK_PROVIDERS if mock_mode else _LIVE_PROVIDERS
    provider = table.get(payment_method)
    if provider is None:
        raise ValueError(f"No payment provider registered for '{payment_method}'.")
    return provider


__all__ = [
    "EasyPaisaProvider",
    "InitiateResult",
    "JazzCashProvider",
    "ManualProvider",
    "MockProvider",
    "PaymentProvider",
    "RefundResult",
    "StripeProvider",
    "WebhookEvent",
    "get_provider",
]
