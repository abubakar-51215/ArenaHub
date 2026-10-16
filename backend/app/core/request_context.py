"""Who is asking, for the audit log and the logs: the request id and the client address of the
request being handled (set by ``RequestContextMiddleware``, empty outside a request).

``user_agent_var`` is read once by the login-alert email (``app/shared/device.py`` turns it into
"Chrome on Windows"); it is never written to a database row or a log line."""

from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
client_ip_var: ContextVar[str] = ContextVar("client_ip", default="")
user_agent_var: ContextVar[str] = ContextVar("user_agent", default="")


def current_request_id() -> str:
    return request_id_var.get()


def current_client_ip() -> str:
    return client_ip_var.get()


def current_user_agent() -> str:
    return user_agent_var.get()
