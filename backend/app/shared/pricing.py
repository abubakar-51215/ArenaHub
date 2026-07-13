"""Slot price resolution (docs/PROJECT_GUIDELINES.md deviation #12: base ->
peak -> discount -> +equipment). This module resolves base -> peak only, at
slot-generation time; the booking module applies discount codes on top when
a booking is created.
"""

from datetime import time
from decimal import Decimal

from app.modules.court.model import CourtPricingRule


def resolve_peak_price(
    base_price: Decimal, pricing_rules: list[CourtPricingRule], weekday: int, start_time: time
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
