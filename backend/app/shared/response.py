"""Standard API response envelope (CLAUDE.md — Standard API response format).

Every /api/v1 endpoint returns one of these two shapes so the frontend never
needs per-endpoint adapters. Paginated endpoints nest pagination metadata
inside `data` (items/total/page/page_size) to keep the envelope uniform.
"""

from typing import Any

from pydantic import BaseModel


class FieldError(BaseModel):
    field: str
    message: str


class SuccessResponse[T](BaseModel):
    success: bool = True
    message: str
    data: T | None = None
    errors: None = None


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    data: None = None
    errors: list[FieldError] | None = None


def success(
    data: Any = None,
    message: str = "OK",
) -> dict[str, Any]:
    """Build a success envelope as a plain dict (JSON-serializable)."""
    return {"success": True, "message": message, "data": data, "errors": None}


def error(
    message: str,
    errors: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Build an error envelope as a plain dict (JSON-serializable)."""
    return {"success": False, "message": message, "data": None, "errors": errors}
