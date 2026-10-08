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
| 4 | `/forgot-password` | Owners | Ask for a password-reset email. Always answers "sent", so it never shows which emails exist. | Live. Still on the old two-column shell. |
| 5 | `/reset-password` | Owners | Set a new password with the emailed code or token. | Live. Still on the old two-column shell. Redesign waits for the reset-by-code backend. |
| 6 | `/admin/login` | Administrators | Sign in. On success it opens `/admin`. | Live |
| 7 | `/health` | Developers | Shows whether the API answers. A diagnostic page, not a product screen. | Live. Keep, but hide from any public menu. |

Not on the list, and now removed: `/login1`, `/signup1`, `/admin/login1`. They were design
experiments and were deleted in commit `93beca6`.

## 2. Owner dashboard: 13 destinations

All owner screens sit under `/owner`. A signed-out visitor is sent to `/login`. The owner panel is
being restyled to the owner prototype (`design/prototypes/arena-hub-owner.html`); the shell (rail,
top bar on every page from 1024 px, slim bar below, dark theme) and the Live Board are done
(2026-10-08). Menu names follow the decided list; routes are unchanged.

| # | Menu group | Menu name | Route | What it is for | Status |
|---|---|---|---|---|---|
| 1 | Today | Live Board | `/owner` | Courts by hour for one arena (with a "now" line), four stat cards, revenue and time-of-day charts, arenas by revenue, receipts awaiting approval. | Live, restyled |
| 2 | Today | Bookings | `/owner/bookings` | All bookings for the owner's arenas. Review and approve or reject bank-transfer receipts. | Live |
| 3 | Today | Schedule | `/owner/calendar` | Week and month view of bookings. | Live |
| 4 | Venue | Arenas | `/owner/arenas` | Add, edit, deactivate and resubmit arenas. Shows "Suspended by admin" or "Removed by admin". | Live, with gaps: images are pasted as URLs. There is no file upload. |
| 5 | Venue | Courts | `/owner/courts` | Add, edit and delete courts. Switch a court on or off (maintenance). Generate slots. | Live |
| 6 | Venue | Equipment | `/owner/equipment` | Add, edit and delete rental items. Change stock. | Live |
| 7 | Money | Pricing Rules | `/owner/pricing` | Peak-hour price rules (multipliers) for each court. | Live |
| 8 | Money | Payments | `/owner/payments` | Bank accounts for transfers and discount codes. | Live |
| 9 | Money | Revenue | `/owner/revenue` | Revenue, pending settlements, charts. | Live, with gaps: no payment report (FR-O-10). |
| 10 | Money | Reports | `/owner/reports` | Download the bookings and occupancy reports as CSV or PDF. | Live |
| 11 | Reputation | Reviews | `/owner/reviews` | Read reviews for each arena (including closed arenas) and reply. | Live |
| 12 | (none) | Notifications | `/owner/notifications` | Notification centre. Also reached from the top bar's bell. | Live |
| 13 | (none) | Profile | `/owner/profile` | Edit your name. Change email, phone and password, each confirmed with a code. Also in the owner card's menu, with Log out. | Live |

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
| 12 | (sign-in) | | `/admin/login` | Admin sign-in. The side panel names what the panel is for: Review, Manage, Resolve. | Live |

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
| Reset by code | Backend and the two reset screens. |
| Login by email or phone | Sign-in rules and a data migration. |
| Owner slot screen | A new screen. Needs a decision: it is not in the 13 today. |
