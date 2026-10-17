"""Shared helpers for the database backup / restore scripts.

Kept tiny and dependency-light (only ``python-dotenv``) so the backup and
restore-check scripts can run from a bare ``uv run`` without importing the app.
Never prints a password: callers pass connection parts to ``asyncpg`` or set
``PGPASSWORD`` in the child environment, so no credential reaches stdout.
"""

import glob
import os
import shutil
import sys
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent.parent
BACKUP_DIR = BACKEND_DIR / "backups"


def database_url(*, libpq: bool = True) -> str:
    """The DATABASE_URL from the environment or backend/.env.

    ``libpq=True`` strips SQLAlchemy's ``+asyncpg`` driver suffix so the value
    is a plain libpq URI that ``pg_dump`` / ``pg_restore`` accept.
    """
    url = os.environ.get("DATABASE_URL") or dotenv_values(BACKEND_DIR / ".env").get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set in the environment or backend/.env")
    return url.replace("postgresql+asyncpg://", "postgresql://") if libpq else url


def _find_tool(name: str) -> str:
    """Locate a PostgreSQL client binary (``pg_dump``, ``pg_restore``).

    Windows Postgres installers don't add ``bin/`` to PATH, so fall back to the
    standard install location and pick the newest major version found.
    """
    on_path = shutil.which(name)
    if on_path:
        return on_path
    exe = name + (".exe" if os.name == "nt" else "")
    candidates = sorted(glob.glob(rf"C:\Program Files\PostgreSQL\*\bin\{exe}"), reverse=True)
    if candidates:
        return candidates[0]
    sys.exit(
        f"{name} not found on PATH (or in C:\\Program Files\\PostgreSQL). "
        "Install the PostgreSQL client tools."
    )


def find_pg_dump() -> str:
    return _find_tool("pg_dump")


def find_pg_restore() -> str:
    return _find_tool("pg_restore")
