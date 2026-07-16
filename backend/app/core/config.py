"""Application configuration loaded from environment / .env.

All secrets and connection strings come from the environment so the app is
container-ready without code changes (see docs/PROJECT_GUIDELINES.md deviation #1).
"""

from enum import StrEnum
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_JWT_DEFAULTS = {"change-me", "change-me-refresh"}


class Environment(StrEnum):
    dev = "dev"
    staging = "staging"
    prod = "prod"


class PaymentMode(StrEnum):
    """Which payment provider implementation backs the gateway methods
    (card/JazzCash/EasyPaisa). ``mock`` forces the deterministic MockProvider
    regardless of configured gateway credentials — useful for local dev and
    tests where no real charge should ever be attempted. ``auto`` uses the
    real provider classes (which themselves fall back to a dev simulation
    when their own credentials are unset). ``bank_transfer`` is always manual
    and unaffected by this setting."""

    auto = "auto"
    mock = "mock"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core
    environment: Environment = Field(default=Environment.dev, alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Datastores
    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Auth / JWT (used from Sprint 2 onward). No insecure default in
    # non-dev environments — see the validator below.
    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_refresh_secret: str = Field(default="change-me-refresh", alias="JWT_REFRESH_SECRET")

    # Comma-separated list of allowed origins for CORS in staging/prod (e.g.
    # "https://app.arenahub.pk,https://admin.arenahub.pk"). Dev ignores this
    # and uses an explicit localhost allowlist instead (see main.py).
    cors_allowed_origins: str = Field(default="", alias="CORS_ALLOWED_ORIGINS")

    # Webhook signing secrets — JazzCash/EasyPaisa callbacks must be verified
    # via HMAC-SHA256 over the raw body before being trusted (see
    # app/integrations/payments/*). No default: an unset secret means the
    # webhook is rejected outright rather than silently trusting the payload.
    jazzcash_webhook_secret: str | None = Field(default=None, alias="JAZZCASH_WEBHOOK_SECRET")
    easypaisa_webhook_secret: str | None = Field(default=None, alias="EASYPAISA_WEBHOOK_SECRET")

    # Media / image uploads. In dev, images are stored on the local filesystem
    # under media_root (gitignored) and served from media_url_prefix; prod uses
    # Cloudinary.
    media_root: str = Field(default="uploads", alias="MEDIA_ROOT")
    media_url_prefix: str = Field(default="/uploads", alias="MEDIA_URL_PREFIX")

    # Integrations (populated as modules land)
    cloudinary_url: str | None = Field(default=None, alias="CLOUDINARY_URL")
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")
    jazzcash_merchant_id: str | None = Field(default=None, alias="JAZZCASH_MERCHANT_ID")
    jazzcash_password: str | None = Field(default=None, alias="JAZZCASH_PASSWORD")
    easypaisa_merchant_id: str | None = Field(default=None, alias="EASYPAISA_MERCHANT_ID")

    # Which provider backs the gateway payment methods — see PaymentMode.
    payment_mode: PaymentMode = Field(default=PaymentMode.auto, alias="PAYMENT_MODE")

    # Email (OTP + notification delivery). Unset in dev -> console log instead
    # of a real SMTP connection (same seam as deliver_otp).
    email_host: str | None = Field(default=None, alias="EMAIL_HOST")
    email_port: int = Field(default=587, alias="EMAIL_PORT")
    email_username: str | None = Field(default=None, alias="EMAIL_USERNAME")
    email_password: str | None = Field(default=None, alias="EMAIL_PASSWORD")
    email_from: str = Field(default="ArenaHub <no-reply@arenahub.local>", alias="EMAIL_FROM")
    # Dev normally never opens an SMTP connection even with credentials set
    # (so pytest runs can't fire real emails). Flip this on to test real
    # inbox delivery from a dev machine; prod ignores it and always sends.
    email_send_in_dev: bool = Field(default=False, alias="EMAIL_SEND_IN_DEV")

    @property
    def is_dev(self) -> bool:
        return self.environment == Environment.dev

    @model_validator(mode="after")
    def _reject_insecure_jwt_secrets_outside_dev(self) -> "Settings":
        if self.environment != Environment.dev and (
            self.jwt_secret in _INSECURE_JWT_DEFAULTS
            or self.jwt_refresh_secret in _INSECURE_JWT_DEFAULTS
        ):
            raise ValueError(
                "JWT_SECRET / JWT_REFRESH_SECRET must be set to non-default values "
                f"when ENVIRONMENT={self.environment.value}."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton. Import and call where config is needed."""
    return Settings()  # values are read from env / .env, not passed in
