"""Find the exact reason sign-up and other code emails do not arrive. Diagnosis only.

It changes nothing: it only reads settings and sends ONE test message.

    uv run python -m scripts.diagnose_email --to someone@gmail.com

It goes stage by stage and stops at the first stage that fails, printing one line per stage
(PASS or FAIL, the error class and its message). Settings are read only through get_settings().
It never prints the password, the username or the sender address; the recipient is given on the
command line and is only used for the ONE test message of stage A3 (it is not stored anywhere and
the address itself is not printed, only its domain).

Stages:
  A1 config      what is set (SET / MISSING only) and whether this mode skips real sending
  A2 network     DNS and TCP to the configured port, 587 and 465, IPv4 and IPv6 separately
  A3 smtp        TLS handshake, login, ONE test message, quit; the SMTP reply at the failing step
"""

import argparse
import smtplib
import socket
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.integrations.email.smtp import _is_reserved_address, email_mode  # noqa: E402

TIMEOUT = 10


def line(stage: str, ok: bool, text: str) -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {stage}: {text}")


def a1_config(to: str) -> bool:
    s = get_settings()
    flags = {
        "EMAIL_HOST": bool(s.email_host),
        "EMAIL_PORT": bool(s.email_port),
        "EMAIL_USERNAME": bool(s.email_username),
        "EMAIL_PASSWORD": bool(s.email_password),
        "EMAIL_FROM": bool(s.email_from) and "arenahub.local" not in s.email_from,
    }
    shown = ", ".join(f"{k}={'SET' if v else 'MISSING'}" for k, v in flags.items())
    print(f"        {shown}, EMAIL_SEND_IN_DEV={'on' if s.email_send_in_dev else 'off'}")
    print(f"        environment={s.environment.value}, port={s.email_port}")
    mode = email_mode()
    if mode["mode"] != "smtp":
        line("A1 config", False, f"the app does NOT send real mail in this mode: {mode['reason']}")
        return False
    if _is_reserved_address(to):
        line(
            "A1 config", False, "the test recipient is a reserved/fake domain: it is never sent to"
        )
        return False
    missing = [k for k, v in flags.items() if not v and k != "EMAIL_USERNAME"]
    if missing:
        line("A1 config", False, "missing or default: " + ", ".join(missing))
        return False
    line("A1 config", True, "the app is in real SMTP mode and nothing is skipped")
    return True


def _family_name(family: int) -> str:
    return "IPv4" if family == socket.AF_INET else "IPv6"


def a2_network(host: str, ports: list[int]) -> bool:
    all_ok = True
    for port in ports:
        for family in (socket.AF_INET, socket.AF_INET6):
            name = _family_name(family)
            try:
                infos = socket.getaddrinfo(host, port, family, socket.SOCK_STREAM)
            except socket.gaierror as exc:
                line(f"A2 dns {name} :{port}", False, f"{type(exc).__name__}: {exc}")
                if port == get_settings().email_port and family == socket.AF_INET:
                    all_ok = False
                continue
            try:
                with socket.socket(family, socket.SOCK_STREAM) as sock:
                    sock.settimeout(TIMEOUT)
                    sock.connect(infos[0][4])
                line(f"A2 tcp {name} :{port}", True, "connected")
            except OSError as exc:
                line(f"A2 tcp {name} :{port}", False, f"{type(exc).__name__}: {exc}")
                if port == get_settings().email_port and family == socket.AF_INET:
                    all_ok = False
    return all_ok


def _login_and_maybe_send(port: int, to: str | None) -> bool:
    s = get_settings()
    host = s.email_host or ""
    step = "connect"
    try:
        if port == 465:
            client: smtplib.SMTP = smtplib.SMTP_SSL(
                host, port, timeout=TIMEOUT, context=ssl.create_default_context()
            )
        else:
            client = smtplib.SMTP(host, port, timeout=TIMEOUT)
        with client:
            step = "ehlo/starttls"
            if port != 465:
                client.ehlo()
                code, reply = client.starttls(context=ssl.create_default_context())
                print(f"        starttls reply: {code} {reply.decode(errors='replace')[:80]}")
            step = "login"
            if s.email_username:
                code, reply = client.login(s.email_username, s.email_password or "")
                print(f"        login reply: {code} {reply.decode(errors='replace')[:80]}")
            if to:
                step = "send"
                msg = EmailMessage()
                msg["From"] = s.email_from
                msg["To"] = to
                msg["Subject"] = "ArenaHub email diagnosis"
                msg.set_content("One test message from scripts/diagnose_email.py. Nothing to do.")
                refused = client.send_message(msg)
                print(f"        message accepted, refused recipients: {len(refused)}")
            step = "quit"
        line(
            f"A3 smtp :{port}",
            True,
            "login ok" + (" and the test message was accepted" if to else ""),
        )
        return True
    except smtplib.SMTPResponseException as exc:
        text = (
            exc.smtp_error.decode(errors="replace")
            if isinstance(exc.smtp_error, bytes)
            else str(exc.smtp_error)
        )
        line(
            f"A3 smtp :{port}",
            False,
            f"at {step}: {type(exc).__name__} reply {exc.smtp_code} {text[:160]}",
        )
    except smtplib.SMTPException as exc:
        line(f"A3 smtp :{port}", False, f"at {step}: {type(exc).__name__}: {str(exc)[:160]}")
    except (OSError, ssl.SSLError) as exc:
        line(f"A3 smtp :{port}", False, f"at {step}: {type(exc).__name__}: {str(exc)[:160]}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True, help="the ONE address that gets the test message")
    to = parser.parse_args().to
    s = get_settings()
    print(f"recipient domain: {to.rpartition('@')[2]}   smtp host: {s.email_host or '(none)'}")
    if not a1_config(to):
        return 1
    host = s.email_host or ""
    if not a2_network(host, sorted({s.email_port, 587, 465})):
        print("stopped: the configured port is not reachable over IPv4")
        return 1
    if not _login_and_maybe_send(s.email_port, to):
        return 1
    other = 465 if s.email_port != 465 else 587
    _login_and_maybe_send(other, None)  # login only, no second message
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
