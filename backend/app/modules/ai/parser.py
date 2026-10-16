"""Smart search: a plain-words parser (rule based, deterministic, no model, no outside service).

"futsal in gulberg tonight under 3000" -> sport futsal, place Gulberg, time tonight (today from
6 PM to midnight, Asia/Karachi), at most 3,000 an hour. Each understood part is a chip the player
can remove.

What it understands:
* sports: the 10 sport keys and their aliases (futsal, football, soccer, 5-a-side -> futsal;
  padel, paddle; table tennis, ping pong; ...);
* places: the four cities and the areas of the live arenas (the caller loads them from the
  database: "gulberg" matches "Gulberg III");
* prices: under / below / less than / within / up to / max N (2,500, 2k, rs 3000, 3000 rs,
  "3000 se kam");
* order: cheap / budget / affordable / sasta (cheapest first), best / top rated / sab se acha
  (best rated), premium / expensive (most expensive first); when two clash, the first one
  written wins;
* near me (sort by distance; needs the phone's position);
* times in Asia/Karachi: today / aaj, tonight, tomorrow / kal, this weekend, morning / subah,
  afternoon, evening / shaam, night / raat, late night, after 6pm, before 5pm, at 8, 8:30 pm.
Filler words (in, at, for, a, me, find, show, arena, ground, ...) are ignored. Nothing
understood: the words are searched as an arena name instead (the screen says so).
Input: at most 120 characters are read; emoji and Urdu script are simply not understood (never
an error).
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

MAX_LEN = 120

SPORT_ALIASES: list[tuple[str, str]] = [
    # longer phrases first: "table tennis" is not tennis, "5 a side" is futsal
    ("table tennis", "table_tennis"),
    ("ping pong", "table_tennis"),
    ("pingpong", "table_tennis"),
    ("5 a side", "futsal"),
    ("five a side", "futsal"),
    ("futsal", "futsal"),
    ("football", "futsal"),
    ("soccer", "futsal"),
    ("cricket", "cricket"),
    ("padel", "padel"),
    ("paddle", "padel"),
    ("badminton", "badminton"),
    ("squash", "squash"),
    ("basketball", "basketball"),
    ("volleyball", "volleyball"),
    ("snooker", "snooker"),
    ("tennis", "tennis"),
]
SPORT_LABELS = {
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
CITIES = ["Lahore", "Islamabad", "Karachi", "Multan"]

_SORT_WORDS: list[tuple[str, str]] = [
    ("sab se acha", "best"),
    ("sab se achha", "best"),
    ("sabse acha", "best"),
    ("sabse achha", "best"),
    ("top rated", "best"),
    ("highest rated", "best"),
    ("best rated", "best"),
    ("best", "best"),
    ("cheapest", "price_asc"),
    ("cheap", "price_asc"),
    ("budget", "price_asc"),
    ("affordable", "price_asc"),
    ("low price", "price_asc"),
    ("sasta", "price_asc"),
    ("sasti", "price_asc"),
    ("saste", "price_asc"),
    ("premium", "price_desc"),
    ("expensive", "price_desc"),
    ("luxury", "price_desc"),
]
SORT_LABELS = {
    "best": "Best rated",
    "price_asc": "Cheapest first",
    "price_desc": "Most expensive first",
}
_NEAR = ["near me", "nearby", "close to me", "near by", "mere paas", "paas"]

# words that carry nothing (left alone, never "unknown")
FILLER = {
    "in", "at", "for", "a", "an", "the", "me", "my", "find", "show", "arena", "arenas", "ground",
    "grounds", "court", "courts", "please", "to", "of", "on", "with", "and", "book", "booking",
    "play", "near", "i", "want", "need", "some", "any", "is", "are", "mein", "main", "ka", "ki",
    "ke", "chahiye", "slot", "slots", "game", "place", "venue", "rs", "pkr", "rupees", "hour",
    "per", "hr", "price",
}  # fmt: skip

# times of day: (start hour, end hour); 24 = midnight at the end of the day
_DAYPARTS: list[tuple[str, tuple[int, int], str]] = [
    ("late night", (21, 24), "late night"),
    ("morning", (6, 12), "morning"),
    ("subah", (6, 12), "morning"),
    ("afternoon", (12, 17), "afternoon"),
    ("evening", (17, 21), "evening"),
    ("shaam", (17, 21), "evening"),
    ("sham", (17, 21), "evening"),
    ("night", (18, 24), "night"),
    ("raat", (18, 24), "night"),
]


@dataclass
class Place:
    """A city, or an area of a live arena. ``key`` is what a person types (lower case)."""

    key: str
    label: str
    city: str | None = None  # set for a city
    area: str | None = None  # the text an arena's area must contain


@dataclass
class TimeWindow:
    first_day: date
    last_day: date
    start: time  # inclusive: a slot starting at or after this
    end: time | None  # exclusive: a slot starting before this; None = until midnight
    label: str


@dataclass
class Parsed:
    text: str
    sport: str | None = None
    place: Place | None = None
    price_max: int | None = None
    sort: str | None = None
    near: bool = False
    time: TimeWindow | None = None
    unknown: list[str] = field(default_factory=list)

    @property
    def understood(self) -> bool:
        return bool(
            self.sport or self.place or self.price_max or self.sort or self.near or self.time
        )

    def chips(self) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        if self.sport:
            out.append({"kind": "sport", "label": SPORT_LABELS[self.sport]})
        if self.place:
            out.append({"kind": "place", "label": self.place.label})
        if self.time:
            out.append({"kind": "time", "label": self.time.label})
        if self.price_max:
            out.append({"kind": "price", "label": f"Under ₨ {self.price_max:,}"})
        if self.sort:
            out.append({"kind": "sort", "label": SORT_LABELS[self.sort]})
        if self.near:
            out.append({"kind": "near", "label": "Near me"})
        return out


# ---- places from the arenas' own data --------------------------------------------------------

_TRAILING = re.compile(r"^(i{1,3}|iv|v|vi{0,3}|ix|x|\d+[a-z]?|phase|block|sector|ext|extension)$")


def places_from_areas(areas: list[str]) -> list[Place]:
    """The four cities and every live arena's area, each also under its short name
    ("Gulberg III" is also "gulberg", "DHA Phase 5" is also "dha"). Longer names come first."""
    found: dict[str, Place] = {}
    for city in CITIES:
        found[city.lower()] = Place(key=city.lower(), label=city, city=city)
    for raw in areas:
        area = " ".join(raw.split())
        if not area:
            continue
        words = area.split(" ")
        full = area.lower()
        found.setdefault(full, Place(key=full, label=area, area=area))
        short = list(words)
        while len(short) > 1 and _TRAILING.match(short[-1].lower()):
            short.pop()
        if len(short) < len(words):
            key = " ".join(short).lower()
            found.setdefault(key, Place(key=key, label=" ".join(short), area=" ".join(short)))
    return sorted(found.values(), key=lambda p: -len(p.key))


# ---- text --------------------------------------------------------------------------------------


def normalise(text: str) -> str:
    """Lower case, ₨ spelled out, thousands commas and "2k" turned into digits, punctuation
    turned into spaces. Emoji and other scripts are dropped (they are never understood)."""
    text = unicodedata.normalize("NFKC", text)[:MAX_LEN].lower()
    text = text.replace("₨", " rs ").replace("rs.", " rs ")
    text = re.sub(r"(?<=\d),(?=\d{3}\b)", "", text)  # 2,500 -> 2500
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s?k\b", lambda m: str(int(float(m.group(1)) * 1000)), text)
    text = re.sub(r"(\d)\s*(am|pm)\b", r"\1 \2", text)  # 8pm -> 8 pm
    text = re.sub(r"5-a-side", "5 a side", text)
    text = re.sub(r"top-rated", "top rated", text)
    text = re.sub(r"[^a-z0-9: ]+", " ", text)
    return " ".join(text.split())


def _take(text: str, phrase: str) -> tuple[bool, str, int]:
    """Find ``phrase`` as whole words; return (found, text without it, position)."""
    m = re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", text)
    if not m:
        return False, text, -1
    return True, (text[: m.start()] + " " + text[m.end() :]), m.start()


# ---- prices --------------------------------------------------------------------------------------

_PRICE = re.compile(
    r"(?:under|below|less than|within|up to|upto|max|maximum|at most|tak|andar)\s+(?:rs\s+|pkr\s+)?"
    r"(\d{3,6})(?:\s+(?:rs|pkr|rupees))?"
    r"|(\d{3,6})\s+(?:rs\s+|pkr\s+|rupees\s+)?(?:se kam|or less|or below|max)"
)


def _price(text: str) -> tuple[int | None, str]:
    m = _PRICE.search(text)
    if not m:
        return None, text
    value = int(m.group(1) or m.group(2))
    if value < 200:  # "under 50" is not an hourly price in rupees
        return None, text
    return value, text[: m.start()] + " " + text[m.end() :]


# ---- times (Asia/Karachi) ------------------------------------------------------------------------

_CLOCK = r"(\d{1,2})(?::(\d{2}))?(?:\s+(am|pm))?"


def _hour(h: str, minutes: str | None, ampm: str | None) -> time | None:
    hour = int(h)
    minute = int(minutes or 0)
    if hour > 23 or minute > 59:
        return None
    if ampm == "pm" and hour < 12:
        hour += 12
    elif ampm == "am" and hour == 12:
        hour = 0
    elif ampm is None and 1 <= hour <= 11:
        hour += 12  # "at 8" is 8 in the evening: games are played after work
    return time(hour % 24, minute)


def _clock_label(t: time) -> str:
    h = t.hour % 12 or 12
    suffix = "AM" if t.hour < 12 else "PM"
    return f"{h}:{t.minute:02d} {suffix}" if t.minute else f"{h} {suffix}"


def _time(text: str, now: datetime) -> tuple[TimeWindow | None, str]:
    today = now.date()
    day_first = day_last = None
    day_label = ""
    tonight = False
    for phrase, kind in [
        ("this weekend", "weekend"),
        ("weekend", "weekend"),
        ("tonight", "tonight"),
        ("today", "today"),
        ("aaj", "today"),
        ("tomorrow", "tomorrow"),
        ("kal", "tomorrow"),
    ]:
        found, text2, _ = _take(text, phrase)
        if not found:
            continue
        text = text2
        if day_first is not None:
            continue  # the first day word wins; the others are only taken out
        if kind == "weekend":
            saturday = today + timedelta(days=(5 - today.weekday()) % 7)
            if today.weekday() == 6:  # Sunday: this weekend is today
                saturday = today
            day_first, day_last, day_label = (
                saturday,
                today + timedelta(days=(6 - today.weekday()) % 7),
                "This weekend",
            )
        elif kind == "tomorrow":
            day_first = day_last = today + timedelta(days=1)
            day_label = "Tomorrow"
        else:
            day_first = day_last = today
            day_label = "Today"
            tonight = kind == "tonight"

    start: time | None = None
    end: time | None = None
    part_label = ""
    m = re.search(rf"\b(?:after|from)\s+{_CLOCK}\b", text)
    if m and (t := _hour(m.group(1), m.group(2), m.group(3))):
        start, end, part_label = t, None, f"after {_clock_label(t)}"
        text = text[: m.start()] + " " + text[m.end() :]
    else:
        m = re.search(rf"\bbefore\s+{_CLOCK}\b", text)
        if m and (t := _hour(m.group(1), m.group(2), m.group(3))):
            start, end, part_label = time(0, 0), t, f"before {_clock_label(t)}"
            text = text[: m.start()] + " " + text[m.end() :]
        else:
            m = re.search(rf"\bat\s+{_CLOCK}\b|\b(\d{{1,2}})(?::(\d{{2}}))?\s+(am|pm)\b", text)
            if m:
                g = m.groups()
                h, mm, ap = (g[0], g[1], g[2]) if g[0] else (g[3], g[4], g[5])
                if t := _hour(h, mm, ap):
                    start = t
                    end = (datetime.combine(today, t) + timedelta(hours=1)).time()
                    if end <= start:
                        end = None
                    part_label = f"at {_clock_label(t)}"
                    text = text[: m.start()] + " " + text[m.end() :]
    if start is None:
        for phrase, (a, b), label in _DAYPARTS:
            found, text2, _ = _take(text, phrase)
            if found:
                text = text2
                start, end, part_label = time(a, 0), (None if b == 24 else time(b, 0)), label
                break
    if tonight and start is None:
        start, end = time(18, 0), None

    if day_first is None and start is None:
        return None, text
    if day_first is None:
        day_first = day_last = today
        day_label = "Today"
    assert day_last is not None
    if part_label.startswith(("after", "before", "at")):
        label = f"{'Tonight' if tonight else day_label}, {part_label}"
    elif tonight or (day_label == "Today" and part_label == "night"):
        label = "Tonight"
    elif part_label and day_label == "Today":
        label = "Tonight, late" if part_label == "late night" else f"This {part_label}"
    elif part_label:
        label = f"{day_label} {part_label}"
    else:
        label = day_label
    return TimeWindow(day_first, day_last, start or time(0, 0), end, label), text


# ---- the whole sentence --------------------------------------------------------------------------


def parse(text: str, *, places: list[Place], now: datetime) -> Parsed:
    """``now`` is the current time in Asia/Karachi (only its date and time are read)."""
    raw = " ".join((text or "").split())[:MAX_LEN]
    out = Parsed(text=raw)
    work = f" {normalise(raw)} "

    price, work = _price(work)
    out.price_max = price

    window, work = _time(work, now)
    out.time = window

    for phrase in _NEAR:
        found, work2, _ = _take(work, phrase)
        if found:
            out.near, work = True, work2
            break

    first_sort: tuple[int, str] | None = None
    for phrase, sort in _SORT_WORDS:
        while True:
            found, work2, pos = _take(work, phrase)
            if not found:
                break
            work = work2
            if first_sort is None or pos < first_sort[0]:
                first_sort = (pos, sort)
    out.sort = first_sort[1] if first_sort else None

    first_sport: tuple[int, str] | None = None
    for phrase, key in SPORT_ALIASES:
        while True:
            found, work2, pos = _take(work, phrase)
            if not found:
                break
            work = work2
            if first_sport is None or pos < first_sport[0]:
                first_sport = (pos, key)
    out.sport = first_sport[1] if first_sport else None

    for place in places:
        found, work2, _ = _take(work, place.key)
        if found:
            out.place, work = place, work2
            break

    out.unknown = [w for w in work.split() if w not in FILLER and not w.isdigit()]
    return out
