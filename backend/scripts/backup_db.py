"""Back up the database with pg_dump before a migration.

``npm run migrate`` chains this in front of ``alembic upgrade head`` so every
schema change is preceded by a restorable snapshot (custom-format dump,
restore with ``pg_restore -d <db> <file>``). Dumps land in ``backend/backups/``
(gitignored), named ``<dbname>-YYYYMMDD-HHMMSS.dump``.

Set ``SKIP_DB_BACKUP=1`` to bypass (e.g. CI, where the database is disposable
and pg_dump may not be installed). Any other failure exits non-zero so the
chained migration does not run against an un-backed-up database.

Usage (from backend/):
    uv run python scripts/backup_db.py
"""

import glob
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent.parent
BACKUP_DIR = BACKEND_DIR / "backups"


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL") or dotenv_values(BACKEND_DIR / ".env").get("DATABASE_URL")
    if not url:
        sys.exit("backup_db: DATABASE_URL not set in the environment or backend/.env")
    # SQLAlchemy's async driver suffix is not part of a libpq connection URI.
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _find_pg_dump() -> str:
    on_path = shutil.which("pg_dump")
    if on_path:
        return on_path
    # Windows Postgres installers don't add bin/ to PATH by default.
    candidates = sorted(glob.glob(r"C:\Program Files\PostgreSQL\*\bin\pg_dump.exe"), reverse=True)
    if candidates:
        return candidates[0]
    sys.exit(
        "backup_db: pg_dump not found on PATH (or in C:\\Program Files\\PostgreSQL). "
        "Install PostgreSQL client tools, or set SKIP_DB_BACKUP=1 to migrate without a backup."
    )


def main() -> None:
    if os.environ.get("SKIP_DB_BACKUP") == "1":
        print("backup_db: SKIP_DB_BACKUP=1 — skipping pre-migration backup.")
        return

    url = _database_url()
    db_name = url.rsplit("/", 1)[-1].split("?")[0]
    BACKUP_DIR.mkdir(exist_ok=True)
    out_file = BACKUP_DIR / f"{db_name}-{datetime.now():%Y%m%d-%H%M%S}.dump"

    result = subprocess.run(
        [_find_pg_dump(), "--format=custom", f"--file={out_file}", url],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"backup_db: pg_dump failed:\n{result.stderr.strip()}")
    size_kb = out_file.stat().st_size / 1024
    print(f"backup_db: wrote {out_file.relative_to(BACKEND_DIR)} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
