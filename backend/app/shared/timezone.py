"""The platform's time zone. ArenaHub runs in one country (Pakistan), so
calendar days ("today", "bookings per day") are Asia/Karachi days whatever
zone the server or the database session happens to run in."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

PLATFORM_TZ_NAME = "Asia/Karachi"
PLATFORM_TZ = ZoneInfo(PLATFORM_TZ_NAME)


def platform_today() -> date:
    return datetime.now(PLATFORM_TZ).date()
