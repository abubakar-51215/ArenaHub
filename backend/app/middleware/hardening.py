"""Response headers, request size and request time limits (OWASP API4, ASVS 14).

Pure ASGI so streaming and uploads are not buffered. Three small middlewares:

* ``SecurityHeadersMiddleware`` adds the protective headers to every answer.
* ``BodyLimitMiddleware`` refuses a request body above a size cap (the header is checked first and
  the bytes are counted as they arrive, so a lying or chunked request is stopped too).
* ``TimeLimitMiddleware`` ends a request that runs longer than its time limit.
"""

import asyncio
import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core import messages
from app.core.config import get_settings

UPLOAD_PATH = "/api/v1/uploads/image"
JSON_BODY_LIMIT = 1 * 1024 * 1024  # 1 MB: the biggest JSON body any screen sends is a few KB
UPLOAD_BODY_LIMIT = 6 * 1024 * 1024  # a 5 MB picture plus the multipart wrapper
REQUEST_SECONDS = 30
UPLOAD_SECONDS = 90

_API = "/api/"
_UPLOADS_PREFIX_DEFAULT = "/uploads"


def _error_body(text: str) -> bytes:
    return json.dumps({"success": False, "message": text, "data": None, "errors": None}).encode()


async def _reply(send: Send, status: int, text: str) -> None:
    body = _error_body(text)
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"x-content-type-options", b"nosniff"),
                (b"cache-control", b"no-store"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.production = not get_settings().is_dev
        self.media_prefix = get_settings().media_url_prefix or _UPLOADS_PREFIX_DEFAULT

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {k.lower() for k, _ in headers}

                def add(name: bytes, value: bytes) -> None:
                    if name not in present:
                        headers.append((name, value))

                add(b"x-content-type-options", b"nosniff")
                add(b"referrer-policy", b"no-referrer")
                add(b"x-frame-options", b"DENY")
                if path.startswith(_API):
                    # answers about accounts, bookings and payments must never sit in a cache
                    add(b"cache-control", b"no-store")
                if path.startswith(self.media_prefix + "/"):
                    # a stored picture can only be shown as a picture, never run as a page
                    add(b"content-security-policy", b"default-src 'none'; sandbox")
                    add(b"content-disposition", b"inline")
                    add(b"cross-origin-resource-policy", b"cross-origin")
                if self.production:
                    add(b"strict-transport-security", b"max-age=31536000; includeSubDomains")
            await send(message)

        await self.app(scope, receive, send_with_headers)


class _TooLargeError(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = UPLOAD_BODY_LIMIT if scope["path"] == UPLOAD_PATH else JSON_BODY_LIMIT
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > limit
            except ValueError:
                too_big = True
            if too_big:
                await _reply(send, 413, messages.REQUEST_TOO_LARGE)
                return

        seen = 0
        started = False

        async def counted_receive() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    raise _TooLargeError
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counted_receive, tracking_send)
        except _TooLargeError:
            if not started:
                await _reply(send, 413, messages.REQUEST_TOO_LARGE)


class TimeLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        seconds = UPLOAD_SECONDS if scope["path"] == UPLOAD_PATH else REQUEST_SECONDS
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            async with asyncio.timeout(seconds) as limit:
                await self.app(scope, receive, tracking_send)
        except TimeoutError:
            if not limit.expired():
                raise  # a timeout from somewhere inside, not this limit
            if not started:
                await _reply(send, 504, messages.REQUEST_TOO_SLOW)
