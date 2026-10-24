"""A test must never be able to reach a real service: conftest.py tells Settings to never read
backend/.env during a test run (``Settings.model_config["env_file"] = None``, set before anything
else is imported) and clears the real-service variables from the environment, so only an explicit
``monkeypatch.setenv``/``setattr`` in an individual test — never a developer's own .env file — can
put a real value in. This test is the trip-wire: it fails the moment that stops being true, for
whichever setting broke it."""

from app.core.config import Settings, get_settings


def test_env_file_reading_is_disabled_for_settings() -> None:
    assert Settings.model_config.get("env_file") is None


def test_no_real_service_setting_leaked_into_this_test_run() -> None:
    settings = get_settings()
    assert not settings.email_host, "EMAIL_HOST must be unset in a test run"
    assert not settings.email_username, "EMAIL_USERNAME must be unset in a test run"
    assert not settings.email_password, "EMAIL_PASSWORD must be unset in a test run"
    assert settings.email_send_in_dev is False, "EMAIL_SEND_IN_DEV must be off in a test run"
    assert not settings.stripe_secret_key, "STRIPE_SECRET_KEY must be unset in a test run"
    assert not settings.stripe_webhook_secret, "STRIPE_WEBHOOK_SECRET must be unset in a test run"
    assert (
        settings.card_provider.value == "stripe"
    ), "CARD_PROVIDER must be the default in a test run"
    assert not settings.safepay_api_key, "SAFEPAY_API_KEY must be unset in a test run"
    assert not settings.safepay_secret_key, "SAFEPAY_SECRET_KEY must be unset in a test run"
    assert not settings.safepay_webhook_secret, "SAFEPAY_WEBHOOK_SECRET must be unset in a test run"
    assert settings.safepay_checkout_enabled is False, "SafePay checkout must be off in a test run"
    assert not settings.cloudinary_url, "CLOUDINARY_URL must be unset in a test run"
    assert not settings.sentry_dsn, "SENTRY_DSN must be unset in a test run"
    assert not settings.google_client_ids_raw, "GOOGLE_CLIENT_IDS must be unset in a test run"
    assert settings.is_dev, "ENVIRONMENT must be dev in a test run"
