"""Base for every model that reads a request body.

* Unknown fields are refused (OWASP API3), so a client cannot slip in ``role``, ``is_admin``,
  ``price`` or any other field the route never meant to accept.
* Control characters are refused in every text (a NUL byte makes the database fail, and others
  corrupt logs and emails). A new line and a tab stay allowed (long texts have them).
  Passwords and tokens are not looked at here.
"""

import unicodedata
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core import messages

ShortName = Annotated[str, Field(min_length=1, max_length=50)]
_ALLOWED = {"\n", "\r", "\t"}
_SECRET_FIELDS = ("password", "token", "secret")


def has_control_characters(text: str) -> bool:
    return any(unicodedata.category(c) == "Cc" and c not in _ALLOWED for c in text)


def _clean(value: Any) -> None:
    if isinstance(value, str):
        if has_control_characters(value):
            raise ValueError(messages.BAD_CHARACTERS)
    elif isinstance(value, list | tuple):
        for item in value:
            _clean(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            _clean(key)
            _clean(item)


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def _no_control_characters(cls, value: Any, info: Any) -> Any:
        name = info.field_name or ""
        if name != "code" and not any(word in name for word in _SECRET_FIELDS):
            _clean(value)
        return value
