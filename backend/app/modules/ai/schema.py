"""Pydantic response models for the AI/NLP search + recommendation module."""

from pydantic import BaseModel

from app.modules.arena.schema import ArenaListItem


class ParsedQuery(BaseModel):
    """What the keyword parser extracted from a free-text search query —
    returned alongside the results so the UI can show the player what it
    understood (e.g. chips reading "cricket", "Lahore", "cheapest first")."""

    text: str = ""  # what was read (at most 120 characters)
    sport: str | None = None
    city: str | None = None
    area: str | None = None
    price_max: int | None = None
    sort: str = "newest"
    time_reference: str | None = None  # the time chip's words ("Tonight", "Tomorrow evening")
    near: bool = False
    # what was understood, in the order shown: {"kind": sport|place|time|price|sort|near, "label"}
    chips: list[dict[str, str]] = []
    used_fallback_text_search: bool = False


class NlpSearchResponse(BaseModel):
    parsed: ParsedQuery
    items: list[ArenaListItem]
    total: int


class RecommendationsResponse(BaseModel):
    items: list[ArenaListItem]
