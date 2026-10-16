# Security

Written in simple English. It says what is protected, how, what the checks prove and do not prove, and what is left for later. Nothing here says the system is completely secure: tests passing is not the same as being safe.

## What is protected and how

| Area | What is done |
|---|---|
| Passwords | Hashed with Argon2id (46 MB, 2 passes). Old bcrypt hashes still work and are re-hashed at the next sign-in. 8 to 128 characters; a list of common passwords is refused. A wrong email and a wrong password take about the same time and give the same answer. |
| Emailed codes | 6 digits, single use, stored only as a keyed hash (HMAC-SHA256 with `CODE_HASH_SECRET`), limited tries, limited requests. |
| Access tokens | Signed JWT, algorithm pinned to HS256, must carry issuer, audience, id, type, issued-at and expiry. 15 minutes. |
| Refresh tokens | Random, kept on the server only as a SHA-256 hash with a family id. Each use gives a new one. Using an old one again ends the whole family. A password change or reset, a suspension, a deletion and "log out everywhere" end every session. |
| Wrong passwords | A growing wait per account after 5 failures (never a permanent lock). Admin sign-in has fewer tries. The wait text is "Too many attempts. Try again in N minutes." |
| Audit log | Who, what, when, from which address, which request, and whether it worked: sign-ins and failures, password and email changes, code requests, suspensions, approvals, refunds, "mark paid". No password, code or token is ever written. |
| Notices | A short email to the account owner after a password change or an email change. |
| Roles | Every route is listed in `docs/ROUTES_AND_ROLES.md` (generated from the code). A test calls all of them: no token gives 401, the wrong role gives 403, another person's thing gives 404 with the same answer as a missing thing (so existence is not revealed). |
| Request bodies | Unknown fields are refused. Every text, number and list has a limit. Control characters are refused. The server alone decides prices, discounts, refunds, owners, roles and states. |
| Safe retries | `Idempotency-Key` header on booking creation, payment start and receipt upload: a retry gives the same answer, not a second booking. A slot is protected by a Redis lock and a database row lock; two people racing for one slot get one success and one 409. |
| Extra limits | On top of the unchanged address limits (100 a minute, sign-in 20): per person per hour on bookings (30), payments (30), complaints (10), matches (20), uploads (40), assistant (60), arenas (10 a day); smart search per address (120 per 10 minutes). |
| Uploads | JPEG, PNG or WebP only; the real file type is checked from the first bytes and by decoding; 5 MB; at most 40 million pixels; random server-made name; picture is re-saved without EXIF (location, device); served with `nosniff` and a policy that stops it running as a page. A receipt address must be one our own upload returned. |
| Payments | Card: Stripe's hosted page, so no card number reaches ArenaHub; the booking is confirmed only by Stripe's signed webhook (amount and currency checked). Wallets: the number is checked as a Pakistani mobile number and only masked in logs and history; confirmed only by the provider's signed callback. The "back to the app" route forwards only to app addresses (no open redirect). Starting a payment locks the booking, so parallel taps make one payment. The test card page and wallet buttons exist in development only. |
| Outside calls | The server never fetches an address a user gives. Its only outside calls are: Google (checking a sign-in token), Expo push (fixed https address), the email server, and payment providers (fixed). |
| Headers | `nosniff`, `no-referrer`, `DENY` framing, `no-store` on API answers, HSTS outside development. Production: only listed hosts, no `/docs`, `/redoc` or schema. CORS lists exact origins (no wildcard with credentials). |
| Limits | 1 MB request body (6 MB for a picture), 30 s request time (90 s for a picture), page size at most 100, calendar range at most 93 days, reports at most 5000 rows. |
| Errors and logs | Friendly or generic text only; no stack trace, SQL or file path in an answer. Log values named password, token, secret, authorization, cookie, account, code and similar are hidden outside development. The emailed code is logged in development only. Every answer and log line carries a request id. |
| Start-up | Outside development the server refuses to start with default or short secrets, debug on, mock payments, a wildcard host or origin, or non-https origins. It names the problem and never prints a value. |
| Web | Content-Security-Policy, no framing, permissions policy, no script eval in a built site, HSTS, role guard on `/owner` and `/admin`. |
| Phone | Tokens in the phone's secure store; plain http only in development builds; deep links only open known screens and refuse climbing paths; no secret in the bundle (only the public API address and public Google client ids). |

## OWASP API Security Top 10 (2023)

| Item | Where it is handled |
|---|---|
| API1 Broken object-level authorization | Ownership checks in every service; the matrix test (cross-account, 404 not 403). |
| API2 Broken authentication | Argon2id, short tokens, rotating refresh tokens, growing wait, audit log, start-up checks. |
| API3 Broken object property level authorization | Response models without hashes; request models refuse unknown fields. |
| API4 Unrestricted resource consumption | Address limit, per-person limits, body size, time limit, page size, picture size and pixels. |
| API5 Broken function-level authorization | Role guard on every route; the matrix test for wrong roles. |
| API6 Unrestricted access to sensitive business flows | Idempotency, slot locks, per-person limits on bookings, payments and complaints. |
| API7 Server-side request forgery | No user-given address is ever fetched. |
| API8 Security misconfiguration | Headers, trusted hosts, CORS list, docs off, start-up refusals, generic errors. |
| API9 Improper inventory management | `docs/ROUTES_AND_ROLES.md` generated from the code; schema off in production. |
| API10 Unsafe consumption of APIs | Google tokens checked (signature, audience, issuer); payment webhooks need a valid signature and the right amount (tests in `test_payment.py`). |

## What the checks prove, and what they do not

They prove: the listed behaviours work as tested (backend test suite, the route matrix, hostile-text tests, header tests, migration up/down on throwaway databases, dependency audits at the time they were run).

They do not prove: that there are no other bugs; that real email, real payment providers, a real phone or a real production server behave the same; that a determined attacker cannot get in. Many checks run against fakes (fake Redis, fake email) and a single database connection, so true parallel load is not covered by the test suite.

## Remaining risks (see the final report for severity)

- **Web sign-in tokens live in the browser's local storage.** A script injected into the page could read them. Moving them to httpOnly cookies needs CSRF protection and depends on the final web address (cookie domain), which is not chosen. Waiting for the owner.
- **Receipt pictures** are private now: the public `/uploads` folder refuses `receipts/`, and a receipt is shown only through a 15-minute signed link (`/api/v1/media/receipts/...`) handed to the player, the arena owner or an admin. Anyone holding a link can open it until it ends, so links must not be shared or logged. Production storage for pictures is still a go-live blocker (see `docs/BEFORE_GOING_LIVE.md`).
- The web Content-Security-Policy still allows inline scripts (the framework needs them). A nonce-based policy is later work.
- Some dev-tool packages in the web and phone apps have known issues; their fixes are major version changes (see the audit list in the report). They do not ship to users.
- Money columns are exact decimals, but the database has no CHECK that an amount is not negative; the code never writes one.
- No certificate pinning and no biometric lock on the phone (later items, deliberately not built).
- Independent security review and penetration test before real payments: not done.

## Dependency review (2026-10-16)

- **Backend (pip-audit):** no known vulnerabilities after upgrading pyjwt, anyio and urllib3.
- **Web (npm audit): 11 high, 0 critical.** Next.js was moved to 15.5.28 (fixed the critical ones). What is left sits in tools that run while building or developing, not in the pages sent to people: `eslint-config-next` / `@next/eslint-plugin-next` (lint), `shadcn` and its `@shadcn/registry`, `ts-morph`, `fast-glob`, `micromatch`, `braces` (the component CLI), `postcss` and `sharp` as pulled in by the build. Their fixes are major versions (Next 16, shadcn 1.x line) and need their own upgrade round with full testing.
- **Phone (npm audit): 26 high, 0 critical.** All come through the Expo and React Native toolchain: `@expo/cli`, `metro*`, `jest*`, `babel-jest`, `image-size` (asset sizes at bundle time), `node-forge` (Expo code-signing certificates), `@react-native/community-cli-plugin`. `expo`, `react-native`, `react-native-reanimated` and `@react-native-google-signin/google-signin` are listed only because they depend on those tools. The fix offered is a forced downgrade to Expo 44, which is wrong; the right fix is the next Expo SDK upgrade.
- Decision needed later (not made here): when to schedule the Next 16 and the next Expo SDK upgrades.

## Later items

Certificate pinning (phone), biometric unlock (phone), nonce-based CSP (web), httpOnly cookie sessions (web), database CHECK constraints for amounts, a separate migration user and a least-privilege app user (see below), alerting on audit-log patterns.

## Database users (least privilege)

Production should use two database users, neither a superuser: one for migrations (may create and alter tables) and one for the running app (select, insert, update, delete on the tables and use of the sequences; no create, drop or alter rights). Backups must be encrypted and a restore must be tested regularly. The development database roles were not changed.

## How to run the checks

`backend/.venv/Scripts/python scripts/security-check.py` runs: pip-audit, bandit, npm audit (web and phone), a secret-pattern scan of tracked files, a check that no `.env` is tracked, the header check against a running local backend, and the production start-up refusal check. Each step has a time limit.
