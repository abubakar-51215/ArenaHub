# QA: roles and permissions (what exists, what was shown)

## Implemented roles

| Role | Where it works | How it is created |
|---|---|---|
| Player | Phone app | Self sign-up with email code |
| Owner | Owner web dashboard | Self sign-up with email code (own arenas only) |
| Admin | Admin web dashboard | Never self-served: a database change, then email-code sign-in |
| Arena Admin / Staff | none | **Not implemented.** `UserRole` has only player, owner, admin. Registering with role "staff" is refused (HTTP 422). The docs (`docs/05_USER_ROLES_AND_PERMISSIONS.md`) say owner sub-accounts are deferred. |

## Evidence that the server (not the screen) enforces roles

| What was tried | Result | Test |
|---|---|---|
| 8 admin routes with admin / no token / player / owner | 200 / 401 / 403 / 403 on all 8 | A01 |
| Owner-only route with an admin token and with a player token | 403 / 403 | A01b |
| Register with role "admin"; send `role: admin` in a profile update | Refused; role stays player; no admin row made | A02 |
| Owner B against owner A's arena, courts, slots, bookings, bank details, blocked dates, payments (12 requests: reads, edits, deletes, a receipt reject) | 404 on all 12; arena unchanged | O03 |
| Owner B's own lists, reports and revenue | None of arena A's ids appear | O03b |
| Player B on player A's booking: read, cancel, pass | 404 / 404 / 404 | U03c |
| Player B on player A's payment: events, receipt upload, receipt PDF, by-group | 404 on all | X01 |
| Player approving their own bank receipt; another owner approving it | 403 / 404 | U05e |
| Owner or player calling admin force-refund | 403 / 403 | A03 |
| No token / an invalid token on a protected route | 401 / 401 | O01 |
| A suspended user's sign-in and old token | 401 / 401; reactivation restores sign-in; the action is in the audit log | A02b |

Another person's thing answers 404 (same as a missing thing), so ids cannot be probed. `tests/modules/test_authorization_matrix.py` checks every route in `docs/ROUTES_AND_ROLES.md` the same way.

## Admin permissions seen to work

Users (list, suspend, reactivate, history), arenas (approve, reject, suspend, reactivate), bookings, payments, refunds, force-refund, complaints (status steps), reviews, reports (CSV), settings, audit logs. Owners cannot do any of these.

## Gaps and notes

- Admins are blocked from owner routes (403). The permission model is "admin oversees, owner manages", as `docs/05` says for Manage Courts and Set Pricing.
- Any signed-in role can call the "any signed-in user" routes (for example `GET /bookings`); they only ever return that user's own data.
- No separate staff permissions can be tested because the role does not exist.
