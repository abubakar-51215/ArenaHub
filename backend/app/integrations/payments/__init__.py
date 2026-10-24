"""Payment gateway integrations (docs/PROJECT_GUIDELINES.md deviation #2).

A common ``PaymentProvider`` interface so the card processor (Stripe today,
a local PSP like Safepay/PayFast later) can be swapped without touching the
payment module. ``get_provider`` resolves a payment method to its provider.
"""

from app.core.config import CardProvider, PaymentMode, get_settings
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
from app.integrations.payments.safepay import SafepayProvider
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


# SafePay is the second card provider. It is not in the tables above: those are keyed by payment
# method and "card" is Stripe's slot. Which of the two takes a NEW card payment is CARD_PROVIDER.
_SAFEPAY = SafepayProvider()

# Provider names as they appear in a webhook address (/webhooks/stripe) and in
# Payment.payment_provider -> the payment method (Stripe's slot is "card").
_ALIASES = {"stripe": "card", "manual": "bank_transfer"}


def get_provider(payment_method: str) -> PaymentProvider:
    """Resolve a payment method, or a provider name, to its provider.

    Two kinds of key arrive here. A payment METHOD ("card", "jazzcash", ...) starts a new payment:
    "card" goes to whichever provider CARD_PROVIDER names. A provider NAME ("stripe", "safepay",
    "manual", ...) comes from the webhook address or from the provider recorded on an existing
    payment (its status check, its refund): it always resolves to exactly that provider,
    whatever CARD_PROVIDER says now, so switching never sends an old Stripe payment to SafePay or
    the reverse. In ``PAYMENT_MODE=mock`` the gateway methods resolve to the deterministic
    MockProvider; bank_transfer is always the manual provider."""
    mock_mode = get_settings().payment_mode == PaymentMode.mock
    table = _MOCK_PROVIDERS if mock_mode else _LIVE_PROVIDERS
    if payment_method == "safepay" or (
        payment_method == "card" and get_settings().card_provider == CardProvider.safepay
    ):
        return table["card"] if mock_mode else _SAFEPAY
    provider = table.get(_ALIASES.get(payment_method, payment_method))
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
    "SafepayProvider",
    "StripeProvider",
    "WebhookEvent",
    "get_provider",
]
