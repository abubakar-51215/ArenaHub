"""Application configuration loaded from environment / .env.

All secrets and connection strings come from the environment so the app is
container-ready without code changes (see docs/PROJECT_GUIDELINES.md deviation #1).
"""

from enum import StrEnum
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    dev = "dev"
    staging = "staging"
    prod = "prod"


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

    # Auth / JWT (used from Sprint 2 onward)
    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_refresh_secret: str = Field(default="change-me-refresh", alias="JWT_REFRESH_SECRET")

    # Integrations (populated as modules land)
    cloudinary_url: str | None = Field(default=None, alias="CLOUDINARY_URL")
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")

    @property
    def is_dev(self) -> bool:
        return self.environment == Environment.dev


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton. Import and call where config is needed."""
    return Settings()  # values are read from env / .env, not passed in
