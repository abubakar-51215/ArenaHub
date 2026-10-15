"""Base for every model that reads a request body: unknown fields are refused (OWASP API3), so a
client cannot slip in ``role``, ``is_admin``, ``price`` or any other field the route never meant to
accept."""

from pydantic import BaseModel, ConfigDict


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
