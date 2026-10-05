# Session handoff — ArenaHub web restyle + post-restyle new work

Written for a new Claude Code session picking this up cold. Read this whole
file before touching anything. It captures what was done, why, what's
currently in flight, and exactly what to do next.

## Who's who in this project

- **The user (you're talking to)** relays messages between themselves and
  two other people: **Muhammad** (pastes prompts into Claude Code, reports
  results back) and **Umer** (built the original ArenaHub dashboards; needs
  to buy into any design-system decisions since he'll build on top of them
  going forward).
- Two-way relay pattern: instructions arrive already reviewed/decided; when
  something needs a decision only Muhammad can make, say so explicitly and
  stop rather than guessing.

## Project shape

- **Monorepo**: `frontend/web` (Next.js 15, Tailwind v4, shadcn/ui,
  TanStack Query), `frontend/mobile` (Expo/React Native — untouched, out of
  scope for everything below), `backend` (FastAPI + Postgres, `uv` for
  Python).
- Backend runs on port 8000, web frontend dev server on port 3000.
- Git branch for all restyle work: `feat/ui-restyle`. Not yet merged to
  main — merge is gated on sign-off (see "What's next" at bottom).

### Start commands
```
cd backend && uv run uvicorn app.main:app --reload --port 8000
cd frontend/web && npm run dev -- --port 3000
```

### Known infra gotchas (don't rediscover these)
- **Backend drops silently between sessions.** Symptom: Playwright login
  gets a generic "Something went wrong" error. Always check
  `netstat -ano | grep :8000` before an authed test run.
- **Turbopack's dev-server file watcher doesn't reliably hot-reload
  `globals.css` edits.** Restart the dev server to verify any CSS-variable
  change actually landed — a token edit that "did nothing" is usually a
  watcher miss, not a bug in your code.
- **Never run two `npm run build` invocations concurrently** — they race on
  `.next` and produce a bogus ENOENT failure. Same goes for building while
  the dev server is live against the same `.next` dir.
- Full detail on both: `docs/DEVELOPMENT_LOG.md` (top entry).

### Test credentials (real, seeded, confirmed working via live login)
| Panel | URL | Email | Password |
|---|---|---|---|
| Owner | `/login` | `owner@arenahub.pk` | `Owner@1234` |
| Admin | `/admin/login` | `admin@arenahub.pk` | `StrongP@ss1` |

`owner@arenahub.pk` has 5 arenas (4 approved, 1 rejected), 13 courts, 4
pricing rules, bookings across most statuses, 3 reviews (2 unresponded).
Network-wide: 0 arenas currently pending approval, 0 complaints (both
genuinely empty right now, not bugs — don't be alarmed by empty tables
there).

## Part 1 — the restyle (DONE, shipped, closed)

Goal: bring `/owner/*` and `/admin/*` to match two HTML prototypes
(`design/prototypes/arena-hub-owner.html`, `arena-hub-admin.html`) — an
"ink, chalk, floodlight lime" design system. Marketing/auth pages were
explicitly **out of scope** and had to stay pixel-identical throughout.

Executed in strands, always the same discipline: investigate → propose →
get explicit approval → write one atomic diff → verify (`npm run build`
clean, then real Playwright checks — computed styles, screenshots,
interaction tests, keyboard-focus checks — not just "looks right") → pixel-diff
`/`, `/login`, `/register` against a baseline, expect 0 → move on. No
batching, no scope creep, every deferral logged with a reason instead of
silently dropped or silently done.

- **Strand A** — chart color migration (`components/owner/charts.tsx`) to
  runtime-read `[data-theme="arena"]` CSS tokens via `getComputedStyle`
  (Recharts needs literal color strings, `var()` doesn't resolve there).
  Donut chart caps at 5 slices with an "Other (N)" bucket for overflow.
- **Strand B** — typography wire-up: Archivo (display/metrics) + Inter
  Tight (body) scoped entirely inside `[data-theme="arena"]` so
  marketing/auth keep Geist untouched. Found and fixed a real bug along the
  way: `--font-display` wasn't actually reachable from the arena scope due
  to an extra indirection hop — same bug class as a Step-4 finding, one
  layer deeper.
- **Strand B.5** — rebuilt `components/ui/stat-card.tsx` from an icon-chip
  card into the prototype's sparkline-based KPI tile. `history` prop is
  optional (2-point minimum or no sparkline renders); only 2 of 15 KPI
  cards got live sparklines wired (owner Total Revenue, owner Total
  Earnings) because those are the only two with a real time-series already
  in scope — the other 13 ship in the no-sparkline variant, logged as a
  follow-up needing backend work. Removed the dead `tone` prop entirely
  (15 call sites, all literal strings, safe to delete atomically).
- **Strand C** — six targeted structural fixes closing gaps between shipped
  code and the prototypes: Button `outline` variant (card background +
  shadow, not flat), `StatusBadge` leading dot, table row-actions
  hover-fade (`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
  motion-reduce:opacity-100` — the `group-focus-within` matters for
  keyboard a11y, don't drop it), table cell padding, admin arena
  verification page rebuilt from a `<Select>` dropdown to real shadcn Tabs
  with a live pending-count badge, and sidebar restructuring (grouped nav
  with uppercase eyebrow labels + two live count badges: owner Bookings via
  `useDashboardSummary()`, admin Arenas via the same `useArenaQueue`
  query the verification page uses — both are genuinely new fetches, not
  free reads of something already cached, and the code comments above each
  hook call say so explicitly).
  - Two carve-outs to know about: `owner/bookings`' pending-approval row
    actions and `admin/arenas`' Approve/Reject buttons are **intentionally
    always-visible**, not hover-faded — they're primary workflow actions,
    not secondary ones. Don't "fix" this.
  - One thing rejected outright, not deferred: an admin Payments sidebar
    count. The prototype implied an approval workflow that doesn't exist
    in this app (`admin/payments` is read-only, no action buttons at all).
    Logged in `docs/RESTYLE_LOG.md` as a rejection, not a follow-up ticket.

**Read these two docs before assuming anything is missing or broken:**
- `docs/RESTYLE_LOG.md` — regressions/rejections/notable events (includes:
  `app/page.tsx` was rewritten out-of-band mid-strand by someone else,
  invalidating its pixel baseline — not restyle work, don't chase it).
- `docs/RESTYLE_FOLLOWUPS.md` — every deferred item with the exact reason
  and what data/endpoint it's blocked on.

The restyle was formally closed out and confirmed production-quality. Do
not reopen or "improve" it without a specific request — treat it as done.

## Part 2 — post-restyle new work (IN PROGRESS — this is where you pick up)

Muhammad did a manual walkthrough and raised four items. **Investigation
is done for all four; design decisions are partly made; no code has been
written yet.** Current state per item:

### Item 1 — restyle the *real* public `/login` and `/register`
Confirmed: `/login` + `/register` are real live routes, still on the old
blue theme, correctly untouched by the restyle (never in scope before).
**Resolved (current state):** the marketing page (`app/page.tsx`) now links
to `/login` and `/register` (13 CTAs) and has no `login1`/`signup1` links.
`/login1`, `/signup1` and `/admin/login1` are still experiment routes, and
the middleware still redirects to `/login1` and `/admin/login1`. Removing
those routes and fixing the redirects is an open item (W1 in the audit),
not yet done.

### Item 2 — "dashboard doesn't look restyled"
**Closed, confirmed not a bug.** Logged in fresh, landed on `/owner`,
verified live: `data-theme="arena"` present, real `<StatCard>` components
(not legacy cards), Archivo on metrics, ink sidebar, grouped nav with
badges, `StatusBadge` dots — all present and correct. What Muhammad saw was
a genuinely-restyled page in an empty-data state (default date range has
no bookings, so KPIs read "Rs. 0"), *and* it's missing a feature he
expected from the prototype (see item 4) — that combination reads as
"unstyled" even though it isn't. No action needed on this item itself.

### Item 3a — restyle the marketing page (`app/page.tsx`)
Confirmed `app/page.tsx` already IS a full marketing page (nav, hero
slideshow, features, footer) from the out-of-band rewrite — this is a
restyle job, not a build-from-scratch job. **Brand direction approved:**
distinct-but-harmonious treatment, not identical to the dashboard system —
same DNA (ink, paper, lime, Archivo) but lime can be used more freely here
(hero sections, bold CTAs, illustrative accents) since the dashboard's
"lime only means live/approve" restraint is a *dashboard* rule, not a
brand-wide one. **Ready to start once item 1's canonical-pages question is
answered** (so the restyled marketing page's CTAs point at the right
place).

### Item 3b — post-login role-picker for multi-role accounts
**Hold — likely drops out of scope entirely.** Investigated the `User`
model directly (`backend/app/modules/user/model.py`): `email` and `phone`
both have `unique=True`, `role` is a single non-nullable enum column on
the same row. **One identity cannot hold two roles today** — the schema
prevents even registering a second account with the same email/phone.
Zero role-detection logic exists anywhere in the login flow either (both
`/login` and `/login1` hard-redirect to `/owner`, reject non-owners).
Re-asked Muhammad directly whether real users need one login spanning
multiple panels, or whether "confirmed multi-role" just meant "I have
separate owner and admin test accounts and use both" — **waiting on that
answer.** If it's the latter, this item is closed with no code needed.

### Item 4 — "Live board" occupancy grid (real new feature)
**SUPERSEDED — see `docs/RESTYLE_LOG.md`, "Live Board built on `/owner`,
not as its own route."** The (a)/(b) design decisions below (displacing
Dashboard to its own route, the nav-relabel question) were overridden by a
later explicit decision: nav-level-only merge, Live Board stacked above
the existing untouched Dashboard/KPI content on `/owner`, no new route, no
sidebar changes. Live Board has since been built on that basis. The
backend-endpoint finding below (zero backend work needed) is still
accurate and was reconfirmed before building. Left as-is below for
history; do not act on the (a)/(b) plan.

Confirmed this doesn't already exist under another name: `/owner/calendar`
is a *different* view (days-as-columns/hours-as-rows, week/month
scheduling) — the prototype's Live board is courts-as-rows/hours-as-columns,
single night, with a live sweeping "now" line. **Good news: zero backend
work needed** — `GET /owner/arenas/{arenaId}/bookings/calendar?from=&to=`
already returns exactly the right shape (`court_id`, `booking_date`,
`start_time`, `end_time`, `status`); call it with `from=to=today` and the
grid has what it needs. This is a new frontend component + a client-side
timer for the now-line, not a new endpoint.

**Both open design questions answered by the user:**
- (a) **Superseded.** The later decision is a nav-level merge: the Live
  Board sits above the Dashboard KPIs on `/owner`, there is no separate
  dashboard route, and the sidebar has one Dashboard item. See
  `docs/RESTYLE_LOG.md`. Do not move the Dashboard to its own route.
- (b) **Single arena with a prev/next switcher**, not all arenas stacked
  (owner test account has 4 approved arenas). The now-line sweep is the
  component's whole visual hook; stacking four grids dilutes it.

**Status of item 4 (updated):** the nav-rename proposal is no longer needed,
because the Dashboard stays on `/owner` as a merged page and the sidebar
has one Dashboard item. The standalone analytics route is removed, with no
redirect. Live Board is built. Nothing is outstanding on item 4.

## Working style established across this entire project (keep doing this)

- **Investigate before proposing, propose before writing, verify after
  writing.** Never skip straight to code on anything with a design
  decision in it — surface the decision, wait for an explicit answer.
- **One atomic diff per item, shown before it's written**, even for small
  strands. No batching multiple fixes into one diff.
- **Verify against real running state, not assumption.** `npm run build`
  clean is necessary but not sufficient — actually launch Playwright,
  actually log in, actually screenshot, actually check computed styles.
  Several real bugs in this project were only caught this way (a
  literal-quote-corruption typo that broke a build, a `--font-display`
  indirection bug, a stale-baseline pixel diff that turned out to be
  someone else's unrelated rewrite rather than a regression).
- **Every deferral gets logged with a reason** (`docs/RESTYLE_FOLLOWUPS.md`
  for "needs future work," `docs/RESTYLE_LOG.md` for "rejected, or a
  regression/event worth remembering") — not silently dropped, not
  silently done as scope creep either.
- **When something looks like an obvious next step, it usually still needs
  approval first if it involves a design decision.** This project's own
  explicit meta-instruction: "if you find yourself thinking 'the obvious
  layout is X' — stop, propose X, wait for approval." Wireframes/prototypes
  are a ceiling to match, not a license to redesign further; new-feature
  work (like item 4) has *no* wireframe, which makes this rule matter more,
  not less.
- Pixel-diff safety net: `/`, `/login`, `/register` were the three routes
  guaranteed untouched throughout the restyle. `/`'s baseline is now
  invalidated by someone else's out-of-band rewrite (logged, not your
  problem to fix) — treat `/login`/`/register` as the reliable pixel
  checks going forward until item 1 restyles them on purpose.

## Immediate next action for whoever picks this up

1. Write and send the nav-rename proposal for item 4 (Dashboard's new
   route + its new sidebar label). Do not write code yet.
2. Wait for Muhammad's answers on item 1 (canonical auth pages) and item
   3b (real multi-role need vs. two-test-accounts confusion).
3. Once those land: item 1 first (smallest, unblocks item 3a), then item
   3a (marketing restyle, direction already approved), then item 4 (largest
   design surface), item 3b only if Muhammad confirms it's real scope.
