# Database backups

Written in simple English. It says how to back up the database, how to prove a
backup can be restored, and how to run both on a timer.

## What the scripts do

| Script | Does |
|---|---|
| `backend/scripts/backup_scheduled.py` | Makes one compressed, dated dump (`pg_dump --format=custom`) in `backend/backups/`, refuses an empty dump, and keeps only the **14** most recent dumps per database (older ones are deleted). This is the one you run on a timer. |
| `backend/scripts/restore_check.py` | Restores the newest dump into a throwaway database (`arenahub_restore_check`, never the real one), counts the main tables, and drops the throwaway again. A backup you never restored is not a backup. |
| `backend/scripts/backup_db.py` | A separate one-off snapshot taken automatically right before a migration (`npm run migrate`). Not on a timer. |

Backups live in `backend/backups/` and are **git-ignored** (`.gitignore` ignores
`backups/` and `*.dump`). Never commit a dump — it is a full copy of the data.

## Run them by hand (from `backend/`)

```
uv run python scripts/backup_scheduled.py     # make a dump, keep the last 14
uv run python scripts/restore_check.py        # prove the newest dump restores
```

Both read `DATABASE_URL` from `backend/.env`. Neither prints the password.

## Schedule on this Windows PC (Task Scheduler)

Make a daily backup at, say, 02:00, and a weekly restore-check.

1. Open **Task Scheduler** → **Create Task** (not "Basic Task").
2. **General:** name it `ArenaHub DB backup`. Tick **Run whether user is logged on or not**.
3. **Triggers → New:** Daily, 02:00.
4. **Actions → New:**
   - Program/script: `powershell.exe`
   - Arguments:
     `-NoProfile -Command "cd 'D:\ArenaHub\backend'; uv run python scripts/backup_scheduled.py"`
   - (If `uv` is not found, use its full path, e.g. `C:\Users\<you>\.local\bin\uv.exe`.)
5. **Settings:** tick **Run task as soon as possible after a scheduled start is missed**.
6. Save (it asks for your Windows password so it can run while logged off).
7. Add a second task `ArenaHub DB restore-check`, trigger **Weekly**, same action but
   `… scripts/restore_check.py`. If it ever fails, Task Scheduler marks the run failed
   (last result ≠ 0) — check **History**.

To confirm the first run worked: `Get-ChildItem D:\ArenaHub\backend\backups` shows a new
`.dump` with today's date, and running the restore-check by hand prints `PASSED`.

## Schedule on a production server (Linux)

A dump is only safe if it leaves the machine. On a server:

1. Install the PostgreSQL client tools (`pg_dump`, `pg_restore`) matching the server's
   major version.
2. Add a cron entry (e.g. `crontab -e`):
   ```
   0 2 * * *  cd /srv/arenahub/backend && /usr/local/bin/uv run python scripts/backup_scheduled.py >> /var/log/arenahub-backup.log 2>&1
   0 3 * * 0  cd /srv/arenahub/backend && /usr/local/bin/uv run python scripts/restore_check.py  >> /var/log/arenahub-restore.log 2>&1
   ```
3. **Copy each dump off the server** to a separate place (an object-storage bucket, or a
   different machine) right after it is written — a backup on the same disk does not
   survive that disk dying. Encrypt it at rest (the dump holds personal data).
4. Alert on failure: a non-zero exit, or no new dump in 24 hours, should page someone
   (see the monitoring item in `docs/BEFORE_GOING_LIVE.md`).
5. Before launch, and then regularly, do a **real** restore drill: restore the latest dump
   into a fresh database and open the app against it. `restore_check.py` is the automated
   minimum, not a substitute for a full drill.

## Keeping / retention

`backup_scheduled.py` keeps the newest 14 dumps **per database** and deletes older ones, so
the folder does not grow forever. Change `KEEP` at the top of the script to keep more or
fewer. For long-term retention, copy some dumps (e.g. the first of each month) to cold
storage before they rotate out.
