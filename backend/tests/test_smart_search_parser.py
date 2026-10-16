"""Smart search parser: sentences in, the expected understanding out (no database, no clock).

``NOW`` is Wednesday 14 Oct 2026, 3 PM in Asia/Karachi. Each case lists only the parts that must
be understood; every other part must be empty."""

from datetime import date, datetime, time

import pytest

from app.modules.ai.parser import MAX_LEN, normalise, parse, places_from_areas

NOW = datetime(2026, 10, 14, 15, 0)  # a Wednesday
assert NOW.weekday() == 2
PLACES = places_from_areas(["Gulberg III", "DHA Phase 5", "Model Town", "Clifton", "F-7 Markaz"])

TODAY, TOMORROW = date(2026, 10, 14), date(2026, 10, 15)
SAT, SUN = date(2026, 10, 17), date(2026, 10, 18)

# (sentence, expected parts). time = (first day, last day, start, end) ; place = chip label
CASES: list[tuple[str, dict]] = [
    # the frame sentences
    (
        "futsal in gulberg tonight under 3000",
        {
            "sport": "futsal",
            "place": "Gulberg",
            "price": 3000,
            "time": (TODAY, TODAY, time(18), None),
        },
    ),
    (
        "padel in gulberg tonight under 1000",
        {
            "sport": "padel",
            "place": "Gulberg",
            "price": 1000,
            "time": (TODAY, TODAY, time(18), None),
        },
    ),
    # sports and their aliases
    ("football", {"sport": "futsal"}),
    ("soccer near me", {"sport": "futsal", "near": True}),
    ("5-a-side", {"sport": "futsal"}),
    ("five a side game", {"sport": "futsal"}),
    ("cricket", {"sport": "cricket"}),
    ("paddle courts", {"sport": "padel"}),
    ("badminton", {"sport": "badminton"}),
    ("table tennis", {"sport": "table_tennis"}),
    ("ping pong", {"sport": "table_tennis"}),
    ("tennis", {"sport": "tennis"}),
    ("squash", {"sport": "squash"}),
    ("basketball", {"sport": "basketball"}),
    ("volleyball", {"sport": "volleyball"}),
    ("snooker", {"sport": "snooker"}),
    ("cricket or futsal", {"sport": "cricket"}),  # the first sport written wins
    # places: cities and the arenas' own areas
    ("lahore", {"place": "Lahore"}),
    ("cricket in Karachi", {"sport": "cricket", "place": "Karachi"}),
    ("padel dha", {"sport": "padel", "place": "DHA"}),
    ("dha phase 5", {"place": "DHA Phase 5"}),
    ("model town futsal", {"sport": "futsal", "place": "Model Town"}),
    ("clifton", {"place": "Clifton"}),
    # prices
    ("under 3000", {"price": 3000}),
    ("below 2,500", {"price": 2500}),
    ("less than 2k", {"price": 2000}),
    ("within 3000 rs", {"price": 3000}),
    ("up to 2500", {"price": 2500}),
    ("under rs 1,500", {"price": 1500}),
    ("3000 se kam", {"price": 3000}),
    ("under ₨ 4,000", {"price": 4000}),
    ("under 50", {}),  # not an hourly price: ignored
    # order
    ("cheap futsal", {"sport": "futsal", "sort": "price_asc"}),
    ("budget badminton", {"sport": "badminton", "sort": "price_asc"}),
    ("best padel", {"sport": "padel", "sort": "best"}),
    ("top rated cricket", {"sport": "cricket", "sort": "best"}),
    ("premium padel", {"sport": "padel", "sort": "price_desc"}),
    ("cheap premium", {"sort": "price_asc"}),  # clashing words: the first one wins
    ("premium but cheap", {"sort": "price_desc"}),
    # times
    ("today", {"time": (TODAY, TODAY, time(0), None)}),
    ("tomorrow", {"time": (TOMORROW, TOMORROW, time(0), None)}),
    ("this weekend", {"time": (SAT, SUN, time(0), None)}),
    ("after 6pm", {"time": (TODAY, TODAY, time(18), None)}),
    ("after 6", {"time": (TODAY, TODAY, time(18), None)}),
    ("at 8", {"time": (TODAY, TODAY, time(20), time(21))}),
    ("8 pm tomorrow", {"time": (TOMORROW, TOMORROW, time(20), time(21))}),
    ("7:30 pm", {"time": (TODAY, TODAY, time(19, 30), time(20, 30))}),
    ("morning", {"time": (TODAY, TODAY, time(6), time(12))}),
    ("tomorrow evening", {"time": (TOMORROW, TOMORROW, time(17), time(21))}),
    ("late night", {"time": (TODAY, TODAY, time(21), None)}),
    ("before 10 am", {"time": (TODAY, TODAY, time(0), time(10))}),
    # Roman Urdu
    ("aaj futsal", {"sport": "futsal", "time": (TODAY, TODAY, time(0), None)}),
    ("kal raat cricket", {"sport": "cricket", "time": (TOMORROW, TOMORROW, time(18), None)}),
    ("sasta padel lahore", {"sport": "padel", "place": "Lahore", "sort": "price_asc"}),
    ("sab se acha futsal", {"sport": "futsal", "sort": "best"}),
    # mixed language, everything at once
    (
        "kal shaam sasta futsal gulberg 2500 se kam",
        {
            "sport": "futsal",
            "place": "Gulberg",
            "price": 2500,
            "sort": "price_asc",
            "time": (TOMORROW, TOMORROW, time(17), time(21)),
        },
    ),
    (
        "Find me a CHEAP Football Ground in DHA this weekend after 7 PM under 3,000 rs",
        {
            "sport": "futsal",
            "place": "DHA",
            "price": 3000,
            "sort": "price_asc",
            "time": (SAT, SUN, time(19), None),
        },
    ),
    # filler only, unknown words, empty, emoji, Urdu script: nothing understood, no error
    ("find me an arena", {}),
    ("goal line", {}),
    ("", {}),
    ("   ", {}),
    ("🏸⚽🔥", {}),
    ("بیڈمنٹن لاہور", {}),
    ("!!! ??? %%% ___ '; drop table arenas; --", {}),
]


def _check(sentence: str, want: dict) -> None:
    p = parse(sentence, places=PLACES, now=NOW)
    assert p.sport == want.get("sport"), sentence
    assert (p.place.label if p.place else None) == want.get("place"), sentence
    assert p.price_max == want.get("price"), sentence
    assert p.sort == want.get("sort"), sentence
    assert p.near == want.get("near", False), sentence
    got_time = (p.time.first_day, p.time.last_day, p.time.start, p.time.end) if p.time else None
    assert got_time == want.get("time"), sentence
    assert p.understood == bool(want), sentence


@pytest.mark.parametrize(("sentence", "want"), CASES, ids=[c[0][:40] or "empty" for c in CASES])
def test_sentence(sentence: str, want: dict) -> None:
    _check(sentence, want)


def test_at_least_forty_sentences() -> None:
    assert len(CASES) >= 40


def test_very_long_text_is_cut_to_120_characters() -> None:
    long = "futsal " + "x" * 5000 + " cricket"
    p = parse(long, places=PLACES, now=NOW)
    assert len(p.text) == MAX_LEN
    assert p.sport == "futsal"  # read from the first 120 characters only
    assert len(normalise("y" * 10_000)) <= MAX_LEN


def test_karachi_midnight_edge() -> None:
    """Just before and just after midnight, "today" and "tonight" are the Karachi day of ``now``."""
    before = datetime(2026, 10, 14, 23, 59)
    after = datetime(2026, 10, 15, 0, 1)
    for text, now, day in (
        ("tonight", before, date(2026, 10, 14)),
        ("tonight", after, date(2026, 10, 15)),
        ("tomorrow", after, date(2026, 10, 16)),
    ):
        window = parse(text, places=PLACES, now=now).time
        assert window is not None and window.first_day == day


def test_weekend_on_saturday_and_sunday() -> None:
    sat = datetime(2026, 10, 17, 10, 0)
    sun = datetime(2026, 10, 18, 10, 0)
    w = parse("this weekend", places=PLACES, now=sat).time
    assert w is not None
    assert (w.first_day, w.last_day) == (date(2026, 10, 17), date(2026, 10, 18))
    w = parse("weekend", places=PLACES, now=sun).time
    assert w is not None
    assert (w.first_day, w.last_day) == (date(2026, 10, 18), date(2026, 10, 18))


def test_chips_say_what_was_understood_in_plain_words() -> None:
    p = parse("futsal in gulberg tonight under 3000", places=PLACES, now=NOW)
    assert [c["label"] for c in p.chips()] == ["Futsal", "Gulberg", "Tonight", "Under ₨ 3,000"]
    assert [c["kind"] for c in p.chips()] == ["sport", "place", "time", "price"]
    p = parse("cheap padel tomorrow evening near me", places=PLACES, now=NOW)
    assert [c["label"] for c in p.chips()] == [
        "Padel",
        "Tomorrow evening",
        "Cheapest first",
        "Near me",
    ]
    assert parse("after 6pm", places=PLACES, now=NOW).chips()[0]["label"] == "Today, after 6 PM"
    assert parse("evening", places=PLACES, now=NOW).chips()[0]["label"] == "This evening"


def test_unknown_words_are_kept_apart_and_filler_is_ignored() -> None:
    p = parse("show me futsal xyzzy arena", places=PLACES, now=NOW)
    assert p.sport == "futsal" and p.unknown == ["xyzzy"]


def test_places_come_from_the_arenas_data_not_a_fixed_list() -> None:
    assert parse("gulberg", places=places_from_areas([]), now=NOW).place is None
    custom = places_from_areas(["Bahria Town Phase 8"])
    place = parse("padel bahria town", places=custom, now=NOW).place
    assert place is not None and place.label == "Bahria Town"
