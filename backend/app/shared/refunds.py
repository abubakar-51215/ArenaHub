"""Refund-tier resolution (docs/11_BOOKING_ENGINE.md section 7).

Given an arena's configurable refund policy and how many hours remain before
a booking's start time, resolve the refund percentage that applies.
"""

from datetime import datetime, timedelta
from decimal import Decimal

# System default when an arena hasn't configured its own tiers (doc 11:
# "Default: > 6 hours: 100%, < 6 hours: 0%").
DEFAULT_REFUND_POLICY: list[dict] = [{"hours_before": 6, "refund_percentage": 100}]


def resolve_refund_percentage(policy: list[dict], hours_before_start: Decimal) -> int:
    """Return the refund percentage for cancelling ``hours_before_start`` hours
    ahead of the booking. The winning tier is the one with the largest
    ``hours_before`` threshold that ``hours_before_start`` still strictly
    exceeds (doc 11 sec. 7: "> 6 hours: 100%, < 6 hours: 0%" — cancelling at
    exactly the threshold does not qualify); if none is exceeded, the refund
    is 0%.
    """
    tiers = policy or DEFAULT_REFUND_POLICY
    eligible = [t for t in tiers if hours_before_start > Decimal(t["hours_before"])]
    if not eligible:
        return 0
    return max(eligible, key=lambda t: t["hours_before"])["refund_percentage"]


def _when(moment: datetime) -> str:
    hour = moment.hour % 12 or 12
    suffix = "AM" if moment.hour < 12 else "PM"
    return f"{hour}:{moment.minute:02d} {suffix} on {moment.day} {moment.strftime('%b')}"


def describe_refund_policy(policy: list[dict], start: datetime) -> str:
    """The arena's refund rules as one plain sentence group for a booking that
    starts at ``start`` (for example "Free cancellation until 6:00 AM on
    22 May. After that, no refund.")."""
    tiers = sorted(policy or DEFAULT_REFUND_POLICY, key=lambda t: -t["hours_before"])
    parts: list[str] = []
    for i, tier in enumerate(tiers):
        hours, pct = tier["hours_before"], tier["refund_percentage"]
        cutoff = _when(start - timedelta(hours=hours))
        if i == 0 and pct == 100:
            parts.append(f"Free cancellation until {cutoff}.")
        elif i == 0:
            parts.append(f"Cancel before {cutoff} and {pct}% is refunded.")
        else:
            parts.append(f"Before {cutoff}, {pct}% is refunded.")
    parts.append("After that, nothing is refunded.")
    return " ".join(parts)
