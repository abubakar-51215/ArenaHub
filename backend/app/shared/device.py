"""A short, friendly description of the browser or app that sent a request, from its
User-Agent header — e.g. "Chrome on Windows", "Safari on iPhone", "Android app".

Used only to show a "Device" line in the login-alert email (``docs/SECURITY.md``). Never stored on
a row and never logged: the caller reads it once, at sign-in time, and only the finished sentence
is handed to the email builder. An empty, missing, or unrecognised value gives "Not available".
"""

NOT_AVAILABLE = "Not available"

# Checked in order; a browser UA often carries more than one marker (Chrome's UA also contains
# "Safari/"), so the more specific engines are listed first.
_BROWSERS: list[tuple[str, str]] = [
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("Chrome/", "Chrome"),
    ("CriOS/", "Chrome"),
    ("Firefox/", "Firefox"),
    ("FxiOS/", "Firefox"),
    ("Safari/", "Safari"),
]

_OS: list[tuple[str, str]] = [
    ("Windows", "Windows"),
    ("Android", "Android"),
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Mac OS X", "Mac"),
    ("Linux", "Linux"),
]


def describe_device(user_agent: str | None) -> str:
    """ "Chrome on Windows"-style summary of a User-Agent header, or "Not available"."""
    if not user_agent or not user_agent.strip():
        return NOT_AVAILABLE
    ua = user_agent
    # The phone app's default User-Agent (React Native / Expo) names the native network stack,
    # not a browser: Dalvik/OkHttp on Android, CFNetwork on iOS. Named directly rather than
    # mis-reading "CFNetwork" as a browser.
    if "Dalvik" in ua or "okhttp" in ua:
        return "ArenaHub Android app"
    if "CFNetwork" in ua and "Darwin" in ua:
        return "ArenaHub iPhone app"

    browser = next((name for marker, name in _BROWSERS if marker in ua), None)
    osname = next((name for marker, name in _OS if marker in ua), None)
    if browser and osname:
        return f"{browser} on {osname}"
    if browser:
        return browser
    if osname:
        return osname
    return NOT_AVAILABLE
