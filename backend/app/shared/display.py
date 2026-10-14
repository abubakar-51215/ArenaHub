"""How values are written for people in notice text (the same words and shapes the app shows).

One place for money, dates, times and sport names, so every notice (booking, refund, payment, match,
review, complaint) reads like the app: "₨ 2,000", "Tue 13 Oct", "7:00 PM", "Futsal".

Dates and times of bookings and matches are already Karachi wall-clock values in the database
(naive, Asia/Karachi), so they are only written out here. ``karachi_datetime`` is for a moment
that is stored in UTC.
"""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

KARACHI = timedelta(hours=5)  # Asia/Karachi is UTC+5 all year (no daylight saving)

_SPORT_LABELS = {
    "futsal": "Futsal",
    "cricket": "Cricket",
    "padel": "Padel",
    "badminton": "Badminton",
    "table_tennis": "Table tennis",
    "squash": "Squash",
    "basketball": "Basketball",
    "volleyball": "Volleyball",
    "snooker": "Snooker",
    "tennis": "Tennis",
}


def rupees(amount: object) -> str:
    """₨ 2,000 for whole rupees, ₨ 2,500.50 with paisa. Thousands separators, a space after ₨."""
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return str(amount)
    if value == value.to_integral_value():
        return f"₨ {int(value):,}"
    return f"₨ {value.quantize(Decimal('0.01')):,}"


def karachi_date(value: date | datetime | str) -> str:
    """Tue 13 Oct (no leading zero on the day). A datetime is taken as already in Karachi time."""
    if isinstance(value, str):
        value = date.fromisoformat(value[:10])
    if isinstance(value, datetime):
        value = value.date()
    return f"{value.strftime('%a')} {value.day} {value.strftime('%b')}"


def time_12h(value: time | str) -> str:
    """7:00 PM (no leading zero). 23:59 or later (the end of the last hour of the day) and
    "24:00" are midnight: 12:00 AM."""
    if isinstance(value, str):
        if value[:5] >= "23:59":
            return "12:00 AM"
        value = time.fromisoformat(value)
    if value >= time(23, 59):
        return "12:00 AM"
    return value.strftime("%I:%M %p").lstrip("0")


def karachi_datetime(moment: datetime) -> datetime:
    """A moment stored in UTC (aware, or naive meaning UTC) as Karachi wall-clock time."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    return moment + KARACHI


def sport_name(key: str) -> str:
    """The word the app shows for a sport key: futsal and an old "football" are Futsal."""
    k = key.strip().lower().replace(" ", "_").replace("-", "_")
    if k == "football":
        k = "futsal"
    known = _SPORT_LABELS.get(k)
    if known:
        return known
    words = k.replace("_", " ")
    return words[:1].upper() + words[1:]


def plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


# ---- exports: the words of the owner and admin web (lib/format.ts, components/admin/ui.tsx) ----

# statusLabel() of the web: these words, else the key with a capital and spaces
_WEB_STATUS = {
    "pending_payment": "Awaiting payment",
    "pending_approval": "Pending approval",
    "under_review": "Under review",
    "in_progress": "In progress",
    "partially_refunded": "Part refunded",
    "no_show": "No-show",
}
PAYMENT_METHOD_NAMES = {
    "card": "Card",
    "bank_transfer": "Bank transfer",
    "jazzcash": "JazzCash",
    "easypaisa": "EasyPaisa",
}
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def web_status(value: object) -> str:
    """A status as the web screens word it: "Awaiting payment", "Confirmed", "Refunded"."""
    key = str(getattr(value, "value", value))
    return _WEB_STATUS.get(key) or (key[:1].upper() + key[1:].replace("_", " "))


def web_rupees(amount: object) -> str:
    """Rs. 2,000 (paisa only when there are some), like formatRs() on the web."""
    return rupees(amount).replace("₨ ", "Rs. ")


def web_date(value: date | datetime) -> str:
    """Oct 14, 2026, like formatDate() on the web."""
    d = value.date() if isinstance(value, datetime) else value
    return f"{_MONTHS[d.month - 1]} {d.day}, {d.year}"


def time_range_12h(start: time, end: time) -> str:
    """7:00 PM – 8:00 PM (the end of the last hour of the day is 12:00 AM)."""
    return f"{time_12h(start)} – {time_12h(end)}"


# ---- the words of the phone (lib/bookings-ui.ts), for the player's own export ----

_PHONE_STATUS = {
    "confirmed": "Confirmed",
    "pending_payment": "Awaiting payment",
    "pending_approval": "Awaiting approval",
    "completed": "Completed",
    "rejected": "Receipt not accepted",
}


def phone_status(value: object) -> str:
    key = str(getattr(value, "value", value))
    return _PHONE_STATUS.get(key, "Cancelled")
