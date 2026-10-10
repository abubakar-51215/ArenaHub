"""The ways a player can pay, and which of them work right now.

Exactly four are ever listed: Card, Bank transfer, JazzCash and EasyPaisa. The
``mock`` provider is a development tool and is never listed. ``key`` is the
provider name; ``method`` is the value to send as ``payment_method`` when
starting a payment.
"""

from app.core.config import PaymentMode, get_settings
from app.core.exceptions import ServiceUnavailableError
from app.modules.payment.model import PaymentMethod

AVAILABLE = "available"
UNAVAILABLE = "unavailable"
COMING_SOON = "coming_soon"

_LABELS: dict[PaymentMethod, str] = {
    PaymentMethod.card: "Card",
    PaymentMethod.bank_transfer: "Bank transfer",
    PaymentMethod.jazzcash: "JazzCash",
    PaymentMethod.easypaisa: "EasyPaisa",
}
_KEYS: dict[PaymentMethod, str] = {
    PaymentMethod.card: "stripe",
    PaymentMethod.bank_transfer: "manual",
    PaymentMethod.jazzcash: "jazzcash",
    PaymentMethod.easypaisa: "easypaisa",
}
_NOT_READY: dict[PaymentMethod, str] = {
    PaymentMethod.card: "Card payments are not available yet.",
    PaymentMethod.jazzcash: "JazzCash is coming soon.",
    PaymentMethod.easypaisa: "EasyPaisa is coming soon.",
}
_ORDER = (
    PaymentMethod.card,
    PaymentMethod.bank_transfer,
    PaymentMethod.jazzcash,
    PaymentMethod.easypaisa,
)


def method_state(method: PaymentMethod) -> str:
    if method == PaymentMethod.bank_transfer:
        return AVAILABLE
    if method == PaymentMethod.card:
        return AVAILABLE if get_settings().stripe_configured else UNAVAILABLE
    # The two wallets have no real gateway yet (real gateway work comes last).
    return COMING_SOON


def list_methods() -> list[dict[str, str | None]]:
    out: list[dict[str, str | None]] = []
    for method in _ORDER:
        state = method_state(method)
        out.append(
            {
                "key": _KEYS[method],
                "method": method.value,
                "label": _LABELS[method],
                "state": state,
                "message": None if state == AVAILABLE else _NOT_READY[method],
            }
        )
    return out


def ensure_usable(method: PaymentMethod) -> None:
    """Refuse a method that is not ready with a clear 503. ``PAYMENT_MODE=mock``
    (development and tests) lets every method through."""
    if get_settings().payment_mode == PaymentMode.mock:
        return
    if method_state(method) != AVAILABLE:
        raise ServiceUnavailableError(_NOT_READY[method])
