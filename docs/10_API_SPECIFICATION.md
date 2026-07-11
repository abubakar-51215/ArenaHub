# Arena Hub — API Specification

**Version:** 2.0  
**Framework:** FastAPI (Python)  
**Base URL:** `/api/v1`  
**Auth:** JWT Bearer Token (except public endpoints)

---

## 1. Authentication Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /auth/register | Public | Register player or owner account |
| POST | /auth/verify-otp | Public | Verify OTP for registration |
| POST | /auth/login | Public | Login and receive JWT tokens |
| POST | /auth/refresh | Public | Refresh access token |
| POST | /auth/logout | Authenticated | Invalidate tokens |
| POST | /auth/forgot-password | Public | Request password reset email |
| POST | /auth/reset-password | Public | Reset password with verification token |

---

## 2. User / Profile Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /users/me | Player/Owner | Get own profile |
| PUT | /users/me | Player/Owner | Update own profile |
| PUT | /users/me/password | Player/Owner | Change password |
| DELETE | /users/me | Player/Owner | Delete own account |
| POST | /users/me/profile-picture | Player/Owner | Upload profile picture |

---

## 3. Arena Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /arenas | Public | Search arenas (with filters, NLP, location) |
| GET | /arenas/{id} | Public | Get arena details with courts, amenities, reviews |
| POST | /arenas | Owner | Register new arena |
| PUT | /arenas/{id} | Owner | Update own arena |
| DELETE | /arenas/{id} | Owner | Delete own arena |
| GET | /arenas/nearby | Public | Get arenas by GPS coordinates |
| GET | /arenas/recommended | Player | Get AI recommendations |
| POST | /arenas/{id}/like | Player | Add to liked arenas |
| DELETE | /arenas/{id}/like | Player | Remove from liked arenas |
| GET | /arenas/liked | Player | Get liked arenas list |

---

## 4. Court Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /arenas/{arena_id}/courts | Public | Get courts for arena |
| POST | /arenas/{arena_id}/courts | Owner | Add court |
| PUT | /courts/{id} | Owner | Update court |
| DELETE | /courts/{id} | Owner | Delete court |
| PATCH | /courts/{id}/availability | Owner | Toggle availability |

---

## 5. Slot Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /courts/{court_id}/slots | Public | Get slots for date (REST) |
| WS | /ws/slots/{court_id}/{date} | Public | Real-time slot updates (WebSocket) |

---

## 6. Booking Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /bookings | Player | Create booking (acquires Redis lock) |
| GET | /bookings/my | Player | Get own bookings (upcoming/history/cancelled) |
| GET | /bookings/{id} | Player/Owner | Get booking details |
| POST | /bookings/{id}/cancel | Player | Cancel booking |
| POST | /bookings/{id}/approve | Owner | Approve booking |
| POST | /bookings/{id}/reject | Owner | Reject booking |
| GET | /bookings/arena/{arena_id} | Owner | Get bookings for arena |

---

## 7. Payment Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /payments/stripe | Player | Process Stripe payment |
| POST | /payments/jazzcash | Player | Process JazzCash payment |
| POST | /payments/easypaisa | Player | Process EasyPaisa payment |
| GET | /payments/my | Player | Get own payment history |
| GET | /payments/booking/{booking_id} | Player/Owner | Get payment for booking |
| POST | /payments/{id}/refund | System | Initiate refund |

---

## 8. Equipment Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /arenas/{arena_id}/equipment | Public | Get equipment list |
| POST | /arenas/{arena_id}/equipment | Owner | Add equipment |
| PUT | /equipment/{id} | Owner | Update equipment |
| DELETE | /equipment/{id} | Owner | Delete equipment |

---

## 9. Review Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /arenas/{arena_id}/reviews | Public | Get reviews for arena |
| POST | /arenas/{arena_id}/reviews | Player | Submit review |
| PUT | /reviews/{id} | Player | Edit own review |
| DELETE | /reviews/{id} | Player/Admin | Delete review |

---

## 10. Notification Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /notifications | Authenticated | Get own notifications |
| PATCH | /notifications/{id}/read | Authenticated | Mark as read |
| POST | /notifications/read-all | Authenticated | Mark all as read |

---

## 11. Complaint Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /complaints | Player | Submit complaint |
| GET | /complaints/my | Player | Get own complaints |

---

## 12. Report Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /reports/my-bookings | Player | Download booking report PDF |
| GET | /reports/owner/bookings | Owner | Download booking report |
| GET | /reports/owner/revenue | Owner | Download revenue report |
| GET | /reports/owner/payments | Owner | Download payment report |
| GET | /reports/admin/users | Admin | Download user report |
| GET | /reports/admin/arenas | Admin | Download arena report |
| GET | /reports/admin/bookings | Admin | Download platform booking report |
| GET | /reports/admin/revenue | Admin | Download platform revenue report |

---

## 13. Admin Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /admin/users | Admin | List all users with filters |
| GET | /admin/users/{id} | Admin | Get user details |
| PATCH | /admin/users/{id}/suspend | Admin | Suspend account |
| PATCH | /admin/users/{id}/reactivate | Admin | Reactivate account |
| GET | /admin/arenas/pending | Admin | Get pending arenas |
| POST | /admin/arenas/{id}/approve | Admin | Approve arena |
| POST | /admin/arenas/{id}/reject | Admin | Reject arena with reason |
| GET | /admin/bookings | Admin | Get all bookings |
| GET | /admin/payments | Admin | Get all payments |
| GET | /admin/complaints | Admin | Get all complaints |
| PUT | /admin/complaints/{id} | Admin | Respond to complaint |
| GET | /admin/dashboard | Admin | Get dashboard metrics |

---

## 14. Pricing Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /courts/{court_id}/pricing | Public | Get pricing rules |
| PUT | /courts/{court_id}/pricing | Owner | Update base price |
| POST | /courts/{court_id}/peak-pricing | Owner | Add peak pricing rule |
| DELETE | /peak-pricing/{id} | Owner | Remove peak pricing rule |

---

## 15. Refund Policy Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /arenas/{arena_id}/refund-policy | Public | Get refund policy |
| PUT | /arenas/{arena_id}/refund-policy | Owner | Update refund policy |
| PUT | /arenas/{arena_id}/payment-settings | Owner | Update advance % and payment settings |

---

End of Document
