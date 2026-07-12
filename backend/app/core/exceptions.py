"""Domain exception hierarchy.

Services raise these; a global handler in main.py maps them to the standard
API error envelope. Keeping HTTP status out of the service layer means
services stay transport-agnostic.
"""


class AppError(Exception):
    """Base class for all expected/handled application errors."""

    status_code: int = 400
    message: str = "An error occurred"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.message
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = 404
    message = "Resource not found"


class ConflictError(AppError):
    status_code = 409
    message = "Resource conflict"


class UnauthorizedError(AppError):
    status_code = 401
    message = "Authentication required"


class ForbiddenError(AppError):
    status_code = 403
    message = "You do not have permission to perform this action"


class ValidationError(AppError):
    status_code = 422
    message = "Validation failed"
