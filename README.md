# ArenaHub

A sports arena booking and management platform for Pakistan. Players discover
and book courts on a **React Native (Expo)** mobile app; Arena Owners and
Admins manage everything on a **Next.js** web dashboard. Backed by
**FastAPI + PostgreSQL + Redis**.

This is a two-person Final Year Project on an 18-week / 5-sprint plan. The full
specification lives in [`docs/`](docs/) (15 files). Deliberate deviations from
the spec and all project rules are recorded in
[`docs/PROJECT_GUIDELINES.md`](docs/PROJECT_GUIDELINES.md) — read it first;
when it conflicts with the docs, **PROJECT_GUIDELINES.md wins**.

Architecture decisions are documented as ADRs in
[`docs/architecture-decisions/`](docs/architecture-decisions/).

---

## Tech stack

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo SDK 54, TypeScript |
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Backend | FastAPI, Python 3.12, async SQLAlchemy 2.x, Pydantic 2 |
| Database | PostgreSQL 18 |
| Cache / locking | Redis (Memurai on Windows) |
| State (web + mobile) | Zustand + TanStack Query |
| Package manager (backend) | uv |
| Logging | structlog |
| Background jobs | FastAPI BackgroundTasks + APScheduler |

> **No Docker until the final sprint.** Local dev runs against natively
> installed PostgreSQL, Memurai, a uv-managed Python venv, and the JS dev
> servers directly. See PROJECT_GUIDELINES.md deviation #1.

---

## Prerequisites

Install and have running before you start:

- **PostgreSQL 18** — running on `localhost:5432`
- **Memurai** (Windows-native Redis) — running on `localhost:6379`
- **uv** — `winget install --id=astral-sh.uv` or `irm https://astral.sh/uv/install.ps1 | iex`
  (uv manages the pinned Python 3.12 toolchain; you do not need Python 3.12 installed globally)
- **Node.js 20 LTS** and npm
- **Git**

Do **not** install `expo-cli` globally — it's deprecated. Mobile scaffolding
uses `npx create-expo-app`.

---

## Local setup

### 1. Clone and install root tooling
```bash
git clone https://github.com/abubakar-51215/ArenaHub.git
cd ArenaHub
npm install            # root task-runner scripts + pre-commit tooling
```

### 2. Backend (FastAPI)
```bash
cd backend
cp .env.example .env   # then fill in real values
uv sync                # creates .venv from pyproject.toml, installs deps
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```
Backend runs on `http://localhost:8000`; OpenAPI docs at `/docs`;
health check at `/api/v1/health`.

### 3. Web (Next.js)
```bash
cd frontend/web
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL
npm run dev                  # http://localhost:3000
```

### 4. Mobile (Expo)
```bash
cd frontend/mobile
npm install
cp .env.example .env         # set EXPO_PUBLIC_API_URL
npx expo start
```

---

## Task runner (root `package.json`)

Cross-platform npm scripts, so no Makefile is needed on Windows:

| Command | Does |
|---|---|
| `npm run dev` | Start backend + web dev servers together |
| `npm run dev:backend` | Backend only (`uv run uvicorn ... --reload`) |
| `npm run dev:web` | Next.js dev server |
| `npm run dev:mobile` | Expo dev server |
| `npm run migrate` | `alembic upgrade head` |
| `npm run makemigration` | Create a new Alembic revision (autogenerate) |
| `npm run seed` | Seed reference data (amenities, etc.) |
| `npm run test` | Backend pytest suite |
| `npm run lint` | ruff + eslint |
| `npm run format` | black + prettier |

---

## Git workflow

Two-person team, one long-lived branch per teammate; `main` is the
integration branch (no shared `develop`):

`main` ← `abubakar` / `umer` (personal dev branches) ← optional `feature/*`.

Conventional commits (`feat:` / `fix:` / `chore:` / `docs:` / `refactor:`).
Pre-commit hooks (ruff + black + eslint + prettier) must pass before a commit
is accepted.

### Branching during the FYP
Each teammate works on their own branch (`abubakar`, `umer`), branched from
`main`, and rebases on `main` frequently to stay in sync. Completed, tested
features reach `main` via a **GitHub Pull Request** (`abubakar → main` or
`umer → main`, squash-merge preferred) — even when the author merges their
own PR — so every feature has a reviewable, revertable history and `main`
always reflects the last working milestone. Larger pieces can use a
short-lived `feature/*` branch off a personal branch.

---

## Sprint status

Currently in **Sprint 1** (environment setup — Docker deferred to Sprint 5).
Roadmap: [`docs/15_DEVELOPMENT_ROADMAP.md`](docs/15_DEVELOPMENT_ROADMAP.md).
