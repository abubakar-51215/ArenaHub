"""FastAPI application factory and composition root.

Wires logging, exception handlers, CORS, and the /api/v1 routers. Feature
modules register their own routers here as they land.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache.redis import redis_client
from app.core.config import get_settings
from app.core.handlers import register_exception_handlers
from app.core.logging import configure_logging
from app.database import metadata as _metadata  # noqa: F401 — registers all ORM mappers
from app.database.session import engine
from app.middleware.rate_limit import RateLimitMiddleware
from app.modules.auth.api import router as auth_router
from app.modules.health.api import router as health_router
from app.modules.user.api import router as user_router

configure_logging()
settings = get_settings()

API_V1_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    # Clean shutdown of pooled connections.
    await engine.dispose()
    await redis_client.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="ArenaHub API",
        version="0.1.0",
        description="Sports arena booking platform for Pakistan.",
        docs_url="/docs",
        openapi_url=f"{API_V1_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.is_dev else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RateLimitMiddleware)

    register_exception_handlers(app)

    app.include_router(health_router, prefix=API_V1_PREFIX)
    app.include_router(auth_router, prefix=API_V1_PREFIX)
    app.include_router(user_router, prefix=API_V1_PREFIX)

    return app


app = create_app()
