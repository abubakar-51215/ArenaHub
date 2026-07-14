"""Pydantic response models for the AI/NLP search + recommendation module."""

from pydantic import BaseModel

from app.modules.arena.schema import ArenaResponse


class ParsedQuery(BaseModel):
    """What the keyword parser extracted from a free-text search query —
    returned alongside the results so the UI can show the player what it
    understood (e.g. chips reading "cricket", "Lahore", "cheapest first")."""

    sport: str | None = None
    city: str | None = None
    sort: str = "newest"
    time_reference: str | None = None
    used_fallback_text_search: bool = False


class NlpSearchResponse(BaseModel):
    parsed: ParsedQuery
    items: list[ArenaResponse]
    total: int


class RecommendationsResponse(BaseModel):
    items: list[ArenaResponse]
