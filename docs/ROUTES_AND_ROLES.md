# Routes and who may call them

Written by `backend/scripts/route_table.py` from the running code; the test
`tests/modules/test_authorization_matrix.py` checks every row below (no token = 401,
wrong role = 403, another person's thing = 404, same as a missing one).

| Method | Path | Who |
|---|---|---|
| GET | `/admin/arena-cards` | admin |
| GET | `/admin/arenas` | admin |
| DELETE | `/admin/arenas/{arena_id}` | admin |
| GET | `/admin/arenas/{arena_id}` | admin |
| POST | `/admin/arenas/{arena_id}/approve` | admin |
| POST | `/admin/arenas/{arena_id}/reactivate` | admin |
| POST | `/admin/arenas/{arena_id}/reject` | admin |
| GET | `/admin/arenas/{arena_id}/summary` | admin |
| POST | `/admin/arenas/{arena_id}/suspend` | admin |
| GET | `/admin/audit-logs` | admin |
| GET | `/admin/bookings` | admin |
| POST | `/admin/bookings/{booking_id}/force-refund` | admin |
| GET | `/admin/complaints` | admin |
| GET | `/admin/complaints/{complaint_id}` | admin |
| PUT | `/admin/complaints/{complaint_id}` | admin |
| GET | `/admin/dashboard` | admin |
| GET | `/admin/dashboard/overview` | admin |
| GET | `/admin/payments` | admin |
| GET | `/admin/phone/overview` | admin |
| GET | `/admin/refunds` | admin |
| POST | `/admin/refunds/{refund_id}/mark-paid` | admin |
| GET | `/admin/reports` | admin |
| GET | `/admin/reviews` | admin |
| POST | `/admin/reviews/{review_id}/dismiss` | admin |
| GET | `/admin/settings` | admin |
| PUT | `/admin/settings` | admin |
| GET | `/admin/users` | admin |
| DELETE | `/admin/users/{user_id}` | admin |
| GET | `/admin/users/{user_id}` | admin |
| PATCH | `/admin/users/{user_id}/reactivate` | admin |
| PATCH | `/admin/users/{user_id}/suspend` | admin |
| GET | `/arenas` | nobody (public) |
| GET | `/arenas/amenities` | nobody (public) |
| GET | `/arenas/liked` | any signed-in user |
| GET | `/arenas/trending` | nobody (public) |
| GET | `/arenas/{arena_id}` | nobody (public) |
| GET | `/arenas/{arena_id}/bank-details` | any signed-in user |
| GET | `/arenas/{arena_id}/courts` | nobody (public) |
| GET | `/arenas/{arena_id}/equipment` | nobody (public) |
| DELETE | `/arenas/{arena_id}/like` | any signed-in user |
| POST | `/arenas/{arena_id}/like` | any signed-in user |
| GET | `/arenas/{arena_id}/reviews` | nobody (public) |
| POST | `/arenas/{arena_id}/reviews` | any signed-in user |
| GET | `/arenas/{arena_id}/reviews/summary` | nobody (public) |
| GET | `/arenas/{arena_id}/slots-today` | nobody (public) |
| POST | `/assistant/ask` | any signed-in user |
| POST | `/auth/admin/resend-code` | nobody (public) |
| POST | `/auth/admin/verify-code` | nobody (public) |
| POST | `/auth/forgot-password` | nobody (public) |
| POST | `/auth/google` | nobody (public) |
| POST | `/auth/google/phone` | any signed-in user |
| POST | `/auth/login` | nobody (public) |
| POST | `/auth/logout` | any signed-in user |
| POST | `/auth/logout-all` | any signed-in user |
| POST | `/auth/refresh` | nobody (public) |
| POST | `/auth/register` | nobody (public) |
| POST | `/auth/resend-otp` | nobody (public) |
| POST | `/auth/reset-password` | nobody (public) |
| POST | `/auth/verify-otp` | nobody (public) |
| GET | `/bookings` | any signed-in user |
| POST | `/bookings` | any signed-in user |
| GET | `/bookings/group/{group_id}` | any signed-in user |
| POST | `/bookings/group/{group_id}/cancel` | any signed-in user |
| GET | `/bookings/group/{group_id}/cancel-preview` | any signed-in user |
| POST | `/bookings/group/{group_id}/release` | any signed-in user |
| POST | `/bookings/group/{group_id}/reschedule` | any signed-in user |
| POST | `/bookings/group/{group_id}/reschedule-preview` | any signed-in user |
| GET | `/bookings/groups` | any signed-in user |
| POST | `/bookings/preview` | any signed-in user |
| GET | `/bookings/{booking_id}` | any signed-in user |
| POST | `/bookings/{booking_id}/cancel` | any signed-in user |
| GET | `/bookings/{booking_id}/pass` | any signed-in user |
| POST | `/bookings/{booking_id}/reschedule` | any signed-in user |
| POST | `/complaints` | any signed-in user |
| GET | `/complaints/my` | any signed-in user |
| GET | `/complaints/{complaint_id}` | any signed-in user |
| GET | `/courts/{court_id}/availability` | nobody (public) |
| GET | `/courts/{court_id}/pricing-rules` | nobody (public) |
| GET | `/courts/{court_id}/slots` | nobody (public) |
| GET | `/health` | nobody (public) |
| GET | `/matches` | any signed-in user |
| POST | `/matches` | any signed-in user |
| GET | `/matches/mine` | any signed-in user |
| DELETE | `/matches/{match_id}` | any signed-in user |
| GET | `/matches/{match_id}` | any signed-in user |
| POST | `/matches/{match_id}/join` | any signed-in user |
| POST | `/matches/{match_id}/leave` | any signed-in user |
| GET | `/media/receipts/{name}` | nobody (public) |
| GET | `/notifications` | any signed-in user |
| POST | `/notifications/devices` | any signed-in user |
| DELETE | `/notifications/devices/{token}` | any signed-in user |
| POST | `/notifications/read-all` | any signed-in user |
| PATCH | `/notifications/{notification_id}/read` | any signed-in user |
| GET | `/owner/arenas` | owner |
| POST | `/owner/arenas` | owner |
| DELETE | `/owner/arenas/{arena_id}` | owner |
| GET | `/owner/arenas/{arena_id}` | owner |
| PATCH | `/owner/arenas/{arena_id}` | owner |
| GET | `/owner/arenas/{arena_id}/bank-details` | owner |
| POST | `/owner/arenas/{arena_id}/bank-details` | owner |
| POST | `/owner/arenas/{arena_id}/bank-details/verify` | owner |
| DELETE | `/owner/arenas/{arena_id}/bank-details/{bank_details_id}` | owner |
| PATCH | `/owner/arenas/{arena_id}/bank-details/{bank_details_id}` | owner |
| GET | `/owner/arenas/{arena_id}/blocked-dates` | owner |
| POST | `/owner/arenas/{arena_id}/blocked-dates` | owner |
| DELETE | `/owner/arenas/{arena_id}/blocked-dates/{blocked_id}` | owner |
| GET | `/owner/arenas/{arena_id}/bookings` | owner |
| GET | `/owner/arenas/{arena_id}/bookings/calendar` | owner |
| GET | `/owner/arenas/{arena_id}/courts` | owner |
| POST | `/owner/arenas/{arena_id}/courts` | owner |
| GET | `/owner/arenas/{arena_id}/discounts` | owner |
| POST | `/owner/arenas/{arena_id}/discounts` | owner |
| DELETE | `/owner/arenas/{arena_id}/discounts/{discount_id}` | owner |
| PATCH | `/owner/arenas/{arena_id}/discounts/{discount_id}` | owner |
| GET | `/owner/arenas/{arena_id}/equipment` | owner |
| POST | `/owner/arenas/{arena_id}/equipment` | owner |
| POST | `/owner/arenas/{arena_id}/resubmit` | owner |
| GET | `/owner/arenas/{arena_id}/reviews` | owner |
| DELETE | `/owner/courts/{court_id}` | owner |
| GET | `/owner/courts/{court_id}` | owner |
| PATCH | `/owner/courts/{court_id}` | owner |
| PATCH | `/owner/courts/{court_id}/availability` | owner |
| GET | `/owner/courts/{court_id}/pricing-rules` | owner |
| POST | `/owner/courts/{court_id}/pricing-rules` | owner |
| DELETE | `/owner/courts/{court_id}/pricing-rules/{rule_id}` | owner |
| PATCH | `/owner/courts/{court_id}/pricing-rules/{rule_id}` | owner |
| GET | `/owner/courts/{court_id}/slots` | owner |
| POST | `/owner/courts/{court_id}/slots/generate` | owner |
| DELETE | `/owner/courts/{court_id}/slots/{slot_id}` | owner |
| PATCH | `/owner/courts/{court_id}/slots/{slot_id}` | owner |
| GET | `/owner/dashboard/analytics` | owner |
| GET | `/owner/dashboard/bookings` | owner |
| POST | `/owner/dashboard/bookings/{booking_id}/remind` | owner |
| GET | `/owner/dashboard/pending-approvals` | owner |
| GET | `/owner/dashboard/revenue` | owner |
| GET | `/owner/dashboard/summary` | owner |
| DELETE | `/owner/equipment/{equipment_id}` | owner |
| PATCH | `/owner/equipment/{equipment_id}` | owner |
| PATCH | `/owner/equipment/{equipment_id}/quantity` | owner |
| POST | `/owner/payments/{payment_id}/approve` | owner |
| POST | `/owner/payments/{payment_id}/reject` | owner |
| GET | `/owner/pricing-rules` | owner |
| GET | `/owner/refunds` | owner |
| POST | `/owner/refunds/{refund_id}/mark-paid` | owner |
| GET | `/owner/reports` | owner |
| GET | `/owner/reviews/unanswered-count` | owner |
| POST | `/owner/reviews/{review_id}/response` | owner |
| GET | `/payments/by-group/{booking_group_id}` | any signed-in user |
| GET | `/payments/dev-checkout/{txn}` | nobody (public) |
| POST | `/payments/dev-checkout/{txn}` | nobody (public) |
| POST | `/payments/initiate` | any signed-in user |
| POST | `/payments/initiate-balance` | any signed-in user |
| GET | `/payments/methods` | any signed-in user |
| GET | `/payments/my` | any signed-in user |
| GET | `/payments/return` | nobody (public) |
| GET | `/payments/{payment_id}/events` | any signed-in user |
| POST | `/payments/{payment_id}/receipt` | any signed-in user |
| GET | `/payments/{payment_id}/receipt.pdf` | any signed-in user |
| POST | `/payments/{payment_id}/simulate-confirm` | any signed-in user |
| GET | `/recommendations` | any signed-in user |
| GET | `/reports/my-bookings` | any signed-in user |
| GET | `/reviews/my` | any signed-in user |
| DELETE | `/reviews/{review_id}` | any signed-in user |
| PUT | `/reviews/{review_id}` | any signed-in user |
| POST | `/reviews/{review_id}/report` | any signed-in user |
| GET | `/search/nlp` | nobody (public) |
| POST | `/uploads/image` | any signed-in user |
| GET | `/users/me` | any signed-in user |
| PUT | `/users/me` | any signed-in user |
| POST | `/users/me/delete` | any signed-in user |
| POST | `/users/me/delete/verify` | any signed-in user |
| POST | `/users/me/email` | any signed-in user |
| POST | `/users/me/email/verify` | any signed-in user |
| PUT | `/users/me/password` | any signed-in user |
| POST | `/users/me/password/verify` | any signed-in user |
| POST | `/users/me/phone` | any signed-in user |
| POST | `/users/me/phone/verify` | any signed-in user |
| POST | `/webhooks/{payment_method}` | nobody (public) |
