"""Send ONE test push notification to a registered user's phone, through the same sender the app's
real notices use. Run it on the server (or your computer, pointed at the same database):

    uv run python -m scripts.send_test_push someone@example.com

It prints only whether it worked -- "Sent." or the reason it did not -- and never a push token.
It reaches the database the same way every other script does (``app.database.session``) and does
not read ``.env`` itself. A tap on the notification opens the app's notification list.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import SessionFactory
from app.modules.auth.repository import get_user_by_email
from app.modules.notification import repository as notification_repo
from app.modules.notification import service as notification_service

NO_USER = "No account with that email."
NO_DEVICE = "That account has no phone registered for push yet. Sign in on the phone first."
SENT = "Sent."


async def send_to(db: AsyncSession, email: str) -> str:
    """The one line to show: ``SENT`` or why nothing was sent."""
    user = await get_user_by_email(db, email)
    if user is None:
        return NO_USER
    if not await notification_repo.list_active_tokens(db, user.id):
        return NO_DEVICE
    result = await notification_service.send_test_push(db, user)
    if result.error:
        return f"Could not reach the push service ({result.error})."
    if result.dead_tokens and not result.delivered:
        return "That phone is no longer registered (the app was removed). Sign in again on it."
    return SENT if result.delivered else "The push service did not accept the message."


async def send(email: str) -> str:
    async with SessionFactory() as db:
        return await send_to(db, email)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: uv run python -m scripts.send_test_push <email>")
        return 2
    line = asyncio.run(send(argv[1].strip().lower()))
    print(line)
    return 0 if line == SENT else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
