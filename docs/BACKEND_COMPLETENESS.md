# Backend completeness audit

Audit of 2026-10-15 on branch `prototype-screens`: does every action on every screen of the four surfaces (player app, owner dashboard, admin dashboard, admin phone screens) reach a real backend route that does real work?

## How this was checked, and what it does not prove

* **Routes:** all 169 backend routes were read from the running app's OpenAPI description.
* **Calls:** every call made through the front ends' API helpers was found in the source (94 in the phone app, 92 in the web app). Each one matched a backend route (after ignoring query-string text).
* **Screens:** for each of the 57 phone screens and 31 web pages the source imports were followed (screen, component, hook, service function) to list the routes the screen can reach.
* **Tests:** a route counts as tested when a backend test calls that method and path. The earlier integration scenarios (S1 to S13, real browsers) walked the same screens by hand-like scripts; they are in `docs/INTEGRATION_TEST_REPORT.md`.
* **Limits:** this is a static reading plus tests. I did not press every button of every screen in this audit, and a call built in a way the reader does not recognise (for example a downloaded file) could be missed; those were searched by name one by one (see "Routes with no screen").

Status words: **works** = a real route doing real work. **by design** = deliberately limited (card, wallets). **dev only** = refused outside development. No route was found that returns a made-up answer to a screen.

## Player app (phone)

| Screen | Routes it reaches (the actions) | Status | Tested |
|---|---|---|---|
| `/admin-code` | GET /users/me<br>POST /auth/admin/resend-code<br>POST /auth/admin/verify-code | works | 3 of 3 |
| `/forgot-password` | POST /auth/forgot-password | works | 1 of 1 |
| `/index` | GET /users/me<br>POST /auth/google<br>POST /auth/login | works with a Google ID token once GOOGLE_CLIENT_IDS is set; until then "not available yet" (by design) | 3 of 3 |
| `/login` | GET /users/me<br>POST /auth/google<br>POST /auth/login | works with a Google ID token once GOOGLE_CLIENT_IDS is set; until then "not available yet" (by design) | 3 of 3 |
| `/register` | POST /auth/google<br>POST /auth/register | works with a Google ID token once GOOGLE_CLIENT_IDS is set; until then "not available yet" (by design) | 2 of 2 |
| `/reset-password` | POST /auth/forgot-password<br>POST /auth/reset-password | works | 2 of 2 |
| `/verify-otp` | GET /users/me<br>POST /auth/resend-otp<br>POST /auth/verify-otp | works | 3 of 3 |
| `/bookings` | GET /bookings/groups | works | 1 of 1 |
| `/index` | DELETE /arenas/{x}/like<br>GET /arenas<br>GET /arenas/liked<br>GET /arenas/trending<br>GET /notifications<br>GET /recommendations<br>POST /arenas/{x}/like | works | 7 of 7 |
| `/play` | GET /matches<br>GET /matches/mine | works | 2 of 2 |
| `/profile` | GET /arenas/liked<br>GET /bookings/groups<br>GET /reviews/my<br>POST /auth/logout * | works | 3 of 4 |
| `/results` | DELETE /arenas/{x}/like<br>GET /arenas<br>GET /arenas/liked<br>GET /search/nlp<br>POST /arenas/{x}/like | works | 5 of 5 |
| `/search` | - | static screen: no server call | 0 of 0 |
| `/arena/[id]` | DELETE /arenas/{x}/like<br>GET /arenas/liked<br>GET /arenas/{x}<br>GET /arenas/{x}/courts<br>GET /arenas/{x}/reviews<br>GET /arenas/{x}/reviews/summary<br>GET /arenas/{x}/slots-today<br>POST /arenas/{x}/like | works | 8 of 8 |
| `/arena/[id]/reviews` | DELETE /reviews/{x}<br>GET /arenas/{x}<br>GET /arenas/{x}/reviews<br>GET /arenas/{x}/reviews/summary<br>GET /bookings/groups<br>POST /arenas/{x}/reviews<br>POST /reviews/{x}/report<br>PUT /reviews/{x} | works | 8 of 8 |
| `/booking/[courtId]` | GET /arenas/{x}<br>GET /arenas/{x}/courts<br>GET /arenas/{x}/equipment<br>GET /arenas/{x}/reviews/summary<br>POST /bookings/preview | works | 5 of 5 |
| `/booking/awaiting/[groupId]` | GET /bookings/group/{x} | works | 1 of 1 |
| `/booking/bank/[groupId]` | GET /arenas/{x}/bank-details<br>GET /bookings/group/{x}<br>POST /bookings/group/{x}/release<br>POST /payments/{x}/receipt | works | 4 of 4 |
| `/booking/confirmed/[groupId]` | GET /arenas/{x}/courts<br>GET /bookings/group/{x} | works | 2 of 2 |
| `/booking/detail/[groupId]` | GET /arenas/{x}/courts<br>GET /arenas/{x}/reviews/summary<br>GET /bookings/group/{x}<br>GET /bookings/group/{x}/cancel-preview<br>POST /bookings/group/{x}/cancel | works | 5 of 5 |
| `/booking/failed/[groupId]` | GET /bookings/group/{x} | works | 1 of 1 |
| `/booking/move/[groupId]` | GET /bookings/group/{x}<br>GET /courts/{x}/slots<br>POST /bookings/group/{x}/reschedule<br>POST /bookings/group/{x}/reschedule-preview * | works | 3 of 4 |
| `/booking/payment` | GET /bookings/group/{x}<br>GET /payments/by-group/{x}<br>GET /payments/methods<br>POST /bookings<br>POST /bookings/group/{x}/release<br>POST /bookings/preview<br>POST /payments/initiate | works for Bank transfer; Card "Not available yet", JazzCash and EasyPaisa "Coming soon" (by design) | 7 of 7 |
| `/booking/slot-lost` | GET /arenas/{x}/courts | works | 1 of 1 |
| `/court/[id]/slots` | GET /arenas/{x}/courts<br>GET /courts/{x}/availability<br>GET /courts/{x}/slots | works | 3 of 3 |
| `/filters` | GET /arenas<br>GET /search/nlp | works | 2 of 2 |
| `/health` | - | static screen: no server call | 0 of 0 |
| `/notifications` | GET /bookings/{x}<br>GET /notifications<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 4 of 4 |
| `/one-more-step` | POST /auth/google/phone | works after a Google sign-in | 1 of 1 |
| `/play/[matchId]` | DELETE /matches/{x}<br>GET /matches/{x}<br>POST /matches/{x}/join<br>POST /matches/{x}/leave | works | 4 of 4 |
| `/play/create` | GET /bookings/groups<br>GET /matches/mine<br>POST /matches | works | 3 of 3 |
| `/profile/change-email` | POST /users/me/email<br>POST /users/me/email/verify | works | 2 of 2 |
| `/profile/change-password` | POST /users/me/password/verify *<br>PUT /users/me/password | works | 1 of 2 |
| `/profile/change-phone` | POST /users/me/phone *<br>POST /users/me/phone/verify * | works | 0 of 2 |
| `/profile/edit` | PUT /users/me | works | 1 of 1 |
| `/profile/liked` | DELETE /arenas/{x}/like<br>GET /arenas/liked<br>POST /arenas/{x}/like | works | 3 of 3 |
| `/profile/payments` | GET /payments/my | works | 1 of 1 |
| `/profile/report` | GET /bookings/groups | works | 1 of 1 |
| `/profile/reviews` | DELETE /reviews/{x}<br>GET /reviews/my | works | 2 of 2 |
| `/profile/settings` | DELETE /users/me<br>PUT /users/me | works | 2 of 2 |
| `/support/[id]` | GET /complaints/{x} | works | 1 of 1 |
| `/support/assistant` | POST /assistant/ask | works | 1 of 1 |
| `/support/faq` | - | static screen: no server call | 0 of 0 |
| `/support/index` | GET /complaints/my | works | 1 of 1 |
| `/support/new` | POST /complaints | works | 1 of 1 |

## Admin phone screens

| Screen | Routes it reaches (the actions) | Status | Tested |
|---|---|---|---|
| `/admin/approvals` | GET /admin/arena-cards * | works | 0 of 1 |
| `/admin/complaints` | GET /admin/complaints | works | 1 of 1 |
| `/admin/index` | GET /admin/phone/overview *<br>GET /notifications | works | 1 of 2 |
| `/admin/more` | POST /auth/logout * | works | 0 of 1 |
| `/admin/approvals/[id]` | GET /admin/arenas/{x}/summary *<br>POST /admin/arenas/{x}/approve<br>POST /admin/arenas/{x}/reject | works | 2 of 3 |
| `/admin/arenas/[id]` | GET /admin/arenas/{x}/summary *<br>POST /admin/arenas/{x}/reactivate *<br>POST /admin/arenas/{x}/suspend * | works | 0 of 3 |
| `/admin/arenas/index` | GET /admin/arena-cards * | works | 0 of 1 |
| `/admin/complaints/[id]` | GET /admin/complaints/{x} *<br>PUT /admin/complaints/{x} | works | 1 of 2 |
| `/admin/notifications` | GET /notifications<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 3 of 3 |
| `/admin/payments` | GET /admin/payments<br>GET /admin/refunds *<br>POST /admin/refunds/{x}/mark-paid * | works | 1 of 3 |
| `/admin/users/[id]` | GET /admin/users/{x}<br>PATCH /admin/users/{x}/reactivate<br>PATCH /admin/users/{x}/suspend | works | 3 of 3 |
| `/admin/users/index` | GET /admin/users | works | 1 of 1 |

## Owner dashboard (web)

| Screen | Routes it reaches (the actions) | Status | Tested |
|---|---|---|---|
| `/owner/arenas` | DELETE /owner/arenas/{x}<br>GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/courts<br>GET /owner/dashboard/analytics${qs  *<br>GET /owner/dashboard/revenue${qs  *<br>PATCH /notifications/{x}/read<br>PATCH /owner/arenas/{x} *<br>POST /notifications/read-all<br>POST /owner/arenas<br>POST /owner/arenas/{x}/resubmit | works | 9 of 12 |
| `/owner/bookings` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/bank-details<br>GET /owner/arenas/{x}/courts<br>GET /owner/dashboard/bookings<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all<br>POST /owner/dashboard/bookings/{x}/remind<br>POST /owner/payments/{x}/approve<br>POST /owner/payments/{x}/reject | works | 11 of 11 |
| `/owner/calendar` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/bookings/calendar<br>GET /owner/arenas/{x}/courts<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 7 of 7 |
| `/owner/courts` | DELETE /owner/courts/{x} *<br>GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/courts<br>GET /owner/courts/{x}/slots<br>PATCH /notifications/{x}/read<br>PATCH /owner/courts/{x}<br>PATCH /owner/courts/{x}/availability<br>PATCH /owner/courts/{x}/slots/{x}<br>POST /notifications/read-all<br>POST /owner/arenas/{x}/courts<br>POST /owner/courts/{x}/slots/generate | works | 12 of 13 |
| `/owner/equipment` | DELETE /owner/equipment/{x}<br>GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/equipment<br>PATCH /notifications/{x}/read<br>PATCH /owner/equipment/{x} *<br>PATCH /owner/equipment/{x}/quantity<br>POST /notifications/read-all<br>POST /owner/arenas/{x}/equipment | works | 9 of 10 |
| `/owner/notifications` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 5 of 5 |
| `/owner` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/bookings/calendar<br>GET /owner/arenas/{x}/courts<br>GET /owner/dashboard/analytics${qs  *<br>GET /owner/dashboard/pending-approvals<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 8 of 9 |
| `/owner/payments` | DELETE /owner/arenas/{x}/bank-details/{x}<br>DELETE /owner/arenas/{x}/discounts/{x} *<br>GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/bank-details<br>GET /owner/arenas/{x}/discounts<br>GET /owner/refunds<br>PATCH /notifications/{x}/read<br>PATCH /owner/arenas/{x}/bank-details/{x}<br>PATCH /owner/arenas/{x}/discounts/{x} *<br>POST /notifications/read-all<br>POST /owner/arenas/{x}/bank-details<br>POST /owner/arenas/{x}/discounts<br>POST /owner/refunds/{x}/mark-paid | works | 13 of 15 |
| `/owner/pricing` | DELETE /owner/courts/{x}/pricing-rules/{x}<br>GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/courts<br>GET /owner/pricing-rules${arenaId  *<br>PATCH /notifications/{x}/read<br>PATCH /owner/courts/{x}/pricing-rules/{x} *<br>POST /notifications/read-all<br>POST /owner/courts/{x}/pricing-rules | works | 8 of 10 |
| `/owner/profile` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all<br>POST /users/me/email<br>POST /users/me/email/verify<br>POST /users/me/password/verify *<br>POST /users/me/phone *<br>POST /users/me/phone/verify *<br>PUT /users/me<br>PUT /users/me/password | works | 9 of 12 |
| `/owner/reports` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/bookings/calendar<br>GET /owner/dashboard/analytics${qs  *<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 6 of 7 |
| `/owner/revenue` | GET /admin/dashboard/overview<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/dashboard/analytics${qs  *<br>GET /owner/dashboard/revenue${qs  *<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all | works | 5 of 7 |
| `/owner/reviews` | GET /admin/dashboard/overview<br>GET /arenas/{x}/reviews/summary<br>GET /notifications<br>GET /owner/arenas<br>GET /owner/arenas/{x}/reviews<br>PATCH /notifications/{x}/read<br>POST /notifications/read-all<br>POST /owner/reviews/{x}/response | works | 8 of 8 |

## Admin dashboard (web)

| Screen | Routes it reaches (the actions) | Status | Tested |
|---|---|---|---|
| `/admin/arenas/all` | DELETE /admin/arenas/{x} *<br>GET /admin/arenas<br>GET /admin/arenas/{x} *<br>POST /admin/arenas/{x}/reactivate *<br>POST /admin/arenas/{x}/suspend * | works | 1 of 5 |
| `/admin/arenas` | GET /admin/arenas<br>POST /admin/arenas/{x}/approve<br>POST /admin/arenas/{x}/reject | works | 3 of 3 |
| `/admin/bookings` | GET /admin/bookings | works | 1 of 1 |
| `/admin/complaints` | GET /admin/complaints<br>PUT /admin/complaints/{x} | works | 2 of 2 |
| `/admin/owners` | DELETE /admin/users/{x}<br>GET /admin/users<br>GET /admin/users/{x}<br>PATCH /admin/users/{x}/reactivate<br>PATCH /admin/users/{x}/suspend | works | 5 of 5 |
| `/admin` | GET /admin/arenas<br>GET /admin/complaints<br>GET /admin/dashboard/overview<br>POST /admin/arenas/{x}/approve<br>POST /admin/arenas/{x}/reject | works | 5 of 5 |
| `/admin/payments` | GET /admin/payments | works | 1 of 1 |
| `/admin/reports` | GET /admin/dashboard/overview | works | 1 of 1 |
| `/admin/reviews` | DELETE /reviews/{x}<br>GET /admin/reviews<br>POST /admin/reviews/{x}/dismiss | works | 3 of 3 |
| `/admin/settings` | GET /admin/audit-logs<br>GET /admin/settings<br>PUT /admin/settings | works | 3 of 3 |
| `/admin/users` | DELETE /admin/users/{x}<br>GET /admin/users<br>GET /admin/users/{x}<br>PATCH /admin/users/{x}/reactivate<br>PATCH /admin/users/{x}/suspend | works | 5 of 5 |

## Web sign-in and public pages

| Screen | Routes it reaches (the actions) | Status | Tested |
|---|---|---|---|
| `/forgot-password` | POST /auth/forgot-password | works | 1 of 1 |
| `/login` | GET /users/me<br>POST /auth/login | works | 2 of 2 |
| `/register` | GET /users/me<br>POST /auth/register<br>POST /auth/resend-otp<br>POST /auth/verify-otp | works | 4 of 4 |
| `/reset-password` | POST /auth/forgot-password<br>POST /auth/reset-password | works | 2 of 2 |
| `/admin/login` | GET /users/me<br>POST /auth/admin/resend-code<br>POST /auth/admin/verify-code<br>POST /auth/login | works | 4 of 4 |
| `/health` | - | static screen: no server call | 0 of 0 |
| `/page` | - | static screen: no server call | 0 of 0 |

`*` = no backend test calls that exact method and path.

## Routes with no screen

Searched by name in all three front ends (the helper-based reading cannot see downloads or form uploads, so those are named here).

| Route | Used by | Verdict |
|---|---|---|
| `GET /health` | phone and web Health pages, start-up check | works (called by name) |
| `POST /auth/refresh` | the shared API helper of both apps, not a screen | works |
| `POST /uploads/image` | phone receipt, avatar and arena photo pickers (form upload) | works |
| `GET /payments/{x}/receipt.pdf` | phone booking detail "receipt" file | works |
| `GET /reports/my-bookings` | phone Profile, Booking report file | works |
| `GET /owner/reports` | owner Reports page (file download) | works |
| `GET /admin/reports` | admin Reports page (file download) | works |
| `POST /webhooks/{x}` | payment gateways, never a screen | works; signed; see docs/SECURITY.md (no direct test) |
| `POST /payments/{x}/simulate-confirm` | tests and developers only | dev only (404 outside development) |
| `GET /owner/arenas/{x}/blocked-dates` | no screen | backend only: not in any approved requirement or prototype; not built (no direct test) |
| `POST /owner/arenas/{x}/blocked-dates` | no screen | backend only: not built |
| `DELETE /owner/arenas/{x}/blocked-dates/{x}` | no screen | backend only: not built (no direct test) |
| `POST /admin/bookings/{x}/force-refund` | no screen | backend only: no admin Bookings button in the prototype; not built |
| `GET /payments/{x}/events` | no screen | backend only: not built |
| `POST /payments/initiate-balance` | no screen | backend only: balance is paid at the arena today; not built |
| `GET /owner/arenas/{x}/bookings` | no screen (the web uses /owner/dashboard/bookings) | backend only; not needed (no direct test) |
| `GET /owner/courts/{x}` | no screen (the list covers it) | backend only; not needed |
| `DELETE /owner/courts/{x}/slots/{x}` | no screen (owners block a slot instead) | backend only; not needed |
| `GET /owner/dashboard/analytics` | owner Dashboard and Revenue (query-string call) | works |
| `GET /owner/dashboard/revenue` | owner Revenue (query-string call) | works |
| `GET /owner/pricing-rules` | owner Pricing (query-string call) | works |
| `GET /arenas` | phone and web (query-string call) | works |
| `GET /arenas/trending` | phone Home (query-string call) | works |
| `GET /bookings` | phone (query-string call) | works |
| `GET /matches` | phone Play (query-string call) | works |
| `GET /admin/refunds` | admin phone Refunds (query-string call) | works (no direct test) |
| `GET /admin/arena-cards` | admin phone Arenas (query-string call) | works (no direct test) |

## Markers searched (TODO, FIXME, mock, simulate, fake, stub, 501, "not implemented", hard-coded demo data)

| Where | What | Verdict |
|---|---|---|
| `backend/app/integrations/payments/stripe_provider.py` | "Falls back to a deterministic simulation when STRIPE_SECRET_KEY isn't set" (refund path only; starting a card payment without a key answers "Card payments are not available yet.") | Card stays "Not available yet". Not reachable from a screen without a real key. |
| `backend/app/integrations/payments/jazzcash.py`, `easypaisa.py` | Deterministic simulators behind the provider interface | Wallets stay "Coming soon" (`methods.py`); a payment cannot be started on them. Webhooks need a configured signing secret. |
| `backend/app/integrations/payments/mock.py`, `PAYMENT_MODE=mock` | Lets every method through (development and tests) | **Must never be set in production**: Phase 2 adds a start-up refusal. |
| `backend/app/modules/payment/service.py` `dev_simulate_confirm` | Dev-only payment confirmation | Refused outside development (404). No screen calls it. |
| `backend/app/cache/*` ("fake") | Test doubles for Redis | Tests only. |
| Front ends | `Math.random` (animation order, request jitter), "Coming soon" tags on payment methods, a `TODO` about moving a chart hook | No hard-coded demo data, no mock responses in the app code. |
| 501 / "not implemented" | none found | - |


## Before and after

| Measure | Before this audit | After |
|---|---|---|
| Backend routes | 169 | 169 (no route added; none removed) |
| Routes a test answers successfully (recorded while the suite runs, `ROUTE_HITS_FILE` in `tests/conftest.py`) | 161 of 169 | **169 of 169** |
| Routes with no screen and no requirement (left alone, listed above) | 9 | 9 |
| Front-end calls with no backend route | 0 | 0 |
| Simulated or fake behaviour reachable from a screen | none (card, JazzCash and EasyPaisa are refused by `methods.py`; `simulate-confirm` is dev only) | none |
| Notice types with a sender | 30 of 30 | 30 of 30 (27 reachable in the apps today; 3 need a payment gateway, a deferred item) |

Gaps fixed, each with a test (`backend/tests/modules/test_completeness.py`, 8 tests): log out; password change by code (every other session ends); phone change by code; edit and delete a discount code (another owner cannot); an owner's bookings list for their own arena only; court, pricing-rule and equipment edits and deletes; blocked dates; admin arena and complaint detail.

Added for reaching states without waiting: `backend/scripts/run_sweeps.py --advance-hours N` (development only). "How to reach each state" is section 13 of `docs/RUN_ON_PHONE.md`.

## Decisions left for the owner (not built)

* **Block a whole day** (owner): the routes exist and the player side honours them, but no approved requirement or prototype has a screen for it.
* **Admin force refund**, **payment step history** and **pay the balance through a gateway**: routes exist; no screen is drawn for them.
