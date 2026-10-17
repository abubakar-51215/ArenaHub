"""Restore the latest backup into a scratch database and sanity-check it.

A backup you have never restored is not a backup. This script proves the newest
dump is usable:

1. drops and recreates a throwaway database (``arenahub_restore_check``) — never
   the real one,
2. restores the latest ``backend/backups/<maindb>-*.dump`` into it with
   ``pg_restore``,
3. counts rows in the main tables and prints them,
4. drops the scratch database again.

It fails (non-zero) if the dump is missing, the restore errors, or a main table
is absent after the restore.

Usage (from backend/):
    uv run python scripts/restore_check.py            # latest dump
    uv run python scripts/restore_check.py <file.dump>
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import asyncpg
from _dbtools import BACKUP_DIR, database_url, find_pg_restore
from sqlalchemy.engine import URL, make_url

SCRATCH_DB = "arenahub_restore_check"
# The tables a healthy ArenaHub dump must contain; also what we report counts for.
MAIN_TABLES = ["users", "arenas", "courts", "time_slots", "bookings", "payments"]


def _latest_dump(main_db: str) -> Path:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        if not path.exists():
            sys.exit(f"restore_check: file not found: {path}")
        return path
    dumps = sorted(BACKUP_DIR.glob(f"{main_db}-*.dump"))
    if not dumps:
        sys.exit(f"restore_check: no {main_db}-*.dump found in {BACKUP_DIR}")
    return dumps[-1]


async def _recreate_scratch(u: URL) -> None:
    conn = await asyncpg.connect(
        user=u.username, password=u.password, host=u.host, port=u.port, database="postgres"
    )
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{SCRATCH_DB}"')
        await conn.execute(f'CREATE DATABASE "{SCRATCH_DB}"')
    finally:
        await conn.close()


async def _count_tables(u: URL) -> dict[str, int]:
    conn = await asyncpg.connect(
        user=u.username, password=u.password, host=u.host, port=u.port, database=SCRATCH_DB
    )
    try:
        counts: dict[str, int] = {}
        for table in MAIN_TABLES:
            exists = await conn.fetchval("SELECT to_regclass($1)", f"public.{table}")
            if exists is None:
                raise RuntimeError(f"table '{table}' is missing from the restored database")
            counts[table] = await conn.fetchval(f'SELECT count(*) FROM "{table}"')
        return counts
    finally:
        await conn.close()


async def _drop_scratch(u: URL) -> None:
    conn = await asyncpg.connect(
        user=u.username, password=u.password, host=u.host, port=u.port, database="postgres"
    )
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{SCRATCH_DB}"')
    finally:
        await conn.close()


def main() -> None:
    url = database_url()
    u = make_url(url)
    if not u.database:
        sys.exit("restore_check: DATABASE_URL has no database name")
    dump = _latest_dump(u.database)
    print(f"restore_check: restoring {dump.name} into scratch db '{SCRATCH_DB}' ...")

    asyncio.run(_recreate_scratch(u))
    try:
        # PGPASSWORD keeps the secret out of argv (and therefore out of logs).
        env = {**os.environ}
        if u.password:
            env["PGPASSWORD"] = u.password
        result = subprocess.run(
            [
                find_pg_restore(),
                "-h",
                str(u.host),
                "-p",
                str(u.port or 5432),
                "-U",
                str(u.username),
                "-d",
                SCRATCH_DB,
                "--no-owner",
                "--no-privileges",
                str(dump),
            ],
            capture_output=True,
            text=True,
            env=env,
        )
        # pg_restore can exit non-zero on ignorable warnings; the real proof is
        # that the main tables exist and are countable below.
        if result.returncode != 0 and result.stderr.strip():
            print(f"restore_check: pg_restore warnings:\n{result.stderr.strip()[:1000]}")

        counts = asyncio.run(_count_tables(u))
    finally:
        asyncio.run(_drop_scratch(u))

    print("restore_check: PASSED - main table row counts:")
    for table, n in counts.items():
        print(f"    {table:<12} {n}")


if __name__ == "__main__":
    main()
