"""describe_device: a short "Chrome on Windows"-style summary of a User-Agent header, used only
in the login-alert email — never stored, never logged. Unrecognised or missing input gives
"Not available"."""

import pytest

from app.shared.device import NOT_AVAILABLE, describe_device

CHROME_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"
EDGE_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
)
ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
)
ANDROID_APP_DALVIK = "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 7 Build/UD1A.230803.022)"
ANDROID_APP_OKHTTP = "okhttp/4.12.0"
IOS_APP = "ArenaHub/1 CFNetwork/1410.0.3 Darwin/22.6.0"


@pytest.mark.parametrize(
    ("ua", "expected"),
    [
        (CHROME_WINDOWS, "Chrome on Windows"),
        (SAFARI_IPHONE, "Safari on iPhone"),
        (FIREFOX_LINUX, "Firefox on Linux"),
        (EDGE_WINDOWS, "Edge on Windows"),
        (ANDROID_CHROME, "Chrome on Android"),
        (ANDROID_APP_DALVIK, "ArenaHub Android app"),
        (ANDROID_APP_OKHTTP, "ArenaHub Android app"),
        (IOS_APP, "ArenaHub iPhone app"),
    ],
)
def test_recognised_user_agents(ua: str, expected: str) -> None:
    assert describe_device(ua) == expected


@pytest.mark.parametrize("ua", [None, "", "   ", "python-httpx/0.27.0", "curl/8.4.0"])
def test_unrecognised_or_missing_falls_back_to_not_available(ua: str | None) -> None:
    assert describe_device(ua) == NOT_AVAILABLE


def test_not_available_is_the_exact_wording_from_the_task() -> None:
    assert NOT_AVAILABLE == "Not available"
