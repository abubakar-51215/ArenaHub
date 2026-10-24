"""Find why Continue with Google fails. Diagnosis only; prints no id or secret.

    uv run python -m scripts.diagnose_google
    uv run python -m scripts.diagnose_google --token-file path/to/idtoken.txt   (optional)

Checks the server side of the sign-in, one line each (PASS / FAIL / INFO):
  B1a  GOOGLE_CLIENT_IDS set, how many, and whether each looks like a client id
       (OK or BAD, never printed)
  B1b  the phone app's web client id (frontend/mobile/.env, public) is one of the server's ids
       (MATCH or NO MATCH only; the phone asks Google with the web id, so that id is
       the token's audience)
  B1c  how the server verifies the token (library, audience, issuer, email-verified)
  B1d  the server can reach Google's public keys (the server needs them for every sign-in)
  B1e  (only with --token-file) the exact reason the server's check gives for that token, with every
       client id in the message replaced by <id>. The file is read and never printed or stored.
"""

import argparse
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.oauth2 import id_token as google_id_token  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.integrations.google import _ISSUERS, _TIMEOUT_S, _Request  # noqa: E402

CLIENT_ID = re.compile(r"^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$")
MOBILE_ENV = Path(__file__).resolve().parents[2] / "frontend" / "mobile" / ".env"
KEYS_URL = "https://www.googleapis.com/oauth2/v1/certs"


def line(tag: str, status: str, text: str) -> None:
    print(f"[{status}] {tag}: {text}")


def phone_web_client_id() -> str | None:
    """The public web client id the phone is built with (only this one key is looked at)."""
    try:
        for raw in MOBILE_ENV.read_text(encoding="utf-8").splitlines():
            if raw.startswith("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="):
                return raw.partition("=")[2].strip() or None
    except OSError:
        return None
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--token-file", help="a Google ID token in a text file (never printed)")
    args = parser.parse_args()
    ids = get_settings().google_client_ids
    bad = 0

    if not ids:
        line("B1a GOOGLE_CLIENT_IDS", "FAIL", "MISSING: the server answers 503 'not available yet'")
        bad += 1
    else:
        line("B1a GOOGLE_CLIENT_IDS", "PASS", f"SET, count={len(ids)}")
        for i, one in enumerate(ids, 1):
            ok = bool(CLIENT_ID.match(one))
            line(
                f"B1a id #{i}",
                "PASS" if ok else "FAIL",
                "OK" if ok else "BAD (not <number>-<text>.apps.googleusercontent.com)",
            )
            bad += 0 if ok else 1

    phone_id = phone_web_client_id()
    if phone_id is None:
        line(
            "B1b phone vs server",
            "FAIL",
            "the phone has no web client id set (the button says 'not available yet')",
        )
        bad += 1
    elif phone_id in ids:
        line(
            "B1b phone vs server",
            "PASS",
            "MATCH: the phone's web client id is one the server accepts",
        )
    else:
        line(
            "B1b phone vs server",
            "FAIL",
            "NO MATCH: the server would refuse the phone's token (wrong audience)",
        )
        bad += 1

    line(
        "B1c how the server checks",
        "INFO",
        "google-auth verify_oauth2_token: signature against Google's keys, expiry, audience in "
        f"GOOGLE_CLIENT_IDS (any of them), then issuer in {sorted(_ISSUERS)}, "
        "email_verified is true, "
        "email and sub present. Every refusal is the same 401 'We could not sign you in "
        "with Google. "
        "Try again.'; the reason class is logged as google_token_refused.",
    )

    try:
        with urllib.request.urlopen(
            KEYS_URL, timeout=_TIMEOUT_S
        ) as resp:  # noqa: S310 - fixed https URL
            line("B1d Google keys", "PASS", f"reachable, HTTP {resp.status}")
    except Exception as exc:  # noqa: BLE001 - the class and message are the answer
        line("B1d Google keys", "FAIL", f"{type(exc).__name__}: {str(exc)[:120]}")
        bad += 1

    if args.token_file:
        token = Path(args.token_file).read_text(encoding="utf-8").strip()
        try:
            claims = google_id_token.verify_oauth2_token(token, _Request(), audience=ids)
            line(
                "B1e token",
                "PASS",
                f"accepted; email_verified={claims.get('email_verified')}, "
                f"has_email={bool(claims.get('email'))}",
            )
        except Exception as exc:  # noqa: BLE001
            text = re.sub(r"\d+-[a-z0-9]+\.apps\.googleusercontent\.com", "<id>", str(exc))
            line("B1e token", "FAIL", f"{type(exc).__name__}: {text[:200]}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
