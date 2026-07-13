"""Pagination primitives shared by list endpoints.

Paginated endpoints nest metadata inside the response envelope's ``data``
(items/total/page/page_size) so the envelope stays uniform (shared/response.py).
"""

from typing import Any

from fastapi import Query
from pydantic import BaseModel


class PaginationParams(BaseModel):
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def pagination_params(
    page: int = Query(1, ge=1, description="1-based page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
) -> PaginationParams:
    """FastAPI dependency yielding validated pagination params."""
    return PaginationParams(page=page, page_size=page_size)


def paginated(items: list[Any], total: int, params: PaginationParams) -> dict[str, Any]:
    """Shape a page of results for the ``data`` field of the envelope."""
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    }
