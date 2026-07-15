"""Push delivery via the Expo Push Notification service.

The mobile app is a managed Expo project (no native android/ios folders),
so device tokens are Expo push tokens (``ExponentPushToken[...]``), not raw
FCM/APNs tokens — Expo's own push API fans those out to FCM/APNs for us, no
Firebase project or server key needed.

Dev has no tokens registered yet (nothing to send to) -> this just logs;
once a device registers, requests go out for real. The request runs in a
worker thread via ``asyncio.to_thread`` since it uses the stdlib ``urllib``
client, which is synchronous.
"""

import asyncio
import json
from urllib.error import URLError
from urllib.request import Request, urlopen

import structlog

log = structlog.get_logger()

EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"


def _post_sync(messages: list[dict[str, object]]) -> None:
    request = Request(
        EXPO_PUSH_ENDPOINT,
        data=json.dumps(messages).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        response.read()


async def send_push(tokens: list[str], title: str, body: str, data: dict[str, str]) -> None:
    """Send a push notification to one or more Expo push tokens. Best-effort:
    failures are logged, never raised, so a missing/expired token never
    blocks the notification flow."""
    valid = [t for t in tokens if t.startswith("ExponentPushToken")]
    if not valid:
        log.info("push_dev_delivery", tokens=tokens, title=title, body=body)
        return

    messages: list[dict[str, object]] = [
        {"to": token, "title": title, "body": body, "data": data} for token in valid
    ]
    try:
        await asyncio.to_thread(_post_sync, messages)
    except URLError:
        log.warning("push_delivery_failed", tokens=valid, title=title)
