"""The one standard list of arena amenities.

An arena has some of these and nothing else: the owner ticks boxes, the player's "Must have"
filter offers them, and the server refuses a key that is not here. The web and phone apps keep no
copy: they read this list from ``GET /arenas/amenities``. A key never changes once shipped (a
display name may).
"""

import re

# (key, display name), in the order the apps show them
STANDARD_AMENITIES: tuple[tuple[str, str], ...] = (
    ("parking", "Parking"),
    ("floodlights", "Floodlights"),
    ("washrooms", "Washrooms"),
    ("changing_room", "Changing room"),
    ("drinking_water", "Drinking water"),
    ("cafeteria", "Cafeteria"),
    ("wifi", "Wi-Fi"),
    ("first_aid", "First aid"),
    ("seating", "Seating"),
    ("shower", "Shower"),
    ("air_conditioning", "Air conditioning"),
    ("equipment_rental", "Equipment rental"),
    ("cctv", "CCTV"),
    ("prayer_area", "Prayer area"),
)

AMENITY_KEYS: frozenset[str] = frozenset(key for key, _ in STANDARD_AMENITIES)
AMENITY_NAME_BY_KEY: dict[str, str] = dict(STANDARD_AMENITIES)


def _squash(text: str) -> str:
    """Lower case, letters and digits only, a plural "s" dropped."""
    letters = re.sub(r"[^a-z0-9]", "", text.lower())
    return letters[:-1] if letters.endswith("s") else letters


_KEY_BY_SQUASHED: dict[str, str] = {
    **{_squash(name): key for key, name in STANDARD_AMENITIES},
    **{_squash(key): key for key, _ in STANDARD_AMENITIES},
}


def key_for_old_name(name: str) -> str | None:
    """The standard key an older, free-typed amenity name stands for (None when it matches none)."""
    return _KEY_BY_SQUASHED.get(_squash(name))
