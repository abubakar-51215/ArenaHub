"""Health-check endpoint — verifies the API can reach PostgreSQL and Redis.

Returns 200 when every dependency is reachable, 503 if any is degraded, so
uptime checks and the Sprint 1 exit criterion ("API health check responds")
have a single source of truth.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import redis_client
from app.database.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service health check")
async def health_check(db: AsyncSession = Depends(get_db)) -> JSONResponse:
    checks = {"api": "ok", "database": "ok", "redis": "ok"}

    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        checks["database"] = "error"

    try:
        await redis_client.ping()
    except Exception:
        checks["redis"] = "error"

    healthy = all(status == "ok" for status in checks.values())
    body = {
        "success": healthy,
        "message": "Service healthy" if healthy else "Service degraded",
        "data": checks,
        "errors": None,
    }
    return JSONResponse(status_code=200 if healthy else 503, content=body)
