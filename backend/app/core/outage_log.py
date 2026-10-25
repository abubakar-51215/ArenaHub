"""Log an outage once when it starts and once when it ends, not once per request.

Used where a failing dependency (Redis) is retried on every request: the first failure
is a warning, the failures after it are silent, and the first success afterwards logs
that it came back. Per process, like the state it describes.
"""

import structlog


class OutageLog:
    def __init__(self, name: str) -> None:
        self._name = name
        self._down = False
        self._log = structlog.get_logger()

    @property
    def down(self) -> bool:
        return self._down

    def failed(self, error: object) -> None:
        if not self._down:
            self._down = True
            self._log.warning(f"{self._name}_unavailable", error=str(error) or type(error).__name__)

    def ok(self) -> None:
        if self._down:
            self._down = False
            self._log.info(f"{self._name}_recovered")
