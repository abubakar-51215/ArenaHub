"""Admin verification business logic.

Thin slice over the arena repository/state-machine: list the queue by status
and drive approve/reject. The transition itself lives in ``arena.service`` so
the arena state machine has one implementation; admin owns only the policy of
who may trigger it (enforced by ``require_role("admin")`` at the route).
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.arena import repository as arena_repo
from app.modules.arena import service as arena_service
from app.modules.arena.model import ArenaStatus
from app.modules.arena.schema import ArenaResponse
from app.shared.pagination import PaginationParams, paginated


async def list_queue(db: AsyncSession, status: ArenaStatus, params: PaginationParams) -> dict:
    arenas, total = await arena_repo.list_arenas_by_status(
        db, status, offset=params.offset, limit=params.page_size
    )
    items = [ArenaResponse.model_validate(a) for a in arenas]
    return paginated(items, total, params)


async def get_arena(db: AsyncSession, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    return ArenaResponse.model_validate(arena)


async def approve_arena(db: AsyncSession, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    await arena_service.set_status(db, arena, ArenaStatus.approved)
    await db.commit()
    refreshed = await arena_repo.get_arena(db, arena_id)
    assert refreshed is not None
    return ArenaResponse.model_validate(refreshed)


async def reject_arena(db: AsyncSession, arena_id: uuid.UUID, reason: str) -> ArenaResponse:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    await arena_service.set_status(db, arena, ArenaStatus.rejected, reason=reason)
    await db.commit()
    refreshed = await arena_repo.get_arena(db, arena_id)
    assert refreshed is not None
    return ArenaResponse.model_validate(refreshed)
