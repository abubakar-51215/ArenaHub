# ADR-001: Why FastAPI for the Backend

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
ArenaHub needs an API backend that handles real-time slot availability
(WebSockets), concurrent booking with Redis distributed locking, payment
webhooks, and background jobs (reminders, auto-cancel). The team knows Python.
The domain is I/O-bound: most requests wait on PostgreSQL, Redis, and external
payment gateways rather than on CPU. Candidate frameworks were Django REST
Framework, Flask, and FastAPI.

## Decision
Use **FastAPI** (Python 3.12) with async SQLAlchemy 2.x and Pydantic 2.

Reasons:
- **Native async** end-to-end (routes → services → repositories) suits the
  I/O-bound workload and pairs naturally with `asyncpg` and async Redis, which
  matters for the concurrent-booking path.
- **First-class WebSocket support** for live slot broadcasting (doc 02) without
  bolting on a separate library.
- **Pydantic 2** gives request/response validation and typed boundaries for
  free, and drives the standard response envelope.
- **Automatic OpenAPI docs** at `/docs` — a concrete Definition-of-Done check
  and a strong viva demo artifact.
- Lighter and less opinionated than Django; we don't need Django's admin/ORM
  since we're on SQLAlchemy + a custom feature-based structure.

## Consequences
- **Positive:** High performance for I/O-bound work; self-documenting API;
  strong typing catches boundary errors early; async matches the locking model.
- **Negative / trade-offs:** No batteries-included admin or auth — we build
  auth, RBAC, and migrations ourselves (Alembic). Async SQLAlchemy 2.x has a
  steeper learning curve than sync ORMs and requires discipline (no sync calls
  in async paths).
- **Mitigations:** Feature-based module structure (ADR-006) keeps each domain
  self-contained; strict "business logic in services, DB in repositories"
  rule keeps async boundaries clean.
