# ADR-007: Why BackgroundTasks + APScheduler instead of Celery

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
ArenaHub has asynchronous work: fire-and-forget tasks (send email/OTP, push
notifications) and recurring jobs (24hr/1hr booking reminders, auto-cancel
unpaid bookings after 24hr, daily owner summaries — doc 13). Docs 02/14
reference a Celery-style worker. Celery adds a separate worker process plus a
broker (RabbitMQ/Redis) plus Celery Beat for scheduling — three moving parts
and a second deployable — which is heavy for FYP scope and demo simplicity.

## Decision
Use **FastAPI `BackgroundTasks`** for fire-and-forget work triggered by a
request, and **APScheduler** (in-process) for recurring/scheduled jobs. No
Celery, no RabbitMQ, no separate Beat process.

## Consequences
- **Positive:** Zero extra processes to run or demo; scheduled jobs live in the
  same app (`app/tasks/`); far less operational complexity; easy to reason
  about for a two-person team.
- **Negative / trade-offs:** In-process scheduling does not survive across
  multiple backend replicas without coordination, and tasks die if the single
  process restarts mid-run (acceptable at FYP scale with one backend process).
  No built-in retry/results backend like Celery.
- **Migration path:** If we outgrow this in Sprint 5 (e.g. horizontal scaling),
  swap to **RQ** (Redis-native, single dependency — we already run Redis)
  rather than the full Celery+RabbitMQ+Beat stack. Task functions are kept
  broker-agnostic in `app/tasks/` to make that swap localized.
