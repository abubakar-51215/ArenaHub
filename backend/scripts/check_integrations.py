"""Which outside services are set up, in one line each: ``NAME: SET`` or ``NAME: MISSING``.

    uv run python -m scripts.check_integrations

It prints nothing else: never a value, never a length, never a part of a value. It looks at the
settings only through ``get_settings()`` (the app's own loader) and does not open ``.env`` itself.
A key that is only a placeholder (a Stripe key that is not a real-looking ``sk_...``) counts as
MISSING; the support address counts as MISSING while it is still the temporary built-in one.
"""

import sys
from typing import Any

from app.core.config import Settings, get_settings

_DEFAULT_SUPPORT_EMAIL = Settings.model_fields["support_email"].default


def _set(value: object) -> bool:
    return bool(str(value or "").strip())


def report(settings: Any) -> list[str]:
    """The lines to print, in a fixed order."""
    checks: list[tuple[str, bool]] = [
        ("GOOGLE_CLIENT_IDS", bool(settings.google_client_ids)),
        ("CLOUDINARY_URL", _set(settings.cloudinary_url)),
        ("SENTRY_DSN", _set(settings.sentry_dsn)),
        ("STRIPE_SECRET_KEY", bool(settings.stripe_configured)),
        ("STRIPE_WEBHOOK_SECRET", _set(settings.stripe_webhook_secret)),
        ("SMTP_USER (EMAIL_USERNAME)", _set(settings.email_username)),
        ("SMTP_PASSWORD (EMAIL_PASSWORD)", _set(settings.email_password)),
        (
            "SUPPORT_EMAIL",
            _set(settings.support_email) and settings.support_email != _DEFAULT_SUPPORT_EMAIL,
        ),
        (
            "JAZZCASH (merchant id, password, webhook secret)",
            all(
                _set(v)
                for v in (
                    settings.jazzcash_merchant_id,
                    settings.jazzcash_password,
                    settings.jazzcash_webhook_secret,
                )
            ),
        ),
        (
            "EASYPAISA (merchant id, webhook secret)",
            all(
                _set(v) for v in (settings.easypaisa_merchant_id, settings.easypaisa_webhook_secret)
            ),
        ),
    ]
    return [f"{name}: {'SET' if ok else 'MISSING'}" for name, ok in checks]


def main() -> int:
    for line in report(get_settings()):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
