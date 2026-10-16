"""Application configuration loaded from environment / .env.

All secrets and connection strings come from the environment so the app is
container-ready without code changes (see docs/PROJECT_GUIDELINES.md deviation #1).
"""

from enum import StrEnum
from functools import lru_cache
from ipaddress import IPv4Network, IPv6Network, ip_network

from pydantic import Field, SecretStr, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values that must never sign anything outside development.
_INSECURE_JWT_DEFAULTS = {
    "change-me",
    "change-me-refresh",
    "secret",
    "changeme",
    "dev-secret",
    "jwt-secret",
    "your-secret-key",
}
_DEV_CODE_HASH_SECRET = "dev-only-code-hash-secret"
MIN_SECRET_BYTES = 32


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
        # an empty value (as in .env.example) means "use the default"; outside development the
        # start-up checks below still refuse a default secret
        env_ignore_empty=True,
        # a failed start-up check must never print the values it read (connection strings, secrets)
        hide_input_in_errors=True,
    )

    # Core
    environment: Environment = Field(default=Environment.dev, alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Datastores
    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Auth / JWT (used from Sprint 2 onward). No insecure default in
    # non-dev environments — see the validator below.
    # SecretStr: printing or logging the settings shows ********, never the value.
    jwt_secret: SecretStr = Field(default=SecretStr("change-me"), alias="JWT_SECRET")
    jwt_refresh_secret: SecretStr = Field(
        default=SecretStr("change-me-refresh"), alias="JWT_REFRESH_SECRET"
    )
    # Must be False outside development (checked at start-up).
    debug: bool = Field(default=False, alias="DEBUG")

    # Comma-separated list of allowed origins for CORS in staging/prod (e.g.
    # "https://app.arenahub.pk,https://admin.arenahub.pk"). Dev ignores this
    # and uses an explicit localhost allowlist instead (see main.py).
    cors_allowed_origins: str = Field(default="", alias="CORS_ALLOWED_ORIGINS")
    # Per-minute request budgets for the rate limiter. Defaults are unchanged;
    # a local .env can raise them so manual testing is not throttled.
    rate_limit_auth_per_minute: int = Field(default=20, alias="RATE_LIMIT_AUTH_PER_MINUTE")
    rate_limit_api_per_minute: int = Field(default=100, alias="RATE_LIMIT_API_PER_MINUTE")
    # Proxies / load balancers allowed to tell us the real client address in
    # X-Forwarded-For: comma-separated addresses or ranges ("10.0.0.5,10.1.0.0/16").
    # Empty (the default): the header is ignored and the connection address is
    # used, so nobody can pick their own rate-limit bucket by sending the header.
    trusted_proxies: str = Field(default="", alias="TRUSTED_PROXIES")
    # Continue with Google (players on the phone): the OAuth client ids a Google ID token may be
    # issued for, comma-separated. Empty (the default) = Google sign-in is off.
    google_client_ids_raw: str = Field(default="", alias="GOOGLE_CLIENT_IDS")

    @property
    def google_client_ids(self) -> list[str]:
        return [c.strip() for c in self.google_client_ids_raw.split(",") if c.strip()]

    @property
    def trusted_proxy_networks(self) -> list[IPv4Network | IPv6Network]:
        """``trusted_proxies`` parsed; an entry that is not an address or range is skipped."""
        networks: list[IPv4Network | IPv6Network] = []
        for raw in self.trusted_proxies.split(","):
            entry = raw.strip()
            if not entry:
                continue
            try:
                networks.append(ip_network(entry, strict=False))
            except ValueError:
                continue
        return networks

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

    # Error tracking (Sentry). Empty = off: no SDK init, no network call.
    # See app/core/observability.py for the scrubber.
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN")

    @property
    def stripe_configured(self) -> bool:
        """True only for a real-looking secret key. An empty value or a
        placeholder such as ``sk_test_xxx`` counts as "no key", so card
        payments say so instead of calling Stripe and failing."""
        key = (self.stripe_secret_key or "").strip().lower()
        if not key.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_")):
            return False
        tail = key.split("_", 2)[2]
        return len(tail) >= 16 and "xxx" not in tail and "placeholder" not in tail

    # Public address of the web app. Email templates load the logo badge from
    # {web_public_url}/brand/email-badge@2x.png, so it must be reachable from a mail client.
    web_public_url: str = Field(default="http://localhost:3000", alias="WEB_PUBLIC_URL")
    # Where this API is reached from outside (the card page sends the player back through it).
    api_public_url: str = Field(default="http://localhost:8000", alias="API_PUBLIC_URL")

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
    # Key for the HMAC-SHA256 of every emailed code: the database keeps only the hash.
    # Must be a long random value outside dev (checked below); changing it voids codes in flight.
    code_hash_secret: SecretStr = Field(
        default=SecretStr(_DEV_CODE_HASH_SECRET), alias="CODE_HASH_SECRET"
    )
    # The support address named in the login-alert email (and nowhere else). Temporary,
    # chosen by the owner; see docs/BEFORE_GOING_LIVE.md.
    support_email: str = Field(default="support.arenahub@gmail.com", alias="SUPPORT_EMAIL")
    # Emergency off switch for the player login-alert email (owners always get theirs). ON by
    # default; set to 0/false only to stop player alerts in a hurry.
    player_login_alert_enabled: bool = Field(default=True, alias="PLAYER_LOGIN_ALERT_ENABLED")
    # Production host names the API answers to, comma-separated ("api.example.com"); never "*".
    allowed_hosts: str = Field(default="", alias="ALLOWED_HOSTS")

    @property
    def is_dev(self) -> bool:
        return self.environment == Environment.dev

    def production_problems(self) -> list[str]:
        """What is wrong with this configuration for a real deployment (empty when nothing).

        Only names are reported, never values. Outside development every problem stops the start.
        """
        if self.environment == Environment.dev:
            return []
        problems: list[str] = []
        access = self.jwt_secret.get_secret_value()
        refresh = self.jwt_refresh_secret.get_secret_value()
        for name, value in (("JWT_SECRET", access), ("JWT_REFRESH_SECRET", refresh)):
            if not value or value in _INSECURE_JWT_DEFAULTS:
                problems.append(f"{name} is missing or a known default")
            elif len(value.encode()) < MIN_SECRET_BYTES:
                problems.append(f"{name} is shorter than {MIN_SECRET_BYTES} bytes")
        if access == refresh:
            problems.append("JWT_SECRET and JWT_REFRESH_SECRET must differ")
        code = self.code_hash_secret.get_secret_value()
        if code == _DEV_CODE_HASH_SECRET or len(code.encode()) < MIN_SECRET_BYTES:
            problems.append(f"CODE_HASH_SECRET is missing or shorter than {MIN_SECRET_BYTES} bytes")
        if self.debug:
            problems.append("DEBUG must be off")
        if self.payment_mode == PaymentMode.mock:
            problems.append("PAYMENT_MODE=mock is for development and tests only")
        if not self.cloudinary_url:
            # Without it, uploads fall back to this server's own disk, which most
            # hosts wipe on restart (see docs/BEFORE_GOING_LIVE.md).
            problems.append("CLOUDINARY_URL is required outside development (image storage)")
        for origin in (o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()):
            if "*" in origin:
                problems.append("CORS_ALLOWED_ORIGINS must list exact origins, no wildcard")
                break
        if self.environment == Environment.prod:
            hosts = [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]
            if not hosts or any("*" in h for h in hosts):
                problems.append("ALLOWED_HOSTS must list the exact host names (no wildcard)")
            insecure = [
                o
                for o in (x.strip() for x in self.cors_allowed_origins.split(",") if x.strip())
                if not o.startswith("https://")
            ]
            if insecure:
                problems.append("CORS_ALLOWED_ORIGINS must all be https:// in production")
        return problems

    @model_validator(mode="after")
    def _refuse_an_unsafe_production_setup(self) -> "Settings":
        problems = self.production_problems()
        if problems:
            raise ValueError(
                f"Unsafe configuration for ENVIRONMENT={self.environment.value}: "
                + "; ".join(problems)
                + "."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton. Import and call where config is needed.

    A configuration that fails its checks stops the start with a short message that names the
    problem and never shows a value.
    """
    try:
        return Settings()  # values are read from env / .env, not passed in
    except ValidationError as exc:
        reasons = "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'settings'}: {e['msg']}" for e in exc.errors()
        )
        raise RuntimeError(f"Invalid configuration: {reasons}") from None
