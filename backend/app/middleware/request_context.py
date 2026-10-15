"""Gives every request an id and remembers the client address.

The id is answered in the ``X-Request-ID`` header and added to every log line of the request, so one
complaint ("it failed at 14:03") can be followed in the logs. An id sent by the caller is used only
when it looks like an id (letters, digits, dashes, 8 to 64 long); anything else is replaced.
"""

import re
import uuid

import structlog
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.request_context import client_ip_var, request_id_var
from app.middleware.rate_limit import _client_ip

_SAFE_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        sent = request.headers.get("x-request-id", "")
        request_id = sent if _SAFE_ID.match(sent) else uuid.uuid4().hex
        ip = _client_ip(request)
        id_token = request_id_var.set(request_id)
        ip_token = client_ip_var.set(ip)
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")
            request_id_var.reset(id_token)
            client_ip_var.reset(ip_token)
