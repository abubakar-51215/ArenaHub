"""FastAPI application factory and composition root.

Wires logging, exception handlers, CORS, and the /api/v1 routers. Feature
modules register their own routers here as they land.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.cache.redis import redis_client
from app.core.config import get_settings
from app.core.handlers import register_exception_handlers
from app.core.logging import configure_logging
from app.database import metadata as _metadata  # noqa: F401 — registers all ORM mappers
from app.database.session import engine
from app.middleware.rate_limit import RateLimitMiddleware
from app.modules.admin.api import router as admin_router
from app.modules.ai.api import router as ai_router
from app.modules.arena.api import owner_router as arena_owner_router
from app.modules.arena.api import router as arena_router
from app.modules.auth.api import router as auth_router
from app.modules.booking.api import owner_router as booking_owner_router
from app.modules.booking.api import router as booking_router
from app.modules.complaint.api import admin_router as complaint_admin_router
from app.modules.complaint.api import router as complaint_router
from app.modules.court.api import owner_router as court_owner_router
from app.modules.court.api import router as court_router
from app.modules.dashboard.api import owner_router as dashboard_owner_router
from app.modules.equipment.api import owner_router as equipment_owner_router
from app.modules.equipment.api import router as equipment_router
from app.modules.health.api import router as health_router
from app.modules.match.api import router as match_router
from app.modules.media.api import router as media_router
from app.modules.notification.api import router as notification_router
from app.modules.payment.api import admin_router as payment_admin_router
from app.modules.payment.api import owner_router as payment_owner_router
from app.modules.payment.api import router as payment_router
from app.modules.payment.api import webhook_router as payment_webhook_router
from app.modules.report.api import admin_router as report_admin_router
from app.modules.report.api import owner_router as report_owner_router
from app.modules.report.api import router as report_router
from app.modules.review.api import admin_router as review_admin_router
from app.modules.review.api import owner_router as review_owner_router
from app.modules.review.api import router as review_router
from app.modules.slot.api import owner_router as slot_owner_router
from app.modules.slot.api import router as slot_router
from app.modules.user.api import router as user_router
from app.tasks.scheduler import create_scheduler
from app.websocket.api import router as websocket_router

configure_logging()
settings = get_settings()

API_V1_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    scheduler = create_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
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
    app.include_router(arena_router, prefix=API_V1_PREFIX)
    app.include_router(arena_owner_router, prefix=API_V1_PREFIX)
    app.include_router(court_router, prefix=API_V1_PREFIX)
    app.include_router(court_owner_router, prefix=API_V1_PREFIX)
    app.include_router(equipment_router, prefix=API_V1_PREFIX)
    app.include_router(equipment_owner_router, prefix=API_V1_PREFIX)
    app.include_router(review_router, prefix=API_V1_PREFIX)
    app.include_router(review_owner_router, prefix=API_V1_PREFIX)
    app.include_router(review_admin_router, prefix=API_V1_PREFIX)
    app.include_router(slot_router, prefix=API_V1_PREFIX)
    app.include_router(slot_owner_router, prefix=API_V1_PREFIX)
    app.include_router(booking_router, prefix=API_V1_PREFIX)
    app.include_router(booking_owner_router, prefix=API_V1_PREFIX)
    app.include_router(admin_router, prefix=API_V1_PREFIX)
    app.include_router(complaint_router, prefix=API_V1_PREFIX)
    app.include_router(complaint_admin_router, prefix=API_V1_PREFIX)
    app.include_router(media_router, prefix=API_V1_PREFIX)
    app.include_router(payment_router, prefix=API_V1_PREFIX)
    app.include_router(payment_owner_router, prefix=API_V1_PREFIX)
    app.include_router(payment_admin_router, prefix=API_V1_PREFIX)
    app.include_router(payment_webhook_router, prefix=API_V1_PREFIX)
    app.include_router(dashboard_owner_router, prefix=API_V1_PREFIX)
    app.include_router(notification_router, prefix=API_V1_PREFIX)
    app.include_router(report_router, prefix=API_V1_PREFIX)
    app.include_router(report_owner_router, prefix=API_V1_PREFIX)
    app.include_router(report_admin_router, prefix=API_V1_PREFIX)
    app.include_router(ai_router, prefix=API_V1_PREFIX)
    app.include_router(match_router, prefix=API_V1_PREFIX)
    app.include_router(websocket_router)

    # Serve locally-stored uploads in dev (Cloudinary serves them in prod).
    Path(settings.media_root).mkdir(parents=True, exist_ok=True)
    app.mount(
        settings.media_url_prefix,
        StaticFiles(directory=settings.media_root),
        name="media",
    )

    return app


app = create_app()
