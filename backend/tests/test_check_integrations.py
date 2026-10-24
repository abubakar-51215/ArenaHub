"""scripts/check_integrations.py prints SET or MISSING per integration and never a value."""

import hashlib
import inspect
import re
from types import SimpleNamespace

import pytest

from scripts import check_integrations
from scripts.check_integrations import report

# distinctive values (random-looking, so no dictionary word of a label can match): if any of these,
# or a recognisable slice of one, shows up in the output, the script has leaked something
_NAMES = (
    "cloudinary", "sentry", "stripe", "stripe_hook", "user", "password", "support",
    "jc_id", "jc_pass", "jc_hook", "ep_id", "ep_hook", "google",
)  # fmt: skip
SECRETS = {name: hashlib.sha256(name.encode()).hexdigest()[:30] for name in _NAMES}


def _settings(**over: object) -> SimpleNamespace:
    base: dict[str, object] = {
        "google_client_ids": [SECRETS["google"]],
        "cloudinary_url": SECRETS["cloudinary"],
        "sentry_dsn": SECRETS["sentry"],
        "stripe_configured": True,
        "stripe_secret_key": SECRETS["stripe"],
        "stripe_webhook_secret": SECRETS["stripe_hook"],
        "safepay_configured": True,
        "email_username": SECRETS["user"],
        "email_password": SECRETS["password"],
        "support_email": SECRETS["support"],
        "jazzcash_merchant_id": SECRETS["jc_id"],
        "jazzcash_password": SECRETS["jc_pass"],
        "jazzcash_webhook_secret": SECRETS["jc_hook"],
        "easypaisa_merchant_id": SECRETS["ep_id"],
        "easypaisa_webhook_secret": SECRETS["ep_hook"],
    }
    base.update(over)
    return SimpleNamespace(**base)


def test_every_line_is_a_name_and_set_or_missing_and_nothing_else() -> None:
    lines = report(_settings())
    assert len(lines) == 11
    for line in lines:
        assert re.fullmatch(r"[A-Z_ ()a-z,]+: (SET|MISSING)", line), line
    assert all(line.endswith(": SET") for line in lines)


def test_no_value_or_slice_of_a_value_is_ever_printed(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(check_integrations, "get_settings", lambda: _settings())
    assert check_integrations.main() == 0
    printed = capsys.readouterr().out
    for value in SECRETS.values():
        assert value not in printed
        # no recognisable piece of it either (every run of 6+ characters)
        for start in range(0, len(value) - 5):
            assert value[start : start + 6] not in printed, (value, start)
    assert not re.search(
        r"\d", printed.replace("SMTP", "")
    ), "no number (such as a length) is printed"


def test_missing_and_placeholder_values_say_missing() -> None:
    lines = dict(
        line.split(": ")
        for line in report(
            _settings(
                google_client_ids=[],
                cloudinary_url=None,
                sentry_dsn="",
                stripe_configured=False,  # a placeholder key is not a key
                stripe_webhook_secret=None,
                safepay_configured=False,
                email_username=None,
                email_password=None,
                support_email=check_integrations._DEFAULT_SUPPORT_EMAIL,
                jazzcash_password=None,  # one part missing = not set up
                easypaisa_webhook_secret=" ",
            )
        )
    )
    assert set(lines.values()) == {"MISSING"}


def test_the_script_reads_settings_only_through_get_settings() -> None:
    source = inspect.getsource(check_integrations)
    for forbidden in ("os.environ", "getenv", "dotenv", "open(", '.env")', "read_text"):
        assert forbidden not in source, forbidden
    assert "get_settings" in source
