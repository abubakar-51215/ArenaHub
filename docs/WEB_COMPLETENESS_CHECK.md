# Web portal completeness check (owner and admin), 2026-10-10

Read-only. Numbers from a fresh sweep of the dev server (web :3103, dev backend :8000): every route at 390, 1024 and 1440, light and dark, signed in as the dev owner and the dev admin. Nothing was written to the data except the two sign-ins.

How "matches frame" is judged: there is no pixel tool for it. It means "the route has a frame in `arena-hub-owner.html` or `arena-hub-admin.html` and was accepted at its restyle gate". "No frame" means the prototype does not draw it.

## 1. Sweep result in one line each

- **Owner:** 13 routes x 6 cells = 78 cells. Sideways scroll 0 px in all 78. Old blue colours: 0. Placeholder words (lorem, todo, undefined, NaN, null, "coming soon"): 0. Body font Inter Tight and heading font Archivo on all 13. Dark theme applied in all 39 dark cells. Console errors: 5 cells, all the same thing: HTTP 429 from the backend rate limit (100 calls a minute per IP) caused by the sweep going fast. Re-run: light 1440 clean (13 of 13); dark 1440 clean except Pricing, which hit 429 again (it makes one call per court, already logged as a follow-up). Two cells (Reports dark 390, Pricing dark 1024) were not re-run.
- **Admin:** 11 routes x 6 cells = 66 cells. Sideways scroll 0 px, old blue 0, placeholders 0, console errors 0, failed requests 0, 4xx/5xx replies 0. Heading font Archivo on all 11.
- **Not covered by this sweep:** dialogs (not opened), the sign-in pages (checked in earlier gates), and any state that needs data the dev DB lacks.

## 2. Owner routes

| Route | Built | Frame | Light and dark | Scroll 390/1024/1440 | Console errors | Old or placeholder |
|---|---|---|---|---|---|---|
| `/owner` (Live Board and dashboard) | yes | yes (dashboard) | yes | 0/0/0 | 0 | no |
| `/owner/arenas` | yes | yes | yes | 0/0/0 | 429 once (sweep speed) | no |
| `/owner/bookings` | yes | yes | yes | 0/0/0 | 0 | no |
| `/owner/calendar` (title "Schedule") | yes | yes | yes | 0/0/0 | 0 | no |
| `/owner/courts` | yes | yes | yes | 0/0/0 | 0 | no |
| `/owner/equipment` | yes | no frame | yes | 0/0/0 | 0 | no |
| `/owner/notifications` | yes | no frame | yes | 0/0/0 | 0 | no |
| `/owner/payments` (payment config) | yes | no frame as its own page (settings frame) | yes | 0/0/0 | 429 once | no |
| `/owner/pricing` | yes | yes | yes | 0/0/0 | 429 twice (known follow-up) | no |
| `/owner/profile` | yes | settings frame | yes | 0/0/0 | 0 | no |
| `/owner/reports` | yes | yes | yes | 0/0/0 | 429 once | no |
| `/owner/revenue` | yes | yes (earnings) | yes | 0/0/0 | 0 | no |
| `/owner/reviews` | yes | yes | yes | 0/0/0 | 429 once | no |

Public and sign-in pages (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/health`): built; accepted at their own gates; not part of this sweep.

## 3. Admin routes

| Route | Built | Frame | Light and dark | Scroll 390/1024/1440 | Console errors | Old or placeholder |
|---|---|---|---|---|---|---|
| `/admin` (Dashboard) | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/arenas` (Arena approvals) | yes | yes (approvals) | yes | 0/0/0 | 0 | no |
| `/admin/arenas/all` | yes | yes (arenas) | yes | 0/0/0 | 0 | no |
| `/admin/bookings` | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/complaints` | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/owners` | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/payments` | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/reports` (Analytics) | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/reviews` | yes | no frame | yes | 0/0/0 | 0 | no |
| `/admin/settings` | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/users` (Players) | yes | yes | yes | 0/0/0 | 0 | no |
| `/admin/login` | yes | own frames (admin sign-in) | n/a | checked in earlier gates | 0 | no |

## 4. Dialogs (found in the code; not opened in this sweep)

Owner: Add/Edit Arena, Add/Edit Court, Add/Edit Discount Code, Add/Edit Equipment, Add/Edit Pricing Rule, Slots for a court, Verify bank transfer (receipt), reject-with-reason (text-input dialog), command palette (Ctrl+K), profile dialogs.
Admin: Booking detail, Complaint detail and reply, Delete review, Suspend or Delete an account, Player detail, Arena detail, Arena suspend / remove / reactivate actions, command palette.
Public: About ArenaHub, Get in Touch.
Frame for each: the prototypes draw dialogs only for a few (arena form, receipt). Others follow the shared dialog component and were accepted at their gates. Last numeric check of the owner dialogs: the earlier restyle passes. A fresh pass over all dialogs is not part of this note.

## 5. Placeholder and old styling

None found by the sweep (0 placeholder words, 0 old blue elements on any route). Known leftovers that are not styling: the 13 dashboard cards without a sparkline (see section 6).

## 6. Logged future improvements still open (all in `docs/`)

UI:
- Courts "Bookable" switch is 22 px high; its label is the 44 px tap area (approved as is).
- Reports "Arena comparison" avatar initials use the first and last word, so every "Arena Hub ..." arena shows "AL".
- "Part refunded" on admin Payments needs the refunded amount from the API; only a full refund can be told apart today. Also a fully refunded payment still reads "Completed" in the status column.
- 13 owner and admin dashboard cards ship without a sparkline because the endpoints return no time series.
- Sidebar "Reviews" count for the owner needs an endpoint for reviews without a reply.
- Chart fallback colours are literal hex values (left as is).

Backend and operations:
- Owner pages make many calls; the limit is 100 a minute per IP (Pricing grows by one call per court; the Arenas page makes one analytics call per arena). The sweep itself hit it 5 times in 78 cells.
- Password-reset codes are stored as plain text (keyed hash proposed).
- Admin sign-in depends on working mail; no recovery if an admin loses their email.
- Unique index on lower(email) waits for a duplicate check on real data.
- Phone-number OTP is not implemented.
- Refunds go out inside the cancel transaction on arena suspend or remove; open matches at a suspended arena are not handled.
- `seed_dummy_data.py` is broken on the current schema.
- Decision pending before any push: remote `main` has diverged.
- Admin cannot reset a player or owner password.
- A stuck worktree folder needs manual cleanup (do not delete by hand).
- Web crashes when browser storage is fully blocked.
- Not found in any doc: "booking email details". If you mean what the booking-confirmation email shows, it is not logged; tell me what is missing and I will log it.

From `FEATURE_GAP_REPORT.md` (routes that exist with no screen): blocked dates (close an arena for a day), the admin "force refund" button, the payment event history on admin Payments, the admin arena detail from the queue, owner slot block/edit/delete (generate exists in the Slots dialog), player complaint filing (mobile), player booking-history report (mobile).

## 7. Web screens the new mobile features need

| Need | Exists? | Detail |
|---|---|---|
| Owner review of bank-transfer receipts (G4) | **Partly** | Owner Bookings has a "Verify bank transfer" dialog that shows the amount, the arena's own bank details and the receipt photo, plus Approve and Reject (with a reason) on the row. The dialog itself is read-only; the buttons are on the table row. **One problem found by reading the code:** the receipt URL the server returns in dev is a relative path (`/uploads/receipts/x.jpg`), and the dialog uses it as the image address as it is, so it resolves against the web address and not the backend. In production (Cloudinary, full address) it works. Smallest fix: put the API address in front of a relative path. |
| Owner notice of a new receipt | not checked | The Bookings row shows "Awaiting approval"; whether the owner also gets a notice was not checked. |
| Owner notice when a player cancels (G5) | not checked | A `booking_cancelled` notice exists for the player; the owner side was not checked. |
| Complaints | admin yes, owner no, player no | Admin Complaints list, detail and reply exist. Players file and see their own complaints through the API only: there is no mobile screen yet (needs a frame). The owner has no complaints view and none is planned in the docs. |
| Booking-history report (player) | backend yes, no screens | `GET /reports/my-bookings` (csv or pdf) exists; no mobile screen calls it (G5). The owner and admin reports pages exist on web. |
| Refund status for the player | no screen on web needed | Admin Payments shows refunds; how an owner marks a bank-transfer refund as paid was not checked here. |
