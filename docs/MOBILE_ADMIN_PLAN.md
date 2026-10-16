# Admin on the phone: decided and built

Status: **BUILT** (frames: `design/prototypes/arena-hub-admin-app.html`, 48 frames). Decisions written 2026-10-13.

## Decisions (all decided)
1. The admin uses the same phone app. The web admin stays as it is.
2. After the emailed code an admin gets only the admin tab bar: Overview, Approvals, Complaints, More. An admin never sees the
   player tabs. A player or an owner can never open an admin screen (the root layout hides the whole `admin` group from them, the
   admin layout checks the role again, and every admin API route answers 403 to anyone who is not an admin).
3. More has: Arenas, Users, Payments and refunds, Notifications, Log out (red sheet, plain "Stay").
4. Built in this order: (a) tab bar, Overview, admin notifications; (b) Approvals; (c) Complaints; (d) Arenas suspend and reactivate;
   (e) Users; (f) Payments and refunds.
5. Biometric unlock for admins: later. Not built.
6. The old "Admin landing" screen became Overview (the file is gone).
7. Reported reviews, the audit log, reports and settings stay on the web. They are not on the phone.
8. Admin sign-in stays the emailed code only.

## Phone routes (`frontend/mobile/app/admin/`)
| Route | Screen |
|---|---|
| `/admin` | Overview (tab) |
| `/admin/approvals` and `/admin/approvals/[id]` | Approvals list (Waiting, Approved, Rejected) and the arena detail with Approve and Reject |
| `/admin/complaints` and `/admin/complaints/[id]` | Complaints list (Open, Replied, All), detail with reply |
| `/admin/more` | More (tab) |
| `/admin/arenas` and `/admin/arenas/[id]` | Arenas search, Live, Suspended, All; detail with Suspend and Reactivate |
| `/admin/users` and `/admin/users/[id]` | Users search; detail with Suspend and Reactivate |
| `/admin/payments` (`?tab=refunds`) | Payments and Refunds (Mark as paid) |
| `/admin/notifications` | Admin notifications |

## Backend added for these screens
* `GET /admin/phone/overview` (the four numbers, the oldest waiting items, the tab badges).
* `GET /admin/arena-cards?scope=waiting|approved|rejected|live|suspended|all&search=` and `GET /admin/arenas/{id}/summary` (owner,
  courts, rating and `upcoming_bookings`: the real number a suspension would cancel with a full refund).
* `GET /admin/refunds?status=pending|processed|all` and `POST /admin/refunds/{id}/mark-paid` (admin only, pending bank-transfer
  refunds only, once only: a second call answers "Already marked as paid." and sends nothing; the player gets the same notice as from
  the owner path; one audit line `refund.mark_paid`).
* Two admin notices, "New arena waiting" and "New complaint", one per active admin per event (category `admin`). The owner now also
  gets "Your arena is approved" and "Your arena was not approved" (the frames say the owner will get a message).
* Approve and reject answer 409 "Someone already handled this arena." when the arena is no longer waiting.
* Reasons: reject, suspend arena and suspend user take 1 to 500 characters (reject and suspend user were 1000, suspend arena needed
  10); reactivate needs no reason; a complaint reply takes up to 2000.
* The user detail shows `total_complaints` and, while suspended, the reason (read from the audit log; no new column).

## Differences from the frames, and why
* The complaint detail has no Booking and Arena lines: a complaint does not carry them on the server.
* The payments list shows the player and the arena (the admin payment list has no booking code).
* "They will see your reason" on the suspend-user sheet: the player is told by the emailed notice; the Log in screen still says
  "invalid credentials" for a suspended account (not changed).
* The frames' 12.5 px rows are built at 14 px.

## Still open
* Nothing in this plan is open. Biometric unlock is a later decision.
