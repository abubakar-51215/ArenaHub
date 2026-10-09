# ArenaHub Web — Final Scope Lock

**What this is.** The list of web screens that make up ArenaHub's web dashboards, written from what
exists in `frontend/web` today (branch `prototype-screens`, checked 2026-10-05; admin section
2026-10-08). It is a list of
what is in scope for the web UI, not a wish list. A screen not on this list is not part of the web
release. Adding one needs a decision first.

**What this is not.** The player app lives on mobile (`frontend/mobile`). It is paused and not part of
this lock. See `docs/FEATURE_GAP_REPORT.md` for what is missing around these screens.

**How to read the status column**

| Word | Meaning |
|---|---|
| Live | The screen exists and loads real data from the backend. |
| Live, with gaps | The screen exists, but something it should do is missing. The gap is named. |
| Disabled | The menu item exists but is greyed out. There is no screen behind it. |
| Waiting | Approved in principle, not built or not applied yet. |

---

## 1. Public and sign-in pages (7)

| # | Route | Who sees it | What it does | Status |
|---|---|---|---|---|
| 1 | `/` | Everyone | Landing page. Every call-to-action goes to `/login` or `/register`. | Live. Copy changes (W3) are waiting. |
| 2 | `/login` | Arena owners | Sign in. On success it opens `/owner`. Players and admins are turned away with a message. | Live |
| 3 | `/register` | Arena owners | Create an owner account, then enter the emailed 6-digit code. | Live, with gaps: business name and business contact are not asked (FR-O-01). |
| 4 | `/forgot-password` | Owners | Ask for a 6-digit reset code by email. Always answers "If this email is registered, we have sent a 6-digit code.", so it never shows which emails exist. | Live, on the split sign-in shell (2026-10-09). |
| 5 | `/reset-password` | Owners | Three steps: the 6-digit code (paste, auto-advance, Resend after 60 s), a new password with the live rule list, then Sign in. A wrong code is found at step 2 and returns to step 1. | Live, on the split sign-in shell (2026-10-09). |
| 6 | `/admin/login` | Administrators | Sign in in two steps: email and password, then the 6-digit code emailed to the admin (Resend after 60 s, Back). On success it opens `/admin`. | Live; code step added 2026-10-09. |
| 7 | `/health` | Developers | Shows whether the API answers. A diagnostic page, not a product screen. | Live. Keep, but hide from any public menu. |

Not on the list, and now removed: `/login1`, `/signup1`, `/admin/login1`. They were design
experiments and were deleted in commit `93beca6`.

## 2. Owner dashboard: 13 destinations

All owner screens sit under `/owner`. A signed-out visitor is sent to `/login`. Every owner
screen is restyled to the owner prototype (`design/prototypes/arena-hub-owner.html`), finished
2026-10-09. Routes are unchanged.

- **Menu, in order:** Today (Live Board, Bookings, Schedule) · Venue (Arenas, Courts, Equipment) ·
  Money (Pricing Rules, Payments, Revenue, Reports) · Reputation (Reviews) · Notifications, Profile.
  The rail foot is the owner card (name, "Owner · N arenas"); its menu has Profile and Log out.
- **Top bar, from 1024 px, on the Live Board only** (user decision, 2026-10-09): arena picker,
  search (⌘K: owner pages, arenas, courts), theme switch and the bell (latest notices, "See all").
  Other owner pages keep Ctrl+K, the theme switch in the owner card menu, the rail's unread count
  and, where it filters, the arena picker in the page's own header. Below 1024 px a slim bar
  (menu, search, theme, bell at 44 px) with the picker in a row under it.
- **Dark theme:** owners and admins share one preference (`ah-admin-theme`), set before paint.
  Sign-in and public pages stay light.
- **Arena picker** (`?arena=`, kept on rail links) shows on Live Board, Bookings, Schedule, Courts,
  Equipment, Pricing Rules, Payments, Revenue, Reports and Reviews. It is hidden on Arenas,
  Notifications and Profile, where it would filter nothing.
- **Left out on purpose (no data or not built):** platform fee, net payout, in transit and payout
  history; occupancy by weekday; "Schedule weekly" reports and repeat rate; "What people mention
  most" on reviews; "Block time" by the hour (blocking stays by whole day in each court's slots
  dialog); photo upload (initials only); court surface and "% full"; player names on Schedule and
  Live Board events (the calendar endpoint has none).

| # | Menu group | Menu name | Route | What it is for | Status |
|---|---|---|---|---|---|
| 1 | Today | Live Board | `/owner` | Courts by hour for one arena (with a "now" line), four stat cards, revenue and time-of-day charts, arenas by revenue, receipts awaiting approval. | Live, restyled |
| 2 | Today | Bookings | `/owner/bookings` | All bookings for the owner's arenas, with filters, Export CSV, and bank-transfer receipts to approve or reject. | Live, restyled |
| 3 | Today | Schedule | `/owner/calendar` | Day, week and month views of bookings, coloured by sport. | Live, restyled |
| 4 | Venue | Arenas | `/owner/arenas` | Add, edit, deactivate and resubmit arenas, with courts, this month's occupancy and revenue. Shows "Suspended by admin" or "Removed by admin". | Live, restyled; images are pasted as URLs (no file upload). |
| 5 | Venue | Courts | `/owner/courts` | Court cards: add, edit, delete, switch on or off, slots dialog. | Live, restyled |
| 6 | Venue | Equipment | `/owner/equipment` | Add, edit and delete rental items. Change stock. | Live, restyled |
| 7 | Money | Pricing Rules | `/owner/pricing` | Peak-hour price rules (multipliers) for each court, with the rate they give. | Live, restyled |
| 8 | Money | Payments | `/owner/payments` | Tabs for bank accounts (Bank transfer) and discount codes. | Live, restyled |
| 9 | Money | Revenue | `/owner/revenue` | Earnings, bookings, pending settlements, daily chart, share by arena. | Live, restyled; no payout data and no payment report (FR-O-10). |
| 10 | Money | Reports | `/owner/reports` | Download the bookings and occupancy reports as CSV or PDF; hours sold and arena comparison. | Live, restyled |
| 11 | Reputation | Reviews | `/owner/reviews` | Average rating with the 5-to-1 breakdown, reviews and replies. | Live, restyled |
| 12 | (none) | Notifications | `/owner/notifications` | Notification centre, including the admin's arena notices. Also reached from the bell. | Live, restyled |
| 13 | (none) | Profile | `/owner/profile` | Settings with Profile and Security tabs: name, and email, phone and password changed by code. | Live, restyled |

**Missing from the owner screens, and why it matters.** There is no screen for time slots
(generate, block, edit) and none for blocked dates. The backend has them. Without slots a player
sees nothing to book. This is the first item in `FEATURE_GAP_REPORT.md`, section D.

## 3. Admin dashboard: 11 screens and the sign-in page

All admin screens sit under `/admin`. A signed-out visitor is sent to `/admin/login`. The menu
(left rail on wide screens, a drawer below 1024 px) has three named groups and one unnamed item.
Checked 2026-10-08 on branch `prototype-screens`.

| # | Menu group | Menu name | Route | What it is for | Status |
|---|---|---|---|---|---|
| 1 | Oversight | Dashboard | `/admin` | KPIs, decision queue, bookings by day and by city, utilisation by hour, top arenas. City and period filters. | Live |
| 2 | Oversight | Approvals | `/admin/arenas` | The verification queue. Approve, or reject with a reason. The menu shows the pending count. | Live |
| 3 | Oversight | Bookings | `/admin/bookings` | Every booking, with filters and a detail dialog. An amber "Pending refund" badge marks a refund still waiting. | Live |
| 4 | Oversight | Payments | `/admin/payments` | Every payment: method, amount, status, period and method filters. "Pending refund" badge as on Bookings. | Live |
| 5 | Directory | Players | `/admin/users` | List, view, suspend, reactivate and delete player accounts. | Live, with gaps: the detail shows a booking count, not a booking history (FR-A-02). |
| 6 | Directory | Arena owners | `/admin/owners` | The same screen for owners. | Live |
| 7 | Directory | Arenas | `/admin/arenas/all` | Every arena as a card (Live, Off, Pending review, Suspended, Rejected) with city, sport and status filters, including "Suspended". Suspend, Reactivate and Remove (see below). | Live |
| 8 | Health | Complaints | `/admin/complaints` | Read complaints, reply, and move them from Open to Resolved. | Live, with gaps: no player screen sends complaints yet (FR-A-06). |
| 9 | Health | Analytics | `/admin/reports` | Top city, bookings, value, peak hours, revenue over time, bookings by city, city comparison, report downloads (CSV and PDF). | Live |
| 10 | Health | System settings | `/admin/settings` | Email, SMS, payment options, booking rules, notifications, general, security and the audit log. | Live |
| 11 | (none) | Reviews | `/admin/reviews` | Reported reviews waiting for a decision. | Live |
| 12 | (sign-in) | | `/admin/login` | Admin sign-in with a second step: the 6-digit code emailed to the admin. The side panel names what the panel is for: Review, Manage, Resolve. | Live |

**Shared parts of the admin panel**

- **Top bar on the Dashboard only, at 1024 px and wider.** The search button, the alerts bell
  and the theme switch sit in a top bar that only the Dashboard shows on wide screens. Other
  screens start with their page header. Below 1024 px every admin screen has a slim bar instead:
  the menu button, the brand mark, and the same three controls as 44 px icon buttons (search
  opens the same palette, alerts the same popover).
- **Search.** Ctrl+K (or the search button) opens a command palette: jump to any admin page, or
  find a player or owner by name.
- **Alerts.** The bell opens a short list of what is waiting (arenas to approve, open
  complaints), each a link to its screen.
- **Dark theme.** Every admin screen has a light and a dark theme. The choice is kept per browser
  and survives blocked storage. Owner and public pages have no dark theme.
- **Arena actions on `/admin/arenas/all`.** Each card shows only the actions valid for it:
  Suspend (approved and not suspended), Reactivate (suspended), Remove (any listed arena). Each
  opens a dialog with a plain line on the effect and a required reason of 10 to 500 characters.
  Suspend and Remove cancel the arena's upcoming bookings with a full refund and tell the owner
  the reason. Reactivate makes the arena bookable again; cancelled bookings are not restored.
  Removed arenas are not listed anywhere in the admin panel. The owner's Arenas list shows
  "Suspended by admin" or "Removed by admin" with the reason, and locks editing.

**Payment options.** Wherever a screen shows or lets someone pick a payment method, it uses
these four, in this order and with these labels (`frontend/web/lib/payment-methods.ts`):

| Label | API `payment_method` | Backend provider |
|---|---|---|
| Card | `card` | `stripe` |
| Bank transfer | `bank_transfer` | `manual` |
| JazzCash | `jazzcash` | `jazzcash` |
| EasyPaisa | `easypaisa` | `easypaisa` |

The mock provider stands in for the gateways in development and is never listed. Today this
covers admin Payments (method column and filter) and System settings (payment options). Real
gateway work comes after the UI is finished.

## 4. Rules that apply to every screen above

These are the standards the web gate checks (`FEATURE_GAP_REPORT.md` has the latest results).

1. **Design tokens only.** Colours and fonts come from the theme (ink, paper, lime; Archivo for
   headings, Inter Tight for text). Lime is for live status and the main action only.
2. **Four widths.** Each screen is checked at 1440, 1280, 768 and 390 px.
3. **No sideways page scroll** at 390 px. A table may scroll inside its own box if it shows a cue.
4. **Touch targets** are at least 44 px tall on phones. **Body text** is at least 14 px.
5. **Every screen has four states:** loading, error, empty, and long content.
6. **No console errors and no failed network calls** on a normal visit.
7. **Sign-in guard.** Signed-out visitors to `/owner/*` or `/admin/*` go to the matching login page.
   The guard lives in `middleware.ts` and in each dashboard layout.

## 5. Decisions waiting before this list can be called final

| Item | What it changes |
|---|---|
| W3 | Landing and sign-in page copy (removes figures that are not real). |
| W8 | Phone hint on the Live Board. |
| W16 | Menu behaviour between 1024 and 1279 px (icon rail or drawer). |
| Reset by code | Done 2026-10-09: backend and the two reset screens. |
| Admin sign-in mail | **Production must have working mail settings.** Admin sign-in now needs the emailed code; without mail the code is never delivered and no admin can sign in. |
| Admin lost email | No way for an admin to recover if they lose their email inbox. Joins the open gap that there is no admin password reset. |
| Login by email or phone | Sign-in rules and a data migration. |
| Owner slot screen | A new screen. Needs a decision: it is not in the 13 today. |
