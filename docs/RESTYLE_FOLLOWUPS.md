# Restyle follow-ups

## Stuck worktree directory needs manual cleanup

`E:\summerr\ArenaHub-worktree-84442f0` (a `git worktree` created for G0c-2b-fix's
numeric gallery re-check against the `84442f0` commit, holding its own
`npm install` for that purpose) is already removed from git's own tracking
(`git worktree remove` + `git worktree prune` both ran clean; `git worktree
list` no longer shows it), but the directory itself won't delete —
`frontend/mobile` inside it reports "Device or resource busy" on every
retry, with no process found holding it (`Get-CimInstance Win32_Process`
checked). Likely a transient Windows file-lock (antivirus scan, Explorer
indexing) rather than anything real. Harmless either way: it's outside the
repo's tracked paths and git no longer considers it a worktree. Needs a
manual `rmdir /s` (or a reboot-then-delete) at some point, not urgent.

## Auth photo panel — admin's photo is a repurposed asset, not a purpose-built one

Resolved during Item 1a's photo-panel rebuild: admin sign-in uses
`/images/login-arena.jpg` (a floodlit night-pitch shot, already the live
app's current `/admin/login` photo pre-redesign) rather than reusing
`court-signup.jpg` (which owner-signup also uses) — picked for resolution
(1600×1064, same class as the other two auth photos; the other unused
candidate, `hero-arena-bright.jpg`, is only 700×584 and would visibly
upscale-blur at the panel's real desktop size) and to keep owner and admin
visually distinct. It isn't thematically "control tower" in any literal
sense, though — it's a repurposed pitch photo, same as the owner ones are
repurposed court photos. If a genuinely admin/oversight-themed photo becomes
available later (a stadium control room, a wide multi-court complex, etc.),
swap it in — the `imageSrc` prop on `SplitAuthShell` makes this a one-line
change on the `/admin/login` page, no component work needed.

## Marketing hero photo — `hero-arena-bright.jpg` is reserved for Item 3's hero, not orphaned

Corrected after an earlier pass here wrongly wrote this off as "likely
orphaned" using the auth panel's resolution bar (unsuited at that near-
full-viewport-height size) without checking the hero's actual, much smaller
box. It's live in the app right now — `app/page.tsx`'s current marketing
hero uses it today, not hypothetically.

Checked `arena-hub-welcome.html`'s own CSS: `.hero-side` sits inside
`.wrap{max-width:1180px;padding:0 28px}` and `.hero-grid`'s `1.05fr .95fr`
split with a 40px gap, capping the hero-side box at ≈515×618 CSS px
(aspect-ratio 5/6) on wide desktops, or ≈864×486 (16:9) just under the
920px tablet breakpoint — nothing close to the auth panel's near-`100vh`
box. At 700×584, covering the desktop box needs only a ~6% upscale; the
16:9 tablet-breakpoint worst case needs ~23% — both mild, neither
disqualifying the way the auth panel's size did.

The open question isn't resolution, it's content: `arena-hub-welcome.html`
currently specifies `court-login.jpg` for its hero instead of this asset.
Whoever picks up Item 3 should decide explicitly whether to follow the
prototype's choice (in which case `hero-arena-bright.jpg` does end up with
no remaining reference, and can be deleted then) or reuse this
already-live, resolution-appropriate photo instead — both are viable on
technical grounds; it's a content call, not something this note should
pre-decide.

## Pixel-diff baseline coverage gap — /admin/login and the dashboards

Surfaced during Item 1 verification (rewiring `/login` onto `SplitAuthShell`),
not caused by it. No baseline PNG was ever captured, at any point in this
project, for `/admin/login`, `/owner/*`, or `/admin/*`. Every strand's
"protected pages" pixel-diff has only ever covered `/`, `/login`, `/register`
(pre-Item-1) and, as of Item 1, `/forgot-password` + `/reset-password`.
`/admin/login` and the dashboards have only ever gotten live-state spot-checks
(computed styles, screenshots eyeballed) — real verification, but not a
stored reference image a future change can be diffed against. Establishing
baselines for these would close the coverage gap for future work; not
blocking anything today since nothing currently touches them.

## Sidebar count badge — Reviews (owner)

Deferred from Strand C item #6 (sidebar structure). The prototype's owner
sidebar shows a "Reviews (3)" badge for reviews awaiting an owner response.
Requires backend work — needs an endpoint that returns the count of reviews
without a response (or a filter on the existing `listArenaReviews` endpoint),
aggregated across all of an owner's arenas. `listArenaReviews` today is
per-arena with no response-status filter, so this can't be derived from
currently-fetched data without N per-arena queries client-aggregated. Pill
styling in the sidebar is ready to consume the count the moment data becomes
available — this is a data gap, not a UI gap.

---

Deferred from the Strand B.5 KPI-card rebuild — these 13 cards ship in the
no-sparkline variant because the backend doesn't return a time series for
them yet. Each needs the endpoint extended before a `history` array can be
wired.

## Owner dashboard — `GET /owner/dashboard/analytics`
- **Total Bookings** (`app/owner/page.tsx`) — needs a day-over-day bookings-
  count trend. `bookings_by_time` exists but is an hour-of-day histogram for
  the selected range, not a per-day series — wrong axis, can't be reused.
- **Peak Hours** (`app/owner/page.tsx`) — value is a time-range string, not
  a number; not sparkline-shaped even in principle.
- **Occupancy Rate** (`app/owner/page.tsx`) — needs a day-over-day occupancy
  trend field.

## Owner revenue — `GET /owner/dashboard/revenue`
- **Collected So Far** (`app/owner/revenue/page.tsx`) — derived client-side
  from `totalEarnings - pendingPayout`; needs a real collected-amount trend
  field if a sparkline is ever wanted here.
- **Pending Payout** (`app/owner/revenue/page.tsx`) — snapshot value only;
  needs a pending-balance-over-time field.

## Admin dashboard — `GET /admin/dashboard`
`DashboardMetrics` is entirely flat scalars today — no trend arrays, no
change-percent fields at all. All four cards below need both a history
array *and* a delta field added to the endpoint:
- **Total Users** (`app/admin/(dashboard)/page.tsx`)
- **Total Bookings** (`app/admin/(dashboard)/page.tsx`)
- **Total Revenue** (`app/admin/(dashboard)/page.tsx`)
- **Active Arenas** (`app/admin/(dashboard)/page.tsx`)

## Admin reports — `GET /admin/dashboard` (same endpoint, reused)
Same gap, same endpoint, same fix would cover both pages at once:
- **Total Bookings** (`app/admin/(dashboard)/reports/page.tsx`)
- **Total Revenue** (`app/admin/(dashboard)/reports/page.tsx`)
- **Active Users** (`app/admin/(dashboard)/reports/page.tsx`)
- **Total Arenas** (`app/admin/(dashboard)/reports/page.tsx`)

---

## NEEDS BACKEND FIX BEFORE DEMO — card payments return 500 (FR06)

`POST /api/v1/payments/initiate` with `payment_method: "card"` returns
`500 Internal server error` (empty `errors`) in the local dev environment. The
same booking group initiated with `jazzcash` succeeds (`200`, payment created),
and `easypaisa` then correctly refuses with `409 payment already exists`, so
the failure is specific to the card path and happens before a payment row is
written. The mobile Payment screen lists "Credit / Debit Card" first and
preselects it, so a player hitting Pay with the default method fails.

Not caused by, and out of scope for, the restyle. Not fixed here. Unknown
whether it's missing Stripe config locally (`STRIPE_SECRET_KEY` is optional in
`core/config.py`) or a code bug in the card branch of `payment/service.py`;
needs the backend logs to tell. Must be resolved or explicitly worked around
before any demo that pays by card.

---

## HIGH PRIORITY backend ask — `GET /arenas` needs `avg_rating`, `review_count`, `min_price`

The arena list/search response (`GET /arenas`, `/arenas/trending`,
`/recommendations`, `/arenas/liked`) has no rating, review count or price. The
approved designs show all three on every arena card and row ("4.6 (230)",
"₨ 1,200/hr"). Getting them today means one `reviews/summary` call and one
courts call per arena, which hits the 429 rate limiter and is slow, so the
mobile list cards **omit them** (nothing is faked) until the list returns:

- `avg_rating` (nullable), `review_count`, and `min_price` (lowest court
  `base_price`) on every arena in list responses.

Distance ("2.3 km") is omitted entirely: the app has no user location beyond
the detected city. Without these fields the Home, Search, Liked and Trending
cards lose their two most visible elements. Small change, owned by whoever owns
the arena list. Arena details and Booking summary still show rating and price
because they load a single arena.

---

## Player app — wireframe-vs-backend gaps (backend and web)

Decision (Muhammad): no dead controls. Where the approved wireframe
(`design/wireframes/Users.PNG`) shows something the backend can't serve, the
mobile restyle leaves current behavior as it is and logs the gap here.

| Wireframe screen | Wireframe element | Backend reality |
|---|---|---|
| 1 Login / Signup | Google and Apple sign-in buttons | No OAuth endpoint in `auth/api.py` (register, verify-otp, resend-otp, login, refresh, logout, forgot/reset-password only). |
| 3 Search & Filters | Search radius, time-of-day, amenity filters | `GET /arenas` takes only `q`, `city`, `sport`, `price_min`, `price_max`, `sort`. No radius, time-of-day or amenity parameter. Amenities exist on the arena response but aren't filterable. |
| 8 Booking Confirmation | "Add to Calendar" | **Not a gap.** Device feature: implemented client-side with `expo-calendar` (SDK 54 bundled), in its own diff in the booking-flow group. Listed here only because the wireframe-vs-backend table originally had it. |
| 6 Booking Summary, 7 Payment | "Taxes & Fees" / "Tax & service" line (wireframe and prototype) | No tax or service-fee concept in booking pricing (`slots_subtotal + equipment_total − discount_amount = total`). The line is removed from the mobile screens. |
| 2 Home, 3 Search | "Football" sport chip | The backend's sport values are free text (`sports_offered: list[str]`, no enum). The dev data has `futsal` (9 arenas), `cricket`, `padel`, `badminton`, `tennis`, and no `football`; `GET /arenas?sport=football` returns 0. The docs list Football and Futsal as separate sports, and only the NLP search aliases football→futsal. The mobile chips use the backend's own values. Needs a decision on the sport taxonomy. |
| 13 Profile & Settings | "My Addresses" | No addresses entity. Stays the existing "Coming soon" alert, as do Help & Support and Terms. |

Dropped from the HTML prototype because the wireframe doesn't show them (not
gaps): off-peak promo banner, "Tonight at a glance", deal pills, "2nd hour 20%
off", referee/bibs chips, cash-at-arena, QR / "works offline", Cancelled tab,
"Rebook" card, profile stat tiles, review tag breakdown, per-player match price.

## Player app — defects found while getting the first mobile baseline

Pre-existing, not caused by the restyle. Found booting `npx expo start --web`
and walking every screen (`design/baselines/mobile/`).

- **Card payments 500** — see "NEEDS BACKEND FIX BEFORE DEMO" above.
- **Dev CORS allowlist is `:3000` only** (`backend/app/main.py`). Mobile web on
  `:8081` is blocked. Native builds ignore CORS, so this only affects the web
  verification route. The baseline harness injects the headers instead of
  changing backend code.
- **Relative avatar URL 404s.** One baseline run requests
  `/uploads/misc/<hash>.png` against the Expo origin; a stored image URL is
  relative and isn't prefixed with the API base.
- **Stack screens with no `Stack.Screen` entry get a second, default header
  showing the raw route name** (`play/[matchId]`, `play/create`,
  `profile/liked`, `profile/payments`, `profile/settings`,
  `profile/change-password`, `booking/reschedule/[bookingId]`) on top of their
  own custom header. Fix belongs in the restyle (`app/_layout.tsx`).
- **Brief `/health` flash after login.** The route resolves to the Backend
  Health screen for a moment before `router.replace('/(tabs)')` lands.
- **Backend rate limiter (429) trips on scripted multi-call surveys.** Throttle
  any fixture or capture script.

---

## NEEDS BACKEND — login is case-sensitive on the email local-part

Found during G1 auth investigation, confirmed live against the dev backend
with two real register/login calls. Pydantic's `EmailStr` (`email-validator`)
lowercases the domain and strips whitespace, but **preserves the local-part's
case** — so `Sara.Khan@example.com` and `sara.khan@example.com` are stored and
matched as different accounts/logins. Registering with one case and then
logging in with another (a very ordinary thing for a user to do — email
clients and autofill both vary case) fails with a normal "invalid
credentials" error, indistinguishable from a real wrong password.

The client must not lowercase or trim, as you found — that would just move
the bug (two client installations could then disagree with each other, and
it wouldn't fix already-registered mixed-case rows). This needs a server-side
fix: lowercase the local-part (or the whole address) consistently at both
register and login before it's used as a lookup/uniqueness key, plus a
data-migration note for existing rows that were stored with mixed case under
the current behavior (an existing user could otherwise be locked out once the
server starts normalizing only at the comparison step, if two mixed-case rows
for the same real address already exist). Flagging for you rather than fixing
client-side since the correct fix is backend-owned.

## Phone-number OTP is not implemented (FR-P-01 says "email or phone")

`backend/app/modules/auth/service.py` only ever sends the OTP by email
(`send_otp_email`); there is no SMS/phone-OTP code path anywhere in the auth
module, and the Sign-up schema's phone field has no format validation beyond
length. FR-P-01 describes verification as "email or phone" — today it's
email-only. Not blocking the restyle (the OTP-verify prototype frame matches
the email-only reality, not the FR doc), but logging the gap since the FR
text and the implementation disagree.

## Leftover test account — `CaseTest_g1@example.com`

Created live against the dev database while empirically confirming the
case-sensitivity bug above (one register + one login call, repeated with a
different case). It's a real row in the dev `users` table now. Logging it
here rather than deleting it — don't delete it without being told how
(unsure whether dev-DB cleanup here is a raw delete, a soft-delete flag, or
something that needs to go through a script so it doesn't desync anything
else keyed off it).

---

## NEEDS BACKEND — expose Retry-After over CORS for web clients

The rate limiter (`backend/app/middleware/rate_limit.py`) returns a 429 with a
`Retry-After` header. Browsers only let JavaScript read a response header
across origins if the server lists it in `Access-Control-Expose-Headers`, and
the dev CORS setup doesn't. So a web client on another origin sees the 429 but
gets no `Retry-After` value. The client then can't show "Try again in {n}s."
and falls back to a generic message.

Ask: add `Access-Control-Expose-Headers: Retry-After` to the CORS middleware
configuration. Native apps are unaffected, since they ignore CORS and read the
header directly.

---

## Node version mismatch (decision: leave engines as is)

`package.json` declares `"engines": { "node": ">=20 <21" }`, but the working
machine runs Node 22.22. Installs and builds work on 22, so the mismatch is
only a declaration problem. Left unchanged for now. Decide whether to move
the engine range to 22 or to pin Node 20 for the team.

## DECISION NEEDED before any push to main — remote main diverges

The remote `dest/main` has three commits this branch does not have:

- `3c7af33` Merge pull request #2 from Castro-Qadri/prototype-screens-merged
- `a669f87` Merge prototype-screens into main (keep main files, add prototype screenshots)
- `a6fb12c` Snapshot: overwrite remote with current workspace

The third commit replaces the remote workspace with an older snapshot, so
its web and design files differ from this branch. Nothing has been pushed
and nothing has been reconciled. Decide how to reconcile before anything
goes to `main`.

---

## Web: chart fallback colours are literal hex (left as is)

`components/owner/charts.tsx` keeps `FALLBACK_COLORS` as literal hex values.
They match the arena theme tokens and are only used if the runtime read of
the tokens fails, so they were left unchanged. A one-line comment now says so.

## Web: login lands on /login1 after a successful sign-in (root cause found)

Cause: each login page calls `router.prefetch` for its dashboard when it
loads. At that moment there is no session cookie, so the middleware answers
that request with a 307 to `/login1` (or `/admin/login1`), and the router
caches that redirect. After a successful sign-in, `router.replace("/owner")`
(or `/admin`) uses the cached redirect and lands on the login page.
Proved by blocking only the pre-login request: owner and admin then land on
`/owner` and `/admin`. Moving the middleware targets to `/login` alone would
only cache a redirect to `/login`. The fix is to stop the early request (or
make it after sign-in) and to point the redirects at `/login` and
`/admin/login`; the client guards in `owner/layout.tsx` and the admin
dashboard layout also still send visitors to `/login1`.

**Resolved.** The two `router.prefetch` calls are removed, the middleware and both client guards
redirect to `/login` and `/admin/login`, and the `login1`, `signup1` and `admin/login1` experiment
routes are deleted.

## BROKEN — `backend/scripts/seed_dummy_data.py` fails on the current schema

Running it against a freshly migrated database stops at the equipment insert:

```
asyncpg.exceptions.CheckViolationError: new row for relation "equipment" violates
check constraint "ck_equipment_ck_equipment_rental_price_positive"
DETAIL:  Failing row contains (..., First Aid Kit, On-court injury kit, 0.00, 2, 2, t, ...)
```

Cause: the `equipment` table now has `CheckConstraint("rental_price > 0")`
(`app/modules/equipment/model.py`), but the seed's `EQUIPMENT` table lists
`("First Aid Kit", "On-court injury kit", Decimal("0.00"), 2, 2, True)`
(`scripts/seed_dummy_data.py`, line 552). The check fires, the whole seed
transaction rolls back, and nothing is seeded.

Fix needed (not applied): either give the kit a real price (for example
`Decimal("50.00")`), or drop the item from `EQUIPMENT`; free items are not
allowed by the model. Check `EQUIPMENT_V2` for the same pattern. Until then
the Dashboard was verified against a purpose-written seeder on the scratch
database `arenahub_scratch` (never the dev database).

## NEEDS BACKEND — admin cannot suspend, reactivate or delete an arena

The admin Arenas page (`/admin/arenas/all`) only offers what the backend
supports today: open the detail (`GET /admin/arenas/{id}`) and, for a pending
arena, "Review" (goes to Approvals). There is no admin endpoint to suspend,
reactivate or delete an arena. `arenas.is_active` exists, but the owner sets it
(`deactivate_arena`, and the owner update request carries `is_active`), so an
admin suspension stored there could be undone by the owner. Proposed design,
not built:

- **Routes.** `POST /admin/arenas/{id}/suspend` (body `{reason}`, required),
  `POST /admin/arenas/{id}/reactivate`, `DELETE /admin/arenas/{id}`. Admin only,
  same shape as the user suspend/reactivate/delete routes.
- **Status values.** `ArenaStatus` (pending / approved / rejected) is unchanged: suspension and deletion are separate flags, so an approved arena can be suspended without losing its approval.
- **Data.** One migration: `arenas.suspended_at` (timestamp, null),
  `arenas.suspended_reason` (text, null), `arenas.deleted_at` (timestamp,
  null). Public search, arena detail and booking creation add
  `suspended_at IS NULL AND deleted_at IS NULL` next to the existing
  `status == approved AND is_active` checks. The owner cannot clear these
  columns.
- **Effect on bookings.** Suspend: no new bookings; future confirmed or pending
  bookings are cancelled through the existing `cancel_booking` path as a
  platform cancellation with a 100% refund (not the arena's refund tiers),
  each player notified. Past and completed bookings are untouched. Reactivate:
  bookable again; cancelled bookings stay cancelled. Delete: same as suspend,
  then a soft delete (`deleted_at`) so bookings, payments, refunds, reviews and
  audit rows that reference the arena stay intact, as `delete_user` does for
  accounts.
- **Effect on the owner.** The owner account stays active; their other arenas
  are unaffected. The owner still sees the arena in their panel, marked
  "Suspended by Arena Hub" with the reason, read-only; a deleted arena
  disappears from their list.
- **Audit log.** `record_audit` with `arena.suspend` (reason in details),
  `arena.reactivate`, `arena.delete`, target type `arena`, plus the count of
  bookings cancelled.
- **Notifications.** New owner templates `arena_suspended` (with reason),
  `arena_reactivated`, `arena_deleted`; players with cancelled bookings get the
  existing cancellation notification with refund details.
- **Tests.** Admin-only access; owner cannot re-activate a suspended arena;
  suspended arena hidden from search and unbookable; future bookings cancelled
  with full refund, past bookings untouched; audit rows written; delete keeps
  bookings and payments readable.

## NEEDS BACKEND — no admin password reset for players or owners

The Players and Arena owners pages offer View, Suspend/Reactivate and Delete.
"Reset password" is left out: there is no admin endpoint for it. If wanted,
the safe shape is `POST /admin/users/{id}/send-password-reset`, which sends the
user the normal reset email/code (the admin never sees or sets a password),
bumps the session epoch, and writes `user.password_reset_sent` to the audit
log. It should land after the parked OTP reset work, which it reuses.

## PROPOSAL — two-factor sign-in for the admin panel (not built)

The admin login has Work email and Password only; the "Authenticator code"
field is deliberately not added. Two options:

| | (A) TOTP authenticator app | (B) Emailed 6-digit code |
|---|---|---|
| How it works | Admin scans a QR code once; each sign-in asks for the 30-second code from the app | After the password, a 6-digit code is emailed; the admin types it in |
| Reuses | Nothing existing; new `pyotp` dependency | The OTP table and code path, with purpose `admin_login` |
| Migrations | One: `users.totp_secret` (encrypted), `users.totp_enabled_at`, plus a recovery-codes table | None beyond the parked OTP purpose migration (`b7d2f4a9c1e3`); `purpose` is `String(20)`, so `admin_login` fits |
| Screens | Enrolment (QR + confirm code + recovery codes), code step at sign-in, recovery-code entry, admin reset of a lost device | One code step at sign-in with resend and expiry message |
| Effort | About 3–4 days with tests | About 1–1.5 days with tests |
| Security | Strong: not phishable by email takeover; works offline; secret must be encrypted at rest | Weaker: as strong as the admin's mailbox; email delay; still blocks password-only attacks |
| Operations | Lost phone needs a recovery path | No enrolment; nothing to lose |

Recommendation: **(B) first**. It needs no new migration beyond the OTP work
already waiting, reuses tested code, and closes the password-only gap in
about a day. Plan (A) as the later upgrade for when there are more admins.
Both need the existing auth rate limit (20/min) on the code step, a 10-minute
expiry, 5-attempt lockout, and an audit row for each admin sign-in.

## DECISION NEEDED — prototype palette contrast (admin)

A WCAG sweep of every admin route, light and dark, plus the command palette,
the alerts popover and a dialog (4.5:1 for text, 3:1 for large text) finds
these failures. Every one comes from the admin prototype's own colours, which
were copied exactly and are kept as they are until the owner decides.

| Where | Text / background | Ratio | Theme |
|---|---|---|---|
| Muted text on cards: eyebrows, sub-lines, table heads, search placeholder, KPI foot, empty states | `--muted` #79857E on #FFFFFF | 3.84 | light |
| Muted text on the page background: page sub-line, date eyebrow | #79857E on `--paper` #F1F2EF | 3.42 | light |
| Muted text on a soft fill (hovered row, chips) | #79857E on `--line-soft` #EDEFEB | 3.32 | light |
| Rail group labels ("Oversight") and "Admin" under the name | #5D6E64 on `--rail` #0F1A15 | 3.29 | light |
| The same | #5D6E64 on dark `--rail` #0D1410 | 3.45 | dark |
| "Pending" badge (`.b-wait`) | `--amber` #D9930B on `--amber-wash` #FDF3DC | 2.34 | light |
| "Completed" / "Active" badge (`.b-ok`) | `--lime-deep` #7FA30F on `--lime-wash` #F2FBDA | 2.74 | light |
| "Cancelled" badge (`.b-off`) | `--red` #CF4141 on `--red-wash` #FBE9E9 | 4.00 | light |
| The same | #CF4141 on dark `--red-wash` #2C1616 | 3.64 | dark |
| Destructive text button ("Delete User") | #CF4141 on dark `--card` #121A16 | 3.79 | dark |
| Row actions at rest (`.row-actions{opacity:.35}` until hover or focus) | e.g. Suspend 1.79, Delete 1.67 light; 2.14 / 1.44 dark | <2.2 | both |
| "Platform admin" under the brand on the sign-in page (`.brand-name small` keeps `--rail-text`) | #A9B5AE on #FFFFFF | 2.12 | light |

Not counted as failures: disabled pager arrows (disabled controls are exempt)
and the visually hidden "Close" label inside dialogs (sr-only).

Fixed in our code (not prototype colours): the hint text on a selected
palette row now uses `--text-2` (it was #7C8981 on #1B2520, 4.32, in dark;
#79857E on #EDEFEB, 3.32, in light). The old Reviews page hides its row
buttons at opacity 0 until hover; that is fixed when Reviews is restyled.

Proposal for the owner (not applied): darken the muted text by a few points
of lightness, keeping its hue.

- `--muted` #79857E -> **#656F69**: 5.21 on white, 4.64 on paper, 4.50 on
  line-soft. (#67716B is the lightest value that passes on white and paper.)
- Rail labels #5D6E64 -> **#708579** (4.51 on #0F1A15) and **#6E8276** for
  dark (4.55 on #0D1410).
- Badge text: use a darker ink of each hue on its wash (for example amber
  #8A5D05, which the prototype itself uses for `.blk-wait` and `.ev-c` text;
  a lime-deep around #5C7A05; red around #B12F2F), or keep the badges as
  they are, since each has a coloured dot and is not the only cue.
- Row actions: show them at full opacity, or at least 0.6, which still
  reads as quiet.

## Existing bug — the web app crashes when browser storage is fully blocked

With `localStorage` access blocked entirely (some privacy modes, or storage
disabled by policy), every page throws on load:
`TypeError: Cannot read properties of undefined (reading 'rehydrate')`.
The auth store is created with zustand `persist(...)`; when storage is not
available, `useAuthStore.persist` is undefined, and `components/providers.tsx`
calls `useAuthStore.persist.rehydrate()` unconditionally. Found while proving
that the admin dark theme survives blocked storage (the theme code itself
wraps every storage access and does not throw). Fix needed (not applied):
guard the call (`useAuthStore.persist?.rehydrate()`) and give the store a
storage adapter that falls back to memory.

## Decision — `viewport-fit=cover` is not enabled

The admin slim bar and drawer pad themselves with
`max(<normal>, env(safe-area-inset-*))`, so they respect the notch and the
home indicator. Those insets are only non-zero on a page that sets
`<meta name="viewport" content="..., viewport-fit=cover">`. That meta tag is
app-wide in Next.js, and turning it on would let every owner and public page
draw under the notch on iPhones, so it is left off. Without it the browser
already keeps all content inside the safe area. If it is ever enabled, the
admin padding is ready; the owner and public layouts would need the same
padding first.

## Follow-up — arena suspend / remove: refunds go out inside the cancel transaction

When an admin suspends or removes an arena, every upcoming booking is
cancelled and its refund is sent to the payment gateway inside the same
database transaction (`booking.service.cancel_future_bookings_for_arena`).
If a database error happened after some refunds had already gone out, the
transaction would roll back: the bookings would come back as confirmed, and a
second attempt would create new refund rows with new ids, so the gateway's
idempotency key (the refund id) would not stop a second refund. The risk is
low today (the loop is short and only adds rows), and a gateway failure on its
own is already safe (the refund stays pending and is retried). Later fix:
commit per booking (cancel, refund, commit, then the next), or create the
refund rows first and send them to the gateway only after the commit.

## Follow-up — open matches at a suspended or removed arena

Matches carry no payment and no booking (`match` has no link to either), so
no player has paid anything through a match and nothing needs refunding when
an arena is suspended or removed. But an open future match at such an arena
stays in the open-match list and can still be joined: only `create_match`
checks that the arena is live; `list_open_matches` and `join_match` do not.
Not built. Suggested: hide those matches from the open list and refuse a join
while the arena is not live (or cancel them and notify the joined players).

## Done (2026-10-08) — no theme switch, alerts or search button below 1024 px

Fixed: the slim bar now carries search, theme and alerts on every admin screen below 1024 px.
Ctrl+K does nothing while the phone drawer is open, so the palette never opens over it.
The original note:


The admin top bar (search button, alerts bell, theme switch) is shown on the Dashboard only, and
only at 1024 px and wider. On a phone or tablet an admin cannot switch theme, open the alerts
list, or open search by touch (Ctrl+K works with a keyboard). The theme they picked on a wide
screen is kept. Options: put the three buttons in the phone slim bar or at the foot of the
drawer.

## Existing behaviour — a fully refunded payment still reads "Completed" on admin Payments

A full refund advances the payment's `lifecycle_status` to `refunded`, but the admin Payments
status column shows the separate `status` field, which stays `completed`. Seen after suspending
an arena whose JazzCash booking was refunded in full. Not changed (no backend work during the
UI phase). Options: show `lifecycle_status`, or move `status` to `refunded` together with it.

## Note — the owner side of arena moderation is minimal by design

The owner Arenas list shows "Suspended by admin" or "Removed by admin" with the reason and
disables Edit, Resubmit and Deactivate. The "Manage" link to the courts of that arena stays
active; slot generation is refused by the API for a suspended or removed arena. A fuller owner
view (a banner on every owner screen for that arena, a way to contact support) is not built.

## Follow-up — owner pages make many API calls; the limit is 100 a minute per IP

**The limit.** `RATE_LIMIT_API_PER_MINUTE` = **100** requests a minute
(`backend/app/core/config.py`; sign-in routes have their own 20). It is a
fixed 60-second window counted **per client IP**
(`backend/app/middleware/rate_limit.py`), not per user. Nothing changed here.

**Calls on one fresh page load** (demo owner: 5 arenas, 13 courts; measured
2026-10-09 with a clean browser, shell calls included — arenas, summary,
notifications):

| Page | Calls | Grows with |
|---|---|---|
| Pricing Rules | 21 | 3 + arenas + **one per court** (rules are per court) |
| Arenas | 14 | 4 + 2 per arena (courts, analytics) |
| Schedule | 13 | 3 + 2 per arena (calendar, courts) |
| Reports | 13 | 3 + 2 per arena (analytics, calendar) |
| Reviews | 13 | 3 + 2 per arena (reviews, summary), plus a page per extra 100 reviews |
| Bookings | 9 | 4 + one per arena (courts) |
| Courts | 8 | 3 + one per arena |
| Live Board | 7 | fixed, plus courts and today's calendar for one arena |
| Revenue | 5 | fixed |

**Could a normal owner hit it?** Not with the demo data on one page: the
heaviest page is about a fifth of the budget. But it is reachable in real use:

- **Bigger owners.** Pricing grows by one call per court: 10 arenas with 8
  courts each is about 93 calls for one load of Pricing.
- **Moving around.** The budget is per minute, not per page: opening
  Pricing, Reports and Reviews within a minute is about 50 calls for the
  demo owner, and more with refetches when the tab regains focus.
- **Shared IPs.** The count is per IP, so staff at one arena on the same
  Wi-Fi, or many users behind one mobile carrier NAT, share one budget.

A 429 shows as the page's "Could not load …" state with Try again; nothing
breaks for good, but it looks like an outage.

**Later fix (not done).** One batch endpoint per heavy page, so each loads
in one or two calls whatever the number of arenas or courts:

- `GET /owner/pricing-rules?arena_id=` — every rule with its court and base price.
- `GET /owner/courts?arena_id=` — every court of every arena (Bookings, Courts, Pricing, Schedule).
- `GET /owner/reports/summary?date_from&date_to&arena_id=` — per-arena bookings, hours, revenue, occupancy (Reports, Arenas).
- `GET /owner/reviews?arena_id=` with a star breakdown in the summary (Reviews).
- `GET /owner/calendar?date_from&date_to&arena_id=` across arenas (Schedule).

Separately worth deciding: count the API limit per signed-in user rather
than per IP, so people on a shared network do not limit each other.

## Owner panel — known follow-ups after the final pass (2026-10-09)

- **Calls per page against the rate limit.** See "owner pages make many API calls" above: Pricing
  grows by one call per court; one batch endpoint per heavy page is the later fix. No limit changed.
- **Arenas page: one analytics call per arena** for this month's occupancy. A per-arena summary
  endpoint (or the Reports batch endpoint) would replace it.
- **"Part refunded" on admin Payments** needs the refunded amount from the API; today only a full
  refund ("Refunded") can be told apart from the payment's lifecycle.
- **Done: "Verify bank transfer".** The Bookings receipt dialog uses the payment option name
  "Bank transfer" (5d7cb99).

## Follow-up — password-reset codes (2026-10-09)

- **Codes are stored as plain text.** `otp_verifications.code` holds the six digits as typed.
  A later improvement is to store a keyed hash (HMAC with a server secret) and compare
  hashes, so a database read does not expose live codes.
- **No separate "check code" step.** `/auth/reset-password` takes the email, the code and the
  new password together. The web screens collect the code at Step 1 and send it at Step 2,
  so a wrong, expired or used-up code is only found at Step 2; the page then returns to Step 1
  with the message and keeps the typed password.

## Admin sign-in with an emailed code (2026-10-09)

- **How it works.** `/auth/login` is unchanged for owners and players. An admin with the right
  password gets no tokens: an `admin_login` code is emailed (same rules as the other codes:
  6 digits, 10 minutes, 5 wrong tries, 60 s before a new one, one live code) and the reply is
  `{mfa_required, challenge_token, expires_in: 600}`. `/auth/admin/verify-code` turns the
  challenge and the code into the normal tokens; `/auth/admin/resend-code` sends a new code
  after the 60 s wait. The challenge is a signed token of its own type, for one user, 10 minutes.
- **Mobile app.** The app's sign-in does not handle the code step yet, so an admin account
  cannot sign in there today. Admins must be able to use the app (user decision): see
  "Mobile blockers" in `docs/MOBILE_QA_GATE.md`.
- **Logs.** The code is written only on the dev path (dev with no mail server); the delivery
  line and the email fallback no longer carry the address.

## Note — "completed" payments with lifecycle "pending" in dev

The 21 such rows in the dev database are seed data from 2026-08-01:
`backend/scripts/seed_dummy_data.py` builds `Payment(status=completed, …)` without a lifecycle,
so the model default `pending` sticks; the app itself only moves the lifecycle through
`payment/state_machine.py`. Fix later by setting `lifecycle_status` in the seed script.

## NEEDS DECISION — admin sign-in depends on mail (2026-10-09)

- **Production needs working mail settings** (`EMAIL_HOST`, `EMAIL_PASSWORD` and the rest). Admin
  sign-in now ends with an emailed code: if mail is not configured or fails, the code never
  arrives and no admin can sign in. A send failure is logged as `otp_email_failed` (kind and
  user id only).
- **No recovery if an admin loses their email.** There is no other way to receive the code and
  no admin password reset (see "no admin password reset" above). Recovery today means a manual
  database change by someone with server access.
- **Dev only:** the code can be read from the backend log (`otp_dev_delivery`) only because the
  dev `.env` has no mail password. With mail configured, dev sends the email like production and
  the code is not logged.

## Decision — the owner top bar is now Live Board only (2026-10-09)

User decision; it replaces the earlier "top bar on every owner page". At 1024px and wider the
bar (arena picker, search, theme, bell) shows on the Live Board only. Other owner pages: the
theme switch is in the owner card menu, Ctrl+K / ⌘K still opens search, the rail's Notifications
item shows the unread count, and pages whose data filters by arena show the picker in their own
header row (added once, in the shared owner `PageHeader`). Below 1024px nothing changed. The Live
Board's court grid also gained a date control (Karachi dates; the KPIs and charts keep their own
date filters).

## Bookings table — "Remind" is built

Owner Bookings shows "Remind" on a booking that is **Awaiting payment** (status `pending_payment`: booked, nothing paid yet; a bank transfer with a receipt is `pending_approval` and is not remindable) while its slot has not started (Karachi time). `POST /owner/dashboard/bookings/{id}/remind` sends the player the notice `payment_reminder` (saved in their notices, pushed/emailed by their category settings). Only the arena's own owner may send it; one reminder an hour per booking (a second try gets 409 with the minutes left, and the button shows "Sent · N min"). The hour is read from the notices table, so there is no new table. Reminder email wording is plain; the redesign of it comes with the email work.

## Sign-in follow-ups (from the user's answers)

- Unique index on `lower(email)`: add it only after a duplicate check on real data (sign-in and sign-up already match email without regard to case).
- Prototype shows "Email or phone" on the sign-in field; login by phone needs backend work and is **not done**.
- Google / Apple buttons and the "328 arenas" copy are left out of the sign-in screens (nothing behind them).
- Mobile gate G1: the frames for reset with 6 boxes, the success step, the admin code and a wrong / expired code are **proposed, not in the prototype**.
