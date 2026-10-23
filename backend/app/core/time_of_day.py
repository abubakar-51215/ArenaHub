"""What Morning, Afternoon, Evening and Night mean for the arena filter -- the only place the hours
are written down. A slot belongs to the part of the day it STARTS in, on the Pakistan clock
(Asia/Karachi), on the date it is on. Night runs across midnight: from 21:00 to 05:00.
"""

from datetime import time
from enum import StrEnum


class TimeOfDay(StrEnum):
    morning = "morning"
    afternoon = "afternoon"
    evening = "evening"
    night = "night"


# (first start time that belongs to it, first start time that does not). Night's end is before its
# start: it wraps past midnight.
BANDS: dict[TimeOfDay, tuple[time, time]] = {
    TimeOfDay.morning: (time(5, 0), time(12, 0)),
    TimeOfDay.afternoon: (time(12, 0), time(17, 0)),
    TimeOfDay.evening: (time(17, 0), time(21, 0)),
    TimeOfDay.night: (time(21, 0), time(5, 0)),
}


def covers(band: TimeOfDay, start: time) -> bool:
    """Whether a slot starting at ``start`` is in ``band``."""
    first, after = BANDS[band]
    if first < after:
        return first <= start < after
    return start >= first or start < after
