"""Send one test email with the real settings, to check that mail really goes out.

    uv run python scripts/send_test_email.py someone@example.com

It refuses when sending is not set up (EMAIL_HOST / EMAIL_PASSWORD missing, or dev without
EMAIL_SEND_IN_DEV=1) and says why. It waits at most 8 seconds for the server. It prints the
outcome and, on a failure, the reason and a hint; never the recipient, the username or the
password.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.integrations.email.smtp import EmailSendError, email_mode, send_email  # noqa: E402


async def main(recipient: str) -> int:
    mode = email_mode()
    if mode["mode"] != "smtp":
        print(f"Refused: email sending is not set up ({mode['reason']}).")
        return 2
    print(f"Sending a test email through {mode['host']}:{mode['port']} ...")
    try:
        await send_email(
            recipient,
            "ArenaHub test email",
            "This is a test email from ArenaHub. If you can read it, sending works.",
            timeout=8,
            kind="test",
        )
    except EmailSendError as err:
        print(f"Not sent: {err.reason}. {err.hint}")
        return 1
    print("Sent. Check the inbox (and the spam folder).")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        print("Usage: python scripts/send_test_email.py <recipient email>")
        sys.exit(64)
    sys.exit(asyncio.run(main(sys.argv[1])))
