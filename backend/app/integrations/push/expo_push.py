"""Push delivery via the Expo Push Notification service.

The mobile app is a managed Expo project (no native android/ios folders),
so device tokens are Expo push tokens (``ExponentPushToken[...]``), not raw
FCM/APNs tokens — Expo's own push API fans those out to FCM/APNs for us, no
Firebase project or server key needed.

Dev has no tokens registered yet (nothing to send to) -> this just logs;
once a device registers, requests go out for real. The request runs in a
worker thread via ``asyncio.to_thread`` since it uses the stdlib ``urllib``
client, which is synchronous.

Expo answers each message with a "ticket": ``ok``, or an error. A ``DeviceNotRegistered`` error
means the app was uninstalled or the token expired -- ``send_push`` hands those tokens back so the
caller can stop using them. A token is never written to a log line.
"""

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any
from urllib.request import Request, urlopen

import structlog

log = structlog.get_logger()

EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"
MAX_PER_REQUEST = 100
# the Android notification channel the app creates (hooks/usePushRegistration.ts)
ANDROID_CHANNEL = "default"


@dataclass
class PushResult:
    """What came of one ``send_push``: how many devices Expo accepted, the tokens it said are
    gone for good, and the name of an error if the request itself failed (never a token)."""

    delivered: int = 0
    dead_tokens: list[str] = field(default_factory=list)
    error: str | None = None


def _post_sync(messages: list[dict[str, object]]) -> dict[str, Any]:
    request = Request(
        EXPO_PUSH_ENDPOINT,
        data=json.dumps(messages).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    # fixed https address (EXPO_PUSH_ENDPOINT), never one given by a user
    with urlopen(request, timeout=10) as response:  # nosec B310
        body = json.loads(response.read() or b"{}")
    return body if isinstance(body, dict) else {}


async def send_push(tokens: list[str], title: str, body: str, data: dict[str, str]) -> PushResult:
    """Send a push notification to one or more Expo push tokens. Best-effort:
    failures are logged, never raised, so a missing/expired token never
    blocks the notification flow."""
    valid = [t for t in tokens if t.startswith("ExponentPushToken")]
    if not valid:
        log.info("push_dev_delivery", devices=len(tokens), title=title)
        return PushResult()

    messages: list[dict[str, object]] = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "channelId": ANDROID_CHANNEL,
            "priority": "high",
        }
        for token in valid
    ]
    result = PushResult()
    # Expo takes at most 100 messages in one request
    for start in range(0, len(messages), MAX_PER_REQUEST):
        chunk = messages[start : start + MAX_PER_REQUEST]
        tokens_in_chunk = valid[start : start + MAX_PER_REQUEST]
        try:
            answer = await asyncio.to_thread(_post_sync, chunk)
        except (
            Exception
        ) as exc:  # noqa: BLE001 - any failure to reach Expo must not block the notice
            log.warning(
                "push_delivery_failed", devices=len(chunk), title=title, error=type(exc).__name__
            )
            result.error = type(exc).__name__
            continue
        tickets = answer.get("data")
        if not isinstance(tickets, list):
            continue
        # tickets come back in the order the messages were sent
        for token, ticket in zip(tokens_in_chunk, tickets, strict=False):
            if not isinstance(ticket, dict):
                continue
            if ticket.get("status") == "ok":
                result.delivered += 1
                continue
            details = ticket.get("details")
            if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
                result.dead_tokens.append(token)
    if result.dead_tokens:
        log.info("push_dead_tokens", devices=len(result.dead_tokens))
    return result
