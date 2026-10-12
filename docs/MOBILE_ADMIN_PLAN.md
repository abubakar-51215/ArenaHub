# Admin on the phone: plan only

Status: **PLAN ONLY. Nothing is built.** No frames exist for the admin on the phone, and a screen that is not in a frame needs a frame first.
Written 2026-10-12.

## Where things stand
* The phone app has one admin screen today: `app/admin.tsx` ("Admin landing", a temporary page with a Log out). An admin who signs in
  on the phone is sent there (the sign-in asks for the emailed 6-digit code on `app/(auth)/admin-code.tsx`).
* Admin work is done on the web (`/admin`, light and dark): overview, arena approvals, complaints, users, bookings, payments,
  reviews, reports, audit log, settings.

## What an admin needs on the phone, and what the backend has

| Need | Backend route today | Missing |
|---|---|---|
| Emailed-code sign-in | `POST /auth/login` (answers "code required"), `POST /auth/admin/verify-code`, `POST /auth/admin/resend-code`. The phone already has the code screen. | Nothing. |
| Overview (counts, queue) | `GET /admin/dashboard`, `GET /admin/dashboard/overview` (KPIs, charts, queue of pending arenas and open complaints). | Nothing (the phone would use only the KPI row and the queue). |
| Approvals: approve and reject an arena | `GET /admin/arenas` (queue), `GET /admin/arenas/{id}`, `POST /admin/arenas/{id}/approve`, `POST /admin/arenas/{id}/reject` (reason). | Nothing. |
| Complaints with a reply | `GET /admin/complaints` (filters), `GET /admin/complaints/{id}`, `PUT /admin/complaints/{id}` (reply and status). The player gets a notice (G6). | Nothing. |
| Arena suspend and reactivate with a reason | `POST /admin/arenas/{id}/suspend` (reason), `POST /admin/arenas/{id}/reactivate`, `DELETE /admin/arenas/{id}` (soft delete). | Nothing. |
| Payments and pending refunds | `GET /admin/payments` (all payments); `POST /admin/bookings/{id}/force-refund`. | **A list of all pending refunds for the admin** (the owner has one at `GET /owner/refunds`; the admin has none) and a way to mark one paid when an owner cannot. |
| Users | `GET /admin/users`, `GET /admin/users/{id}`, `PATCH /admin/users/{id}/suspend`, `PATCH /admin/users/{id}/reactivate`, `DELETE /admin/users/{id}`. | Nothing. |
| Reported reviews | `GET /admin/reviews`, `POST /admin/reviews/{id}/dismiss`, `DELETE /reviews/{id}`. | Nothing. |
| Audit log | `GET /admin/audit-logs`. | Nothing. |

## Does the "Admin landing" screen stay?
Not as it is. It is a placeholder that only offers Log out. It should become the Overview tab of the admin app (or be removed if
the admin stays on the web). Until the frames exist it can stay as a safe place to land.

## Questions, with my recommended answers
1. **Does the admin need a phone app at all, or is the web enough?** Recommended: build only the three things that cannot wait for a
   desk: approvals, complaints (read and reply) and arena suspend. Everything else stays on the web.
2. **One app with a role switch, or an admin tab bar?** Recommended: the same app; after the emailed code the admin gets its own tab
   bar (Overview, Approvals, Complaints, More) and never sees the player tabs.
3. **Payments and refunds on the phone?** Recommended: read-only list of pending refunds and a Mark as paid, after the backend gets an
   admin refunds list (the one missing route). Not in the first version.
4. **Users on the phone?** Recommended: search and suspend or reactivate only, with a reason, in a red sheet like everywhere else.
5. **Notifications for the admin** (a new arena waiting, a new complaint)? Recommended: yes, two notice events; small backend work.
6. **Biometric unlock for admins?** Recommended: later, not now.

## Order I would build it in (after the frames)
1. Admin tab bar and Overview. 2. Approvals (list, detail, approve, reject with a reason). 3. Complaints (list, detail, reply).
4. Arena suspend and reactivate. 5. Users. 6. Payments and refunds (after the backend list exists).
