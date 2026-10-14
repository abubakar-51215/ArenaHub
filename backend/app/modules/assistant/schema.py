"""The assistant's request: the words typed (300 characters at most) or a question chip's id."""

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    text: str | None = Field(default=None, max_length=300)
    suggestion: str | None = Field(default=None, max_length=40)
