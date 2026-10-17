"""Scheduled, rotated database backup.

Unlike ``backup_db.py`` (a one-off snapshot chained in front of a migration),
this is the backup you run on a timer (Task Scheduler on this PC, cron on a
server). It:

* dumps with ``pg_dump --format=custom`` (compressed; restore with
  ``pg_restore``),
* names the file ``<dbname>-YYYYMMDD-HHMMSS.dump`` in ``backend/backups/``
  (gitignored),
* refuses an empty dump (deletes it and exits non-zero so a monitor notices),
* keeps only the most recent ``KEEP`` dumps per database and prunes the rest.

Usage (from backend/):
    uv run python scripts/backup_scheduled.py

Scheduling steps: see docs/BACKUPS.md.
"""

import subprocess
import sys
from datetime import datetime

from _dbtools import BACKEND_DIR, BACKUP_DIR, database_url, find_pg_dump

# How many dated dumps to keep per database before pruning the oldest.
KEEP = 14


def main() -> None:
    url = database_url()
    db_name = url.rsplit("/", 1)[-1].split("?")[0]
    BACKUP_DIR.mkdir(exist_ok=True)
    out_file = BACKUP_DIR / f"{db_name}-{datetime.now():%Y%m%d-%H%M%S}.dump"

    result = subprocess.run(
        [find_pg_dump(), "--format=custom", "--compress=9", f"--file={out_file}", url],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"backup_scheduled: pg_dump failed:\n{result.stderr.strip()}")

    size = out_file.stat().st_size if out_file.exists() else 0
    if size == 0:
        out_file.unlink(missing_ok=True)
        sys.exit("backup_scheduled: the dump is empty — backup FAILED, nothing kept.")

    # Rotation: keep the newest KEEP dumps for this database; the timestamp in
    # the name sorts chronologically, so the oldest sort first.
    dumps = sorted(BACKUP_DIR.glob(f"{db_name}-*.dump"))
    pruned = 0
    for old in dumps[:-KEEP]:
        old.unlink()
        pruned += 1
        print(f"backup_scheduled: pruned old backup {old.name}")

    kept = min(len(dumps), KEEP)
    print(
        f"backup_scheduled: wrote {out_file.relative_to(BACKEND_DIR)} "
        f"({size / 1024:.0f} KB); {kept} kept, {pruned} pruned."
    )


if __name__ == "__main__":
    main()
