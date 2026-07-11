# ADR-006: Why a feature-based backend structure

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
Docs 02/14 imply a classic layered layout (`models/`, `schemas/`, `services/`,
`repositories/` as sibling top-level folders). In that layout, working on one
domain (e.g. bookings) means editing four distant directories at once. Over an
18-week build spanning ~15 domains (auth, arena, court, slot, booking, payment,
equipment, review, complaint, notification, ai, admin, report, user), the
layered layout scatters related code and grows painful to navigate.

## Decision
Group backend code **by domain feature** under `app/modules/<domain>/`, where
each module owns its own `api.py`, `service.py`, `repository.py`, `schema.py`,
and `model.py`. Cross-cutting helpers live in `app/shared/`; framework wiring
lives in `app/core/`, `app/database/`, `app/integrations/`, etc.

## Consequences
- **Positive:** Everything for a domain is in one folder — faster navigation,
  easier code review, cleaner mental model, and simpler ownership. New modules
  are added by copying a folder shape. Tests mirror the same structure.
- **Negative / trade-offs:** Departs from what the docs imply and from many
  tutorials; requires discipline to keep truly shared logic in `shared/` rather
  than duplicating it per module; risk of inconsistent internal file layout if
  the module template isn't followed.
- **Mitigation:** Enforce the same five-file shape per module and the layering
  rules (routes call services, services call repositories, repositories touch
  only the DB). Extract to `shared/` the moment a rule appears twice.
