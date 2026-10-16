"""Security check: one short pass/fail list. Run from the repository root:

    backend/.venv/Scripts/python scripts/security-check.py

Every step has a time limit. The header step needs a backend already running on
http://localhost:8000 (set SECURITY_CHECK_API to change it); it is skipped, and says so, when
nothing answers. Exit code 1 when any step fails.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
PY = BACKEND / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
STEP_SECONDS = (
    180  # audits talk to the internet; every other step finishes in a few seconds
)
API = os.environ.get("SECURITY_CHECK_API", "http://localhost:8000")
NPM = "npm.cmd" if os.name == "nt" else "npm"

results: list[tuple[str, str, str]] = []


def record(name: str, status: str, note: str = "") -> None:
    results.append((name, status, note))
    print(f"{status:5} {name}" + (f"  - {note}" if note else ""), flush=True)


def run(cmd: list[str], cwd: Path, seconds: int = STEP_SECONDS) -> tuple[int, str]:
    try:
        done = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=seconds, check=False
        )
        return done.returncode, (done.stdout + done.stderr)
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {seconds} s"
    except FileNotFoundError as exc:
        return 127, str(exc)


def pip_audit() -> None:
    code, out = run(
        [str(PY), "-m", "pip_audit", "--progress-spinner", "off", "--skip-editable"],
        BACKEND,
    )
    record(
        "pip-audit (backend packages)",
        "PASS" if code == 0 else "FAIL",
        "" if code == 0 else out[-300:],
    )


def bandit() -> None:
    code, out = run([str(PY), "-m", "bandit", "-q", "-r", "app", "-ll"], BACKEND)
    record(
        "bandit (backend code, medium and up)",
        "PASS" if code == 0 else "FAIL",
        "" if code == 0 else out[-300:],
    )


def npm_audit(folder: str) -> None:
    code, out = run(
        [NPM, "audit", "--json", "--audit-level=high"], ROOT / "frontend" / folder
    )
    try:
        counts = json.loads(out)["metadata"]["vulnerabilities"]
        bad = counts.get("high", 0) + counts.get("critical", 0)
        record(
            f"npm audit ({folder})",
            "PASS" if bad == 0 else "FAIL",
            f"high+critical: {bad}",
        )
    except (ValueError, KeyError):
        record(f"npm audit ({folder})", "FAIL", out[-200:])


_PATTERNS = {
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "AWS key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "Google API key": re.compile(r"AIza[0-9A-Za-z_-]{35}"),
    "Slack token": re.compile(r"xox[baprs]-[0-9A-Za-z-]{10,}"),
    "GitHub token": re.compile(r"gh[pousr]_[0-9A-Za-z]{36,}"),
    "Stripe live key": re.compile(r"sk_live_[0-9A-Za-z]{16,}"),
}


def secret_scan() -> None:
    code, out = run(["git", "ls-files"], ROOT, 20)
    hits = []
    for name in out.splitlines():
        path = ROOT / name
        if path.suffix in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".ttf",
            ".otf",
            ".woff2",
            ".pdf",
            ".lock",
        }:
            continue
        if (
            "package-lock" in name
            or not path.is_file()
            or path.stat().st_size > 2_000_000
        ):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for label, pattern in _PATTERNS.items():
            if pattern.search(text):
                hits.append(f"{label} in {name}")
    record(
        "secret patterns in tracked files",
        "PASS" if not hits else "FAIL",
        "; ".join(hits[:5]),
    )


def env_files() -> None:
    code, out = run(["git", "ls-files"], ROOT, 20)
    tracked = [
        n
        for n in out.splitlines()
        if re.search(r"(^|/)\.env(\.[^/]*)?$", n)
        and not n.endswith((".example", ".sample"))
    ]
    record(
        "no .env file is tracked", "PASS" if not tracked else "FAIL", ", ".join(tracked)
    )


def headers() -> None:
    try:
        with urllib.request.urlopen(
            f"{API}/api/v1/health", timeout=8
        ) as res:  # noqa: S310
            got = {k.lower(): v for k, v in res.headers.items()}
    except OSError:
        record("response headers", "SKIP", f"nothing is answering on {API}")
        return
    want = {
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
        "cache-control": "no-store",
    }
    missing = [k for k, v in want.items() if got.get(k) != v]
    record("response headers", "PASS" if not missing else "FAIL", ", ".join(missing))


def startup_check() -> None:
    code_snippet = (
        "from app.core.config import Settings\n"
        "import os\n"
        "os.environ['ENVIRONMENT']='prod'\n"
        "try:\n"
        "    Settings(_env_file=None)\n"
        "    print('STARTED')\n"
        "except Exception:\n"
        "    print('REFUSED')\n"
    )
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in {"JWT_SECRET", "CODE_HASH_SECRET"}
    }
    try:
        done = subprocess.run(
            [str(PY), "-c", code_snippet],
            cwd=BACKEND,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            env={**env, "ENVIRONMENT": "prod"},
        )
        out = done.stdout.strip()
    except subprocess.TimeoutExpired:
        out = "timeout"
    record(
        "production start-up refuses unsafe settings",
        "PASS" if out.endswith("REFUSED") else "FAIL",
        out[-100:],
    )


def environment_set() -> None:
    """ENVIRONMENT defaults to dev on purpose (for developers); a server must set it."""
    value = os.environ.get("ENVIRONMENT")
    if value:
        record("ENVIRONMENT is set", "PASS", value)
    else:
        record(
            "ENVIRONMENT is set",
            "WARN",
            "not set here: the app falls back to dev; set prod or staging on every server",
        )


def main() -> int:
    for step in (
        environment_set,
        pip_audit,
        bandit,
        lambda: npm_audit("web"),
        lambda: npm_audit("mobile"),
        secret_scan,
        env_files,
        headers,
        startup_check,
    ):
        step()
    failed = [r for r in results if r[1] == "FAIL"]
    warned = [r for r in results if r[1] == "WARN"]
    print(
        f"\n{len(results) - len(failed) - len(warned)} of {len(results)} steps passed or skipped,"
        f" {len(warned)} warning(s), {len(failed)} failed"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
