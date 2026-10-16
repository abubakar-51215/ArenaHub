"""Run the time-driven jobs once, as if some hours had passed (development only).

A booking waiting for payment is cancelled after 24 hours, a game is completed after it ends, the
24 hour and 1 hour reminders and the "rate your game" notice follow the clock. To see those states
on screen without waiting, run this after making the booking:

    uv run python scripts/run_sweeps.py --advance-hours 25

It only moves the clock the jobs use (nothing is created or seeded) and refuses to run unless
ENVIRONMENT is ``dev``. It prints the database NAME (never the address or password) and what
each job did.
"""

import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.engine import make_url  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.database.session import SessionFactory  # noqa: E402
from app.modules.booking import service as booking_service  # noqa: E402
from app.modules.payment import service as payment_service  # noqa: E402


async def main(hours: float) -> int:
    settings = get_settings()
    if not settings.is_dev:
        print("Refused: this runs only when ENVIRONMENT is dev.")
        return 2
    print(f"database: {make_url(settings.database_url).database}; clock moved forward {hours} h")
    now = datetime.now() + timedelta(hours=hours)
    async with SessionFactory() as db:
        cancelled = await booking_service.auto_cancel_stale_bookings(db, now)
        print("cancelled (not paid in 24 h):", cancelled)
    async with SessionFactory() as db:
        print("completed (game over):", await booking_service.complete_finished_bookings(db, now))
    async with SessionFactory() as db:
        print("reminders sent:", await booking_service.send_upcoming_reminders(db, now))
    async with SessionFactory() as db:
        print("rate-your-game notices sent:", await booking_service.send_rate_prompts(db, now))
    async with SessionFactory() as db:
        print("refunds retried:", await payment_service.retry_pending_refunds(db))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--advance-hours", type=float, default=0.0)
    sys.exit(asyncio.run(main(ap.parse_args().advance_hours)))
