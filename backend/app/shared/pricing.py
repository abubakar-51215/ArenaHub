"""Slot price resolution (docs/PROJECT_GUIDELINES.md deviation #12: base ->
peak -> discount -> +equipment). ``resolve_peak_price`` resolves base -> peak
at slot-generation time; ``apply_discount`` applies a discount code on top,
at booking-creation time. Equipment addons are added after discount by the
booking module once modules/equipment exists (deviation #12).
"""

from collections.abc import Sequence
from datetime import time
from decimal import Decimal

from app.modules.arena.model import DiscountCode, DiscountType
from app.modules.court.model import CourtPricingRule


def resolve_peak_price(
    base_price: Decimal, pricing_rules: Sequence[CourtPricingRule], weekday: int, start_time: time
) -> Decimal:
    """Return ``base_price`` with the best-matching active peak rule applied.

    A rule matches if it's active, its window covers ``start_time``, and its
    weekday is either ``None`` (every day) or equal to ``weekday`` (ISO 1-7).
    A weekday-specific match is preferred over an every-day match; if several
    rules tie at the same specificity, the highest multiplier wins.
    """
    matches = [
        rule
        for rule in pricing_rules
        if rule.is_active
        and (rule.weekday is None or rule.weekday == weekday)
        and rule.start_time <= start_time < rule.end_time
    ]
    if not matches:
        return base_price

    specific = [rule for rule in matches if rule.weekday is not None]
    candidates = specific or matches
    best = max(candidates, key=lambda rule: rule.price_multiplier)
    return (base_price * best.price_multiplier).quantize(Decimal("0.01"))


def apply_discount(subtotal: Decimal, discount: DiscountCode) -> Decimal:
    """Apply a validated, in-effect discount code to a booking subtotal.

    Caller is responsible for checking the code is active, within its
    validity window, under its usage cap, and that ``subtotal`` meets
    ``min_booking_amount`` — this function only does the arithmetic.
    """
    if discount.discount_type == DiscountType.percentage:
        reduced = subtotal * (Decimal("100") - discount.discount_value) / Decimal("100")
    else:
        reduced = subtotal - discount.discount_value
    return max(reduced, Decimal("0")).quantize(Decimal("0.01"))
