# ADR-005: Why Memurai instead of WSL2 for Redis

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
ArenaHub needs Redis for distributed locking (booking concurrency), caching,
rate limiting, and refresh-token replay tracking. Redis has no official native
Windows build. The team develops on Windows 11. Options were: run Redis in
WSL2, run it in Docker (deferred until the final sprint per CLAUDE.md
deviation #1), or use a Windows-native Redis-compatible server.

## Decision
Use **Memurai** — a native Windows service that is wire-compatible with the
Redis protocol — listening on `localhost:6379`. The backend connects with a
standard Redis client and standard `REDIS_URL`; there are no code differences
versus Linux Redis.

## Consequences
- **Positive:** Runs as a Windows service (starts on boot, no manual `redis-
  server`); no WSL2 networking/localhost-forwarding quirks; no Docker needed in
  early sprints; identical client code to production Redis. Simple for a
  two-person team to keep running.
- **Negative / trade-offs:** Memurai is a third-party product (free/developer
  edition has some limits vs. paid); it tracks Redis versions with a slight lag;
  it is a Windows-only dev convenience, not the production target.
- **Mitigation:** Because the code uses a standard Redis client and
  `REDIS_URL`, production can point at real Redis (or Dockerized Redis in the
  final sprint) with a config change only — no code change.

## Development note (2026-07-12)

The decision is "a Windows-native Redis-compatible service on `localhost:6379`";
**Memurai is the recommended one, but not the only acceptable one.** The Sprint-1
dev machine already had the Redis 5.0.14.1 Windows port running as a service, so
we use it as-is rather than forcing a Memurai install — it satisfies everything
we need (SET-NX-PX locking, pub/sub, TTLs). One code accommodation: the async
client pins **RESP2** (`protocol=2`), because Redis 5 predates the RESP3 `HELLO`
handshake that modern `redis-py` negotiates by default. RESP2 is fully
sufficient and is also spoken by Memurai and modern Redis, so the client stays
portable across whichever Redis-compatible server a teammate runs.
