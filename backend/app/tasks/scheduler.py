"""APScheduler wiring (docs/PROJECT_GUIDELINES.md deviation #14: BackgroundTasks
for fire-and-forget work, APScheduler for recurring jobs — no Celery).

Three recurring jobs, each opening its own short-lived DB session (the
scheduler runs outside any request, so there's no request-scoped session to
reuse):
- auto-cancel bookings stuck in pending_payment past 24h
- 24h/1h booking reminders
- expired OTP / password-reset-token cleanup

Started from ``main.py``'s lifespan; a no-op in tests (nothing imports or
starts it there).
"""

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database.session import SessionFactory
from app.modules.auth import service as auth_service
from app.modules.booking import service as booking_service

log = structlog.get_logger()

AUTO_CANCEL_INTERVAL_MINUTES = 30
REMINDER_INTERVAL_MINUTES = 15
CLEANUP_INTERVAL_MINUTES = 60


async def _run_auto_cancel() -> None:
    async with SessionFactory() as db:
        count = await booking_service.auto_cancel_stale_bookings(db)
        if count:
            log.info("scheduler.auto_cancel_stale_bookings", cancelled=count)


async def _run_reminders() -> None:
    async with SessionFactory() as db:
        count = await booking_service.send_upcoming_reminders(db)
        if count:
            log.info("scheduler.send_upcoming_reminders", sent=count)


async def _run_cleanup() -> None:
    async with SessionFactory() as db:
        otps, tokens = await auth_service.cleanup_expired(db)
        if otps or tokens:
            log.info("scheduler.cleanup_expired", otps=otps, reset_tokens=tokens)


def create_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _run_auto_cancel,
        "interval",
        minutes=AUTO_CANCEL_INTERVAL_MINUTES,
        id="auto_cancel_bookings",
    )
    scheduler.add_job(
        _run_reminders, "interval", minutes=REMINDER_INTERVAL_MINUTES, id="booking_reminders"
    )
    scheduler.add_job(_run_cleanup, "interval", minutes=CLEANUP_INTERVAL_MINUTES, id="auth_cleanup")
    return scheduler
