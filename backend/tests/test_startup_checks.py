"""Start-up checks: outside development the app refuses an unsafe setup, names the problem and
never prints a value (a secret, a connection string)."""

import pytest

from app.core import config
from app.core.config import Settings

GOOD = {
    "ENVIRONMENT": "prod",
    "JWT_SECRET": "a" * 40,
    "JWT_REFRESH_SECRET": "b" * 40,
    "CODE_HASH_SECRET": "c" * 40,
    "DEBUG": "false",
    "PAYMENT_MODE": "auto",
    "CORS_ALLOWED_ORIGINS": "https://app.example.test",
    "ALLOWED_HOSTS": "api.example.test",
}
SECRET_DB = "postgresql+asyncpg://user:hunter2-db-password@localhost/arenahub"


def _load(monkeypatch: pytest.MonkeyPatch, **over: str) -> Settings:
    for key in list(GOOD) + ["TEST_DATABASE_URL"]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("DATABASE_URL", SECRET_DB)
    for key, value in {**GOOD, **over}.items():
        monkeypatch.setenv(key, value)
    return config.get_settings.__wrapped__()


def test_a_complete_production_setup_starts(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _load(monkeypatch).production_problems() == []


def test_development_needs_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(GOOD):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("DATABASE_URL", SECRET_DB)
    monkeypatch.setenv("ENVIRONMENT", "dev")
    assert config.get_settings.__wrapped__().production_problems() == []


@pytest.mark.parametrize(
    ("over", "expect"),
    [
        ({"JWT_SECRET": "change-me"}, "JWT_SECRET is missing or a known default"),
        ({"JWT_REFRESH_SECRET": "change-me-refresh"}, "JWT_REFRESH_SECRET is missing"),
        ({"JWT_SECRET": "short"}, "JWT_SECRET is shorter than 32 bytes"),
        ({"JWT_REFRESH_SECRET": "x" * 31}, "JWT_REFRESH_SECRET is shorter than 32 bytes"),
        ({"JWT_REFRESH_SECRET": "a" * 40}, "must differ"),
        ({"CODE_HASH_SECRET": "dev-only-code-hash-secret"}, "CODE_HASH_SECRET"),
        ({"CODE_HASH_SECRET": "tiny"}, "CODE_HASH_SECRET"),
        ({"DEBUG": "true"}, "DEBUG must be off"),
        ({"PAYMENT_MODE": "mock"}, "PAYMENT_MODE=mock"),
        ({"CORS_ALLOWED_ORIGINS": "*"}, "no wildcard"),
        ({"CORS_ALLOWED_ORIGINS": "https://*.example.test"}, "no wildcard"),
        ({"CORS_ALLOWED_ORIGINS": "http://app.example.test"}, "https://"),
        ({"ALLOWED_HOSTS": ""}, "ALLOWED_HOSTS"),
        ({"ALLOWED_HOSTS": "*"}, "ALLOWED_HOSTS"),
    ],
)
def test_each_unsafe_setting_stops_the_start(
    monkeypatch: pytest.MonkeyPatch, over: dict[str, str], expect: str
) -> None:
    with pytest.raises(RuntimeError) as err:
        _load(monkeypatch, **over)
    assert expect in str(err.value)


def test_the_message_never_shows_a_value(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(RuntimeError) as err:
        _load(monkeypatch, JWT_SECRET="change-me", CODE_HASH_SECRET="tiny-secret-value")
    text = str(err.value)
    assert "hunter2-db-password" not in text and "tiny-secret-value" not in text
    assert "change-me" not in text.replace("known default", "")


def test_secrets_do_not_print(monkeypatch: pytest.MonkeyPatch) -> None:
    s = _load(monkeypatch)
    shown = repr(s) + str(s.model_dump())
    for value in ("a" * 40, "b" * 40, "c" * 40):
        assert value not in shown
