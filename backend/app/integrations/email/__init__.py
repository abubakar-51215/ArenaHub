"""Email delivery integration."""

from app.integrations.email.smtp import send_email

__all__ = ["send_email"]
