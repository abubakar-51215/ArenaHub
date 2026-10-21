"""Smart search: 40 natural-language queries, as a real player might type them (not the
synthetic phrase-by-phrase cases in test_smart_search_parser.py). Each row records what should be
understood for sport, city/place, time, price, near-me and sort-order.

``NOW`` is Thursday 22 Oct 2026, 3 PM in Asia/Karachi, so weekday names resolve deterministically:
Friday is tomorrow, Saturday/Sunday/Monday/Tuesday/Wednesday are later in the coming week.

Two known, reported gaps, not fixed here (no change to the data model in this pass):
* "indoor" / "outdoor" are not understood — arenas and courts have no indoor/outdoor column to
  filter on, so there is nothing to connect a parsed word to. These queries still degrade safely
  (the word is kept as an unknown word, searched as arena-name text), never an error.
* A handful of generic words ("sports", "ground", "club", "tables", "anything", "fun", "open",
  "now") are not sport names and are correctly left unknown.
"""

from datetime import datetime

from app.modules.ai.parser import parse, places_from_areas

NOW = datetime(2026, 10, 22, 15, 0)  # a Thursday
assert NOW.weekday() == 3
PLACES = places_from_areas(
    ["Gulberg III", "DHA Phase 5", "Model Town", "Clifton", "F-7 Markaz", "Bahria Town"]
)

# (query, sport, place label, time label, price, near, sort)
QUERIES: list[tuple[str, str | None, str | None, str | None, int | None, bool, str | None]] = [
    (
        "football ground in Lahore tonight under 3000",
        "futsal",
        "Lahore",
        "Tonight",
        3000,
        False,
        None,
    ),
    ("cheap futsal near me this weekend", "futsal", None, "This weekend", None, True, "price_asc"),
    ("indoor cricket Saturday evening", "cricket", None, "Saturday evening", None, False, None),
    ("outdoor football this sunday", "futsal", None, "Sunday", None, False, None),
    ("padel court in DHA tomorrow morning", "padel", "DHA", "Tomorrow morning", None, False, None),
    ("badminton in Islamabad under 1500", "badminton", "Islamabad", None, 1500, False, None),
    ("table tennis near me", "table_tennis", None, None, None, True, None),
    ("best rated cricket ground in karachi", "cricket", "Karachi", None, None, False, "best"),
    ("cheapest badminton court in multan", "badminton", "Multan", None, None, False, "price_asc"),
    ("squash tonight after 8pm", "squash", None, "Tonight, after 8 PM", None, False, None),
    ("basketball court this weekend", "basketball", None, "This weekend", None, False, None),
    ("volleyball near clifton", "volleyball", "Clifton", None, None, False, None),
    ("snooker club in model town", "snooker", "Model Town", None, None, False, None),
    ("tennis court tomorrow evening", "tennis", None, "Tomorrow evening", None, False, None),
    ("5 a side football in gulberg", "futsal", "Gulberg", None, None, False, None),
    ("ping pong tables in f-7", "table_tennis", None, None, None, False, None),
    ("futsal under 2000 in lahore", "futsal", "Lahore", None, 2000, False, None),
    ("cricket ground open now", "cricket", None, None, None, False, None),
    ("book a padel court for friday", "padel", None, "Tomorrow", None, False, None),
    ("badminton monday morning", "badminton", None, "Monday morning", None, False, None),
    (
        "cheap cricket in karachi this weekend",
        "cricket",
        "Karachi",
        "This weekend",
        None,
        False,
        "price_asc",
    ),
    ("football under 3000 rs tonight", "futsal", None, "Tonight", 3000, False, None),
    ("premium padel in dha", "padel", "DHA", None, None, False, "price_desc"),
    ("top rated futsal gulberg", "futsal", "Gulberg", None, None, False, "best"),
    ("indoor badminton court islamabad", "badminton", "Islamabad", None, None, False, None),
    ("outdoor cricket ground lahore", "cricket", "Lahore", None, None, False, None),
    ("near me futsal tonight", "futsal", None, "Tonight", None, True, None),
    ("squash court near me under 2500", "squash", None, None, 2500, True, None),
    ("table tennis in bahria town", "table_tennis", "Bahria Town", None, None, False, None),
    ("basketball near me this weekend", "basketball", None, "This weekend", None, True, None),
    ("cheap tennis court multan", "tennis", "Multan", None, None, False, "price_asc"),
    ("volleyball court tomorrow", "volleyball", None, "Tomorrow", None, False, None),
    ("snooker tonight", "snooker", None, "Tonight", None, False, None),
    ("football ground wednesday evening", "futsal", None, "Wednesday evening", None, False, None),
    ("tuesday night cricket in lahore", "cricket", "Lahore", "Tuesday night", None, False, None),
    ("find me a futsal ground", "futsal", None, None, None, False, None),
    ("anything fun to play tonight", None, None, "Tonight", None, False, None),
    ("arena near gulberg", None, "Gulberg", None, None, False, None),
    ("cheap sports ground in karachi under 2000", None, "Karachi", None, 2000, False, "price_asc"),
    ("indoor sports lahore", None, "Lahore", None, None, False, None),
]

assert len(QUERIES) == 40


def test_exactly_forty_queries() -> None:
    assert len(QUERIES) == 40


def test_each_query_is_understood_as_expected() -> None:
    for query, sport, place, time_label, price, near, sort in QUERIES:
        p = parse(query, places=PLACES, now=NOW)
        assert p.sport == sport, f"{query!r}: sport"
        assert (p.place.label if p.place else None) == place, f"{query!r}: place"
        assert (p.time.label if p.time else None) == time_label, f"{query!r}: time"
        assert p.price_max == price, f"{query!r}: price"
        assert p.near == near, f"{query!r}: near"
        assert p.sort == sort, f"{query!r}: sort"


def test_comprehension_rate_per_dimension() -> None:
    """At least this many of the 40 give a usable signal per dimension — a floor, so a future
    change to the parser notices if comprehension regresses. Indoor/outdoor is not a dimension
    here: there is no such column on arenas/courts yet (see the module docstring)."""
    hits = {"sport": 0, "place": 0, "time": 0, "price": 0, "near": 0, "sort": 0}
    for query, *_rest in QUERIES:
        p = parse(query, places=PLACES, now=NOW)
        hits["sport"] += bool(p.sport)
        hits["place"] += bool(p.place)
        hits["time"] += bool(p.time)
        hits["price"] += bool(p.price_max)
        hits["near"] += p.near
        hits["sort"] += bool(p.sort)
    assert hits["sport"] >= 35
    assert hits["place"] >= 18
    assert hits["time"] >= 18
    assert hits["price"] >= 5
    assert hits["near"] >= 5
    assert hits["sort"] >= 7


def test_indoor_outdoor_is_a_known_gap_not_a_crash() -> None:
    """Documented, not silently pretended to work: no indoor/outdoor column exists on arenas or
    courts, so the word is kept as an unknown word (searched as arena-name text) rather than
    dropped or mis-filtered. If this ever starts matching a real filter, update this test."""
    for query in ("indoor cricket Saturday evening", "outdoor football this sunday"):
        p = parse(query, places=PLACES, now=NOW)
        assert any(w in p.unknown for w in ("indoor", "outdoor"))
