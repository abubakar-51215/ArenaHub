# ArenaHub Web — Final Scope Lock

**What this is.** The list of web screens that make up ArenaHub's web dashboards, written from what
exists in `frontend/web` today (branch `prototype-screens`, checked 2026-10-05). It is a list of
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

All owner screens sit under `/owner`. A signed-out visitor is sent to `/login`.
The menu has 12 working items and 1 disabled item.

| # | Menu group | Menu name | Route | What it is for | Status |
|---|---|---|---|---|---|
| 1 | Today | Dashboard | `/owner` | Live Board (courts by hour, with a "now" line), four stat cards, revenue and time-of-day charts. | Live. A "swipe for more hours" hint on phones is waiting (W8). |
| 2 | Today | Bookings | `/owner/bookings` | All bookings for the owner's arenas. Review and approve or reject bank-transfer receipts. | Live |
| 3 | Today | Calendar | `/owner/calendar` | Week and month view of bookings. | Live |
| 4 | Venue | Arenas | `/owner/arenas` | Add, edit, deactivate and resubmit arenas. | Live, with gaps: images are pasted as URLs. There is no file upload. |
| 5 | Venue | Courts | `/owner/courts` | Add, edit and delete courts. Switch a court on or off (maintenance). | Live |
| 6 | Venue | Equipment | `/owner/equipment` | Add, edit and delete rental items. Change stock. | Live |
| 7 | Money | Pricing | `/owner/pricing` | Peak-hour price rules for each court. | Live |
| 8 | Money | Payment Config | `/owner/payments` | Bank accounts for transfers and discount codes. | Live |
| 9 | Money | Earnings | `/owner/revenue` | Revenue, pending settlements, charts, and downloads for the bookings and occupancy reports. | Live, with gaps: no payment report (FR-O-10). |
| 10 | Reputation | Reviews | `/owner/reviews` | Read reviews for each arena (including closed arenas) and reply. | Live |
| 11 | (none) | Notifications | `/owner/notifications` | Notification centre. The menu shows an unread count. | Live |
| 12 | (none) | Profile | `/owner/profile` | Edit your name. Change email, phone and password, each confirmed with a code. | Live |
| 13 | (none) | Reports | not built | A page to build and download reports. | Disabled. Waiting for approval (W7). |

**Missing from the owner screens, and why it matters.** There is no screen for time slots
(generate, block, edit) and none for blocked dates. The backend has them. Without slots a player
sees nothing to book. This is the first item in `FEATURE_GAP_REPORT.md`, section D.

## 3. Admin dashboard: 10 screens

All admin screens sit under `/admin`. A signed-out visitor is sent to `/admin/login`.

| # | Menu group | Menu name | Route | What it is for | Status |
|---|---|---|---|---|---|
| 1 | Oversight | Dashboard | `/admin` | Platform numbers: users, arenas, bookings, revenue. | Live |
| 2 | Oversight | Bookings | `/admin/bookings` | Every booking on the platform, with a status filter. | Live |
| 3 | Oversight | Payments | `/admin/payments` | Every payment, with method, status and gateway ID. | Live |
| 4 | Directory | Users | `/admin/users` | List, suspend, reactivate and delete accounts. | Live, with gaps: the detail shows a booking count, not a booking history (FR-A-02). |
| 5 | Directory | Arena Owners | `/admin/owners` | The same screen as Users, showing owners only. | Live |
| 6 | Directory | Arenas | `/admin/arenas` | The verification queue. Approve, or reject with a reason. | Live, with gaps: the owner is not told the result (FR-A-03). |
| 7 | Health | Complaints | `/admin/complaints` | Read complaints, reply, and move them from Open to Resolved. | Live, with gaps: no player screen sends complaints yet (FR-A-06). |
| 8 | Health | Reports | `/admin/reports` | Download platform-wide reports. | Live |
| 9 | Health | Settings | `/admin/settings` | Platform settings and the audit log. | Live |
| 10 | (none) | Reviews | `/admin/reviews` | Reported reviews waiting for a decision. | Live |

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
| W7 | Builds screen 13 (owner Reports) and turns on its menu item. |
| W8 | Phone hint on the Live Board. |
| W16 | Menu behaviour between 1024 and 1279 px (icon rail or drawer). |
| Reset by code | Backend and the two reset screens. |
| Login by email or phone | Sign-in rules and a data migration. |
| Owner slot screen | A new screen. Needs a decision: it is not in the 13 today. |
