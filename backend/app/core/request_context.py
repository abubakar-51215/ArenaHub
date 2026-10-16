"""Who is asking, for the audit log and the logs: the request id and the client address of the
request being handled (set by ``RequestContextMiddleware``, empty outside a request)."""

from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
client_ip_var: ContextVar[str] = ContextVar("client_ip", default="")


def current_request_id() -> str:
    return request_id_var.get()


def current_client_ip() -> str:
    return client_ip_var.get()
