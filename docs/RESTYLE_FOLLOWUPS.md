# Restyle follow-ups

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

## NEEDS UMER BEFORE DEMO — card payments return 500 (FR06)

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

## Player app — wireframe-vs-backend gaps (for Umer)

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

- **Card payments 500** — see "NEEDS UMER BEFORE DEMO" above.
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
