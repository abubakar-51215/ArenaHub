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
    """7:00 PM (no leading zero)."""
    if isinstance(value, str):
        value = time.fromisoformat(value)
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
