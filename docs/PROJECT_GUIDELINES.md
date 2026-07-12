# ArenaHub — Project Guidelines

Authoritative project rules, conventions, and deliberate deviations from
the specification documents. Read this before implementing anything.

## What this project is
ArenaHub: a sports arena booking platform for Pakistan. Three roles:
Player (React Native mobile app), Arena Owner (Next.js web dashboard),
Admin (Next.js web dashboard). FastAPI + PostgreSQL + Redis backend.
This is a two-person Final Year Project on an 18-week / 5-sprint plan.
Keep implementations pragmatic and defensible — solid engineering, no
gold-plating for scale we don't have.

## Source of truth
The complete specification lives in /docs (15 files):
01 overview, 02 architecture, 03 functional requirements, 04 NFRs,
05 roles & permissions, 06 player module, 07 owner module,
08 admin module, 09 database design, 10 API spec, 11 booking engine,
12 AI/NLP module, 13 notifications, 14 deployment, 15 roadmap.

Before implementing any module, read the relevant doc(s) first. If the
docs and this file conflict, THIS FILE WINS (it records deliberate
deviations). If something is ambiguous in both, STOP AND ASK — never
invent business rules (refund tiers, approval timeouts, permission
boundaries, slot rules).

UI layouts come from /design/wireframes (PNG/JPG, named per screen).
Match them; don't invent layouts. If a needed screen has no wireframe,
ask.

## Deliberate deviations from the docs
1. NO DOCKER until the final sprint. Docs 02/14/15 assume Docker
   Compose from Sprint 1 — we defer all of it. Local dev = natively
   installed PostgreSQL on Windows, Memurai (Windows Redis-compatible
   service), backend in a Python venv managed by uv, Next.js and Expo
   run directly. Never scaffold Dockerfiles or compose files unless
   explicitly asked. Keep every connection string/secret in .env so
   containerizing later is config-only.
2. PAYMENT METHODS (supersedes doc 09's enum). Checkout offers, like
   Bookme/Daewoo apps: card (credit/debit), JazzCash, EasyPaisa, and
   bank transfer. Schema change: payments.payment_method ENUM =
   card | jazzcash | easypaisa | bank_transfer, plus a `payment_provider`
   VARCHAR column (stripe | jazzcash | easypaisa | manual) so the card
   provider can be swapped without schema changes.
   - Card processing uses Stripe TEST MODE for this FYP (Stripe has no
     live Pakistani merchant support). The gateway layer must be a
     common interface in app/integrations/ so a local PSP (e.g.
     Safepay/PayFast) can replace Stripe in production untouched.
   - Bank transfer is a manual flow: player sees the arena's bank
     details, transfers via their own banking app, then uploads a
     receipt image. This method has NO webhook — the Arena Owner
     manually verifies the receipt as part of the pending_approval
     step. Payment record stays `pending` until owner approval marks
     it `completed`. This adds a receipt_proof_url field to payments.
   - "No cash-only bookings" rule from doc 01 still holds.

2b. APPROVAL FLOW SPLIT (supersedes docs 07/11 blanket owner approval).
   Owner approval only applies to bank_transfer bookings. For card,
   JazzCash, and EasyPaisa, a successful gateway webhook auto-confirms
   the booking — no manual owner step — like Bookme/airline apps.
   - card/JazzCash/EasyPaisa: pending_payment → gateway webhook →
     confirmed → QR generated → player + owner + admin notified.
   - bank_transfer: pending_payment → player uploads receipt →
     pending_approval → owner reviews receipt image + approves/rejects
     → confirmed or refunded.
   - The Booking model still needs the pending_approval status, but
     it's only entered by the bank_transfer path.
   - Auto-cancel-after-24hr and refund policies apply the same way to
     both paths.
3. AI MODULE = NLP query interface + recommendations ONLY (doc 12
   as written). The "chatbot" experience is the NLP search itself:
   player types natural language, system parses (keyword extraction
   per doc 12) and executes the search/filter. No separate FAQ
   knowledge-base bot. No deep learning, no external ML service.
4. MOBILE = React Native WITH EXPO (TypeScript), EAS builds later.
   Docs say React Native; Expo is the chosen toolchain.
5. STATE MANAGEMENT = Zustand (client state) + TanStack Query
   (server state) on both web and mobile.
6. SOCIAL LOGIN (Google/Apple) is deferred — doc 06 already marks it
   optional. Don't build it unless asked.
7. OTP IN DEV: generate + validate real OTPs, but in dev mode deliver
   by logging to the backend console instead of email/SMS. Real email
   delivery (SMTP/SendGrid) is wired in Sprint 2; SMS OTP only if a
   provider is decided later — email OTP is the baseline.
8. MAPS: use OpenStreetMap + Leaflet (web) / react-native-maps with
   OSM tiles (mobile) instead of Google Maps API. Doc 02 and doc 06
   both name Google Maps; substitute wherever they appear. No billing
   account required, and it's defensible for an FYP demo. Distance
   calculations use the Haversine formula from lat/lng in the arenas
   table.
9. CLOUD IMAGE STORAGE: Cloudinary free tier (25GB / 25k transforms)
   for arena photos, profile pictures, and receipt uploads. Store
   Cloudinary URLs in the DB, never raw bytes. Dev may fall back to
   local /uploads/ if Cloudinary credentials aren't configured yet.
10. OWNER STAFF SUB-ACCOUNTS deferred to Sprint 5 as a stretch goal.
    MVP has ONE Arena Owner account per arena — if the owner has
    hired staff to help manage the arena, those staff use the owner
    account itself; from the system's view it's a single "Arena
    Owner" role with no sub-tiers. Design the models with future
    staff support in mind (don't hardcode owner_id in a way that
    prevents adding a staff table later), but don't build the
    arena_staff table, invite flow, or permission tiers until core
    modules are stable. Doc 05 permission columns for staff can be
    ignored during the main build.
11. BOOKING STATUS FIELDS: keep BOTH booking_status (docs 09 enum)
    AND a separate payment_status column on the bookings row —
    denormalized but much easier to query. payment_status still also
    lives on the payments row as the authoritative source; the
    bookings row's copy is a cached read-model updated by the same
    transaction that writes the payment row.
12. PRICING CALCULATION ORDER: base_price → apply peak_pricing (if
    the slot falls in a peak window) → apply discount_code (if any) →
    final. Example: PKR 2000 base, +25% peak = 2500, -10% discount =
    2250. Applies to slot cost only; equipment addons are added AFTER
    discount at their full listed price.
13. FEATURE-BASED BACKEND STRUCTURE. Instead of the layered
    models/schemas/services/repositories split docs 02/14 imply, group
    files by domain feature under app/modules/{auth,arena,booking,
    payment,...}. Each module folder contains its own api.py,
    service.py, repository.py, schema.py, and model.py. Everything
    for a Booking lives in one place. Cross-cutting utilities live
    under app/shared/.
14. NO CELERY (supersedes docs 02/14 references). Use FastAPI's
    BackgroundTasks for fire-and-forget work + APScheduler for
    recurring jobs (24hr / 1hr booking reminders, auto-cancel-after-
    24hr, daily owner summaries per doc 13). Celery + RabbitMQ + Beat
    is overkill for FYP scope; two-process complexity for zero
    benefit. If we outgrow APScheduler in Sprint 5 we swap to RQ
    (Redis-native, single dependency).
15. PYTHON PACKAGE MANAGER: use uv, not pip + requirements.txt.
    Dependencies live in pyproject.toml. Lockfile is uv.lock.
    Install with `uv sync`; add packages with `uv add <pkg>`.
16. LOGGING: use structlog, not stdlib logging. Configure once in
    app/core/logging.py to emit JSON in prod and pretty console in
    dev. All modules import structlog directly.
17. AUTH — REFRESH TOKEN ROTATION. Every use of a refresh token
    issues a new refresh token and invalidates the old one. Detects
    replay: if an already-used refresh token is presented, revoke
    the entire family (force re-login). Store used-refresh-token
    identifiers in Redis with a TTL matching the refresh lifetime.
18. TESTING STACK: pytest + pytest-asyncio + httpx (async test
    client) + factory-boy + faker + coverage. Scaffold pytest.ini
    and conftest.py on Day 1 even though tests come later — this
    prevents "we'll add tests later" from turning into "we never
    added tests."
19. TOOLING (add Day 1): pre-commit hooks running ruff + black +
    eslint + prettier before every commit. Root-level package.json
    with npm scripts as task runner (dev / migrate / seed / test /
    lint / format) — cross-platform on Windows, no Makefile needed.

## Standardized environment variables (write these into .env.example)
Backend:
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- CLOUDINARY_URL
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD
- EASYPAISA_MERCHANT_ID
- EMAIL_HOST, EMAIL_PORT, EMAIL_USERNAME, EMAIL_PASSWORD
- FCM_SERVER_KEY
- ENVIRONMENT (dev | staging | prod)
- LOG_LEVEL

Frontend (web, prefix NEXT_PUBLIC_ where client-side):
- NEXT_PUBLIC_API_URL
- NEXT_PUBLIC_MAP_TILE_URL (OSM tile provider)

Mobile (Expo, EXPO_PUBLIC_ prefix):
- EXPO_PUBLIC_API_URL

## Architecture Decision Records (ADRs)
Every significant technology choice gets a short ADR file in
docs/architecture-decisions/ so viva examiners see the reasoning.
Minimum set to create in Sprint 1:
- ADR-001-Why-FastAPI.md
- ADR-002-Why-Expo-not-bare-RN.md
- ADR-003-Why-Cloudinary.md
- ADR-004-Why-OpenStreetMap-not-Google-Maps.md
- ADR-005-Why-Memurai-not-WSL2.md
- ADR-006-Why-Feature-Based-Modules.md
- ADR-007-Why-BackgroundTasks-not-Celery.md
- ADR-008-Why-Webhook-Auto-Confirm-vs-Owner-Approval.md
Each ADR follows: Context → Decision → Consequences (3 short sections,
half a page each). Add new ADRs whenever a non-obvious tech choice
comes up during development.

## Local dev environment
- Postgres: installed natively on Windows, running on 5432.
- Redis: Memurai (native Windows Redis-compatible service) on 6379.
  Backend connects the same as any Redis (no code differences vs
  Linux Redis).
- Backend: Python venv managed by uv (`uv sync` to install,
  `uv run uvicorn app.main:app --reload` to run).
- Web: `npm run dev` (Next.js).
- Mobile: `npx expo start` (Expo dev server). Never use the deprecated
  `expo-cli` global — use `npx create-expo-app` for scaffolding.
- All connection strings/secrets read from .env — never hardcoded —
  so Docker in the final sprint is config-only.

## Repository structure
ArenaHub/
├── backend/            # FastAPI
│   ├── app/
│   │   ├── modules/    # FEATURE-BASED: each module owns api/service/
│   │   │   │           # repository/schema/model
│   │   │   ├── auth/  user/  arena/  court/  slot/  booking/
│   │   │   ├── payment/  equipment/  review/  complaint/
│   │   │   └── notification/  ai/  admin/  report/
│   │   ├── core/       # config.py, security.py, exceptions.py, logging.py
│   │   ├── database/   # engine, session, base
│   │   ├── shared/     # cross-module utilities
│   │   ├── integrations/  # payment providers, FCM, email, storage
│   │   ├── tasks/      # BackgroundTasks + APScheduler jobs
│   │   ├── cache/      # Redis locking + caching helpers
│   │   ├── middleware/ # rate limiting, request logging
│   │   ├── websocket/  # slot broadcast manager per docs/02
│   │   └── main.py
│   ├── tests/          # mirrors modules/
│   ├── alembic/
│   ├── pyproject.toml  # uv-managed
│   └── .env.example
├── frontend/
│   ├── web/            # Next.js App Router: (auth)/, owner/, admin/, shared/
│   │   ├── components/ui/, components/features/
│   │   ├── services/ hooks/ lib/ store/ types/ utils/ config/
│   │   └── middleware.ts
│   └── mobile/         # Expo RN
├── docs/               # 15 spec files + PROJECT_GUIDELINES.md (this file)
│                       # + DEVELOPMENT_LOG.md + architecture-decisions/
├── design/wireframes/
├── database/{diagrams,seeds}/
├── scripts/
├── .github/workflows/
├── .pre-commit-config.yaml
├── package.json        # npm scripts as task runner
└── README.md  .gitignore  LICENSE

## Conventions
- Git: conventional commits (feat:/fix:/chore:); branches
  main + per-person dev branches (abubakar / umer), optional
  feature/* off a personal branch. See "Git workflow" below.
- API: /api/v1 (structured so /api/v2 can coexist later without a
  rewrite), OpenAPI auto-docs at /docs (doc 10 is the endpoint map).
- Secrets: .env.example committed with dummies; real .env gitignored.
- Python: ruff + black, enforced by pre-commit hooks. TS: eslint +
  prettier, enforced by pre-commit hooks.
- Tests: pytest + pytest-asyncio + httpx + factory-boy + faker +
  coverage. Structure mirrors app/modules/. Concurrency tests for
  Redis locking are mandatory before Sprint 3 exit — doc 15.
- Roles enum: player | owner | admin. Staff sub-tiers are deferred
  (see deviation #10) — do not add them to the enum.

## Payment verification principle (cross-cutting rule)
Whenever multiple payment methods exist:
- API-based payment methods (Stripe, JazzCash API, EasyPaisa API) are
  ALWAYS verified automatically through gateway webhooks and require
  no manual approval.
- Offline payment methods (manual bank transfer) ALWAYS require human
  verification (by the Arena Owner) before a booking is confirmed.

This rule overrides any older documentation implying all bookings
require owner approval. It applies to every future payment method
added: if it has a webhook, it auto-confirms; if it doesn't, someone
verifies.

## Locked technology versions
Pin these on Day 1 so version drift can't cause a slow-motion rewrite
in Sprint 4. Bump only with a matching ADR explaining why.

Backend:
- Python 3.12 (pinned via uv-managed toolchain; backend/.python-version)
- FastAPI 0.116+
- SQLAlchemy 2.x (async)
- Pydantic 2.x
- Alembic latest
- structlog latest
- uv latest

Frontend (web):
- Next.js 15 (App Router)
- React 19
- TypeScript 5.x
- Tailwind CSS 4
- shadcn/ui latest compatible with React 19 + Tailwind 4
- TanStack Query v5
- Zustand v5

Frontend (mobile):
- Expo SDK 54 (React Native)
- TypeScript 5.x
- Same Zustand v5 + TanStack Query v5 as web

Infrastructure:
- PostgreSQL 18 (installed 18.4)
- Redis-compatible via Memurai (latest stable)
- Node.js 20 LTS (installed 20.20)

### Day-1 version reconciliation (2026-07-12)
The machine's installed toolchain differed from the original plan;
reconciled once up front rather than mid-development:
- Python 3.14 was present system-wide, but the backend is pinned to
  **3.12** via a uv-managed toolchain (`backend/.python-version`) —
  3.14 is too new for reliable prebuilt wheels (asyncpg, bcrypt).
- **PostgreSQL 18.4** is installed; plan originally said 17. 18 is
  fully compatible for our usage — accepted, pin updated above.
- **Node.js 20.20 LTS** is installed; plan originally said 22. Node 20
  is LTS and supported by Expo SDK 54 + Next.js 15 — accepted, pin
  updated above.
These are the only accepted drifts. Any further version bump still
requires a new ADR.

## Coding principles
- Keep functions small — <50 lines when practical.
- Prefer composition over inheritance.
- Business logic lives in services. Never in API routes.
- Repositories only touch the database. Never call other services
  or contain business rules.
- Async everywhere on the backend (routes, services, repos).
- Type everything (Pydantic on the boundary, dataclasses/typed dicts
  or Pydantic internally; strict TS on frontend — no `any` without
  a written reason).
- Prefer explicit code over clever code. Readable > terse.
- No duplicate logic — extract to shared/ when a rule shows up twice.
- No dead code, no commented-out blocks; git history is the archive.

## Standard API response format
Every /api/v1 endpoint returns JSON in one of these two shapes.
Consistency here saves the frontend from writing per-endpoint
adapters.

Success:
```
{
  "success": true,
  "message": "Arena created successfully",
  "data": { ... },
  "errors": null
}
```

Error:
```
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": [
    { "field": "email", "message": "Email is already registered" }
  ]
}
```

Implementation: a shared response envelope helper in
app/shared/response.py, and a global FastAPI exception handler that
maps ValidationError / HTTPException / uncaught exceptions to this
shape. Paginated endpoints put pagination metadata inside `data`
(e.g. `{ "items": [...], "total": 123, "page": 1, "page_size": 20 }`)
so the envelope shape stays uniform.

## Git workflow
Two-person team; each teammate has their own long-lived development
branch. No shared `develop` branch — `main` is the integration branch.

Branches:
- main       — integration + production-ready. Always runnable; merges
               land here from the personal branches, gated on a working
               end-to-end demo.
- abubakar   — Abubakar's development branch (branched from main).
- umer       — Umer's development branch (branched from main).
- feature/<name> / fix/<name> — OPTIONAL short-lived branches off a
               personal branch for a focused piece of work; merge back
               into that person's branch.

Rules:
- Each teammate works on their own branch (abubakar / umer). Don't
  commit each other's WIP.
- Features reach main through GitHub PULL REQUESTS, never local
  merges — even when the author is the one merging. Flow: commit on
  personal branch → push branch → open PR (abubakar → main or
  umer → main) → review the diff → merge. This gives a complete
  per-feature history, easy review, and easy reverts.
- Merge a PR into main only when the work is demo-ready and
  pre-commit + a review pass. Keep main always runnable.
- Pull/rebase your branch on main frequently to stay in sync and keep
  conflicts between the two branches small.
- Prefer squash-merge on the PR (keeps history readable).
- Conventional commit messages (feat:/fix:/chore:/docs:/refactor:).
- Pre-commit hooks must pass before a commit is allowed.
- MILESTONE RELEASES: when a major milestone lands on main, tag it
  and create a GitHub Release — v0.1.0 scaffold, v0.2.0 auth,
  v0.3.0 booking engine, v0.4.0 payments, ... v1.0.0 final
  submission. Clean milestone record for demos and the viva.
- GITHUB ISSUES: one Issue per major feature (Backend Foundation,
  Database Schema, Authentication, Web Scaffold, Mobile Scaffold,
  Booking Engine, Arena Management, Payments, AI Assistant,
  Notifications, ...). Reference the issue number in commits:
  "feat(auth): implement JWT login (#3)". Gives the
  Issue → Branch → Commit → PR → Merge chain for the viva.
- FOCUSED PRs: one coherent piece of work per PR, never mixed
  concerns — but don't create micro-PRs either; closely-related
  steps can share a PR with clean per-step checkpoint commits
  inside. Small, focused PRs = easy review, easy revert. The git
  process exists to support development, not slow it down — if
  process overhead starts dominating, simplify.
- Commit messages use conventional-commit scopes: feat(auth):,
  feat(db):, fix(api):, refactor(core):, docs:, test:, chore:.
  Never "update files" / "fixed bugs".

## Definition of Done
A task/feature is only complete when ALL of these are true. If any
one is missing, the task is not done — don't move on.

- [ ] Code compiles / type-checks cleanly (mypy or tsc as applicable).
- [ ] Lint passes (ruff + eslint).
- [ ] Formatter passes (black + prettier).
- [ ] If schema changed: Alembic migration written, runs cleanly
      forward AND backward on a fresh DB.
- [ ] API endpoints appear correctly in /docs (OpenAPI) with request
      and response schemas visible.
- [ ] Tests written for the happy path + at least one failure case.
      Booking/payment work also needs a concurrency test.
- [ ] README or module docstring updated if the change affects setup
      or usage.
- [ ] No TODO / FIXME comments left in the diff (either fix them or
      file an issue with a link).
- [ ] Manually verified end-to-end by ME before we merge.

## Working rules
- Follow the sprint order in docs/15. Don't build ahead of the current
  sprint without asking.
- Stop for confirmation between major steps instead of running ahead.
- When a business rule isn't in the docs, ask — don't assume.
- MIGRATION POLICY: add tables incrementally, one Alembic migration
  per module as we build it. Day 1 gets only the core tables (users,
  otp_verifications, password_reset_tokens, arenas, amenities,
  arena_amenities, courts). Do not create booking, payment, review,
  equipment, or other tables ahead of their module. Keep migration
  names descriptive (e.g. "add_bookings_and_time_slots",
  "add_payments_and_refunds") so the history reads as a build log.
  Small schema shifts during implementation are expected; that's the
  reason for per-module migrations.
