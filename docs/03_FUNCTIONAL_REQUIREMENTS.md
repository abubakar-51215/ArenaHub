# Arena Hub — Functional Requirements Specification

**Version:** 2.0

---

## 1. System Actors

| Actor | Platform | Description |
|---|---|---|
| Player | React Native Mobile App | Searches, books, pays for sports arenas |
| Arena Owner | Next.js Web Dashboard | Manages facilities, approves bookings, tracks revenue |
| Administrator | Next.js Web Dashboard | Monitors platform, verifies arenas, manages accounts |

---

## 2. Player Functional Requirements

### FR-P-01: User Registration
- The system shall allow players to register with full name, email, phone number, and password.
- The system shall validate email and phone number uniqueness.
- The system shall enforce password strength: minimum 8 characters, one uppercase, one number, one special character.
- The system shall send an OTP to the player's email or phone for verification.
- The system shall activate the account only after successful OTP verification.
- The system shall assign the Player role upon registration.

### FR-P-02: User Login and Session Management
- The system shall authenticate players using email and password.
- The system shall issue JWT access token (15 min expiry) and refresh token (7 days) upon login.
- The system shall auto-refresh access tokens using the refresh token.
- The system shall invalidate all tokens on logout.
- The system shall lock accounts after 5 consecutive failed login attempts for 15 minutes.
- The system shall support password reset via email verification link.
- The system shall validate new passwords meet strength requirements during reset.

### FR-P-03: Profile Management
- The player shall be able to view and edit their profile (name, phone, bio, profile picture).
- The player shall be able to set preferred sports and preferred locations.
- The player shall be able to change their password.
- The player shall be able to delete their account.

### FR-P-04: Arena Search and Discovery
- The player shall be able to search arenas by name, location, sport type, and price range.
- The system shall display nearby arenas on Google Maps based on GPS location.
- The player shall be able to filter results by rating, availability, distance, and sport category.
- The player shall be able to sort results by distance, price, or rating.
- The system shall store recent search queries for quick repeat searches.
- The system shall display search results as cards with arena name, sport types, rating, distance, and price.

### FR-P-05: NLP Search
- The system shall process natural language queries (e.g., "best football ground near me").
- The system shall extract sport type and location keywords from the query.
- The system shall return ranked arena results based on extracted criteria.

### FR-P-06: Arena Details
- The system shall display: arena name, description, images (gallery), address, contact info.
- The system shall display supported sports and available courts.
- The system shall display amenities: parking, washroom, shower, canteen, WiFi, first aid, drinking water, changing room, floodlights, seating area.
- The system shall display pricing (hourly rates, equipment charges).
- The system shall display average rating and individual user reviews.
- The system shall display the arena location on an embedded Google Map with navigation option.

### FR-P-07: Real-Time Slot Availability
- The system shall display available, reserved, and unavailable slots for a selected court and date.
- Slot availability shall update in real time via WebSocket connections.
- When another player books a slot, all connected clients shall see the update immediately.
- The system shall display standard or peak-hour pricing for each slot.

### FR-P-08: Court Booking with Distributed Locking
- The player shall be able to select a court, date, and time slot for booking.
- The system shall acquire a Redis distributed lock on the court-date-time key.
- The system shall reject the booking if the lock is already held by another transaction.
- The system shall release the lock after the transaction completes (success or failure).
- The system shall set auto-expiry on locks to prevent deadlocks.
- The system shall display a booking summary before payment.
- The system shall perform a final availability check before locking.

### FR-P-09: Payment Processing
- The system shall support Stripe (credit/debit), JazzCash (mobile wallet), and EasyPaisa (mobile wallet).
- The system shall offer two payment options: full payment or advance payment (% set by arena owner).
- The system shall confirm booking only after successful payment.
- The system shall generate a digital receipt with booking ID, amounts, and payment method.
- No on-spot cash-only bookings are permitted.
- The system shall store complete transaction records (amount, method, status, gateway ID, timestamp).
- Advance payment receipts shall show: total amount, advance paid, remaining balance.

### FR-P-10: Booking Approval
- After payment, booking status shall be "Pending Approval".
- The player shall see "Waiting for Approval" on their booking screen.
- The arena owner must manually approve the booking.
- Upon approval, status changes to "Confirmed" and the player receives a notification.
- If rejected, the system shall initiate a refund and notify the player.

### FR-P-11: Booking History and Management
- The system shall display bookings in Upcoming, Completed, and Cancelled tabs.
- The player shall be able to view full details of any booking.
- The player shall be able to cancel upcoming bookings within the cancellation window.
- The system shall release the slot after cancellation and initiate refund per policy.
- The system shall display cancellation policy and refund status.

### FR-P-12: Liked Arenas (Favorites)
- The player shall be able to add arenas to a "Liked Arenas" list.
- The player shall be able to view and manage their liked arenas.
- The player shall be able to remove arenas from the liked list.

### FR-P-13: Equipment Rental
- The player shall be able to view available equipment at an arena.
- The player shall be able to add equipment to a booking as an addon.
- Equipment pricing shall be displayed per item.
- Equipment availability shall be checked before confirming the rental.

### FR-P-14: Reviews and Ratings
- The player shall submit a star rating (1-5) and text review for arenas with completed bookings.
- The system shall recalculate the arena's average rating after each review.
- The player shall be able to edit or delete their own review.
- The system shall prevent duplicate reviews per booking.
- Reviews shall display reviewer name, rating, text, and date.

### FR-P-15: AI Recommendations
- The system shall recommend arenas based on location, preferred sports, booking history, and budget.
- Recommendations shall appear on the home screen.
- The system shall suggest nearby alternatives when a preferred arena is fully booked.

### FR-P-16: Push Notifications
- The system shall notify the player when: booking is confirmed, payment is received, booking is approved by owner, booking reminder, booking is cancelled, refund is processed.
- Notifications shall be delivered via Firebase Cloud Messaging.
- The player shall be able to view notification history in-app.

### FR-P-17: Report Generation
- The player shall be able to download their booking history as a report.
- The player shall be able to download payment receipts.

---

## 3. Arena Owner Functional Requirements

### FR-O-01: Owner Registration and Login
- The system shall allow arena owners to register with name, email, phone, password, business name, and business contact.
- OTP verification shall be required for owner registration.
- The system shall authenticate owners with JWT tokens.
- Password strength requirements and reset functionality same as player.

### FR-O-02: Arena Registration and Management
- The owner shall register arenas with: name, address, GPS coordinates, description, sports offered, operating hours, images, and amenities.
- Amenities include: parking, washroom, shower, canteen, WiFi, first aid, drinking water, changing room, floodlights, seating area.
- New arenas shall have "Pending Approval" status until admin verifies.
- The owner shall be able to edit or delete existing arenas.
- The system shall notify the admin when a new arena is submitted.

### FR-O-03: Court Management
- The owner shall add courts with name, sport type(s), and capacity.
- The owner shall edit or delete courts.
- The owner shall toggle court availability (active / under maintenance).
- The system shall prevent booking of unavailable courts.

### FR-O-04: Pricing Management
- The owner shall set a base hourly price per court.
- The owner shall define peak-hour pricing with time ranges and rates.
- The system shall apply correct pricing during player slot selection.

### FR-O-05: Payment Configuration
- The owner shall configure: advance payment percentage (e.g., 20%, 30%, 50%) or full payment requirement.
- The owner shall configure cancellation/refund policy: refund window (hours before booking) and refund percentage per tier.
- Default policy: >6 hours = full refund, <6 hours = no refund.
- The owner can set "No Refunds Allowed" if desired.

### FR-O-06: Booking Approval
- The owner shall receive notifications for new bookings after payment.
- The owner shall manually approve or reject bookings from the dashboard.
- Approved bookings change to "Confirmed" with notification to player and admin.
- Rejected bookings trigger refund and notification to player.

### FR-O-07: Booking and Calendar Management
- The owner shall view all bookings with status, dates, player details.
- The owner shall access a calendar view for scheduling.
- The owner shall receive notifications for booking cancellations.

### FR-O-08: Equipment Management
- The owner shall add, edit, and delete equipment items.
- The owner shall set rental prices per equipment item.
- The system shall track equipment availability.

### FR-O-09: Revenue and Earnings
- The system shall display revenue breakdown: daily, weekly, monthly.
- The system shall display total earnings and pending settlements.
- The system shall display payment records with transaction details.

### FR-O-10: Reports
- The owner shall generate and download: booking report, revenue report, payment report, occupancy/peak usage report.
- Reports shall be available in PDF format.

### FR-O-11: Notifications
- The owner shall receive notifications for: new booking, booking cancellation, payment received.
- The owner shall have a notification center on the dashboard.

---

## 4. Administrator Functional Requirements

### FR-A-01: Admin Login
- The system shall authenticate administrators with JWT tokens.
- Admin role has elevated access to all management features.

### FR-A-02: User and Owner Management
- The admin shall view all registered players and arena owners.
- The admin shall search/filter accounts by name, email, role, status.
- The admin shall suspend, deactivate, or reactivate accounts.
- The admin shall view detailed account info including booking history.
- The system shall notify the account holder of status changes.

### FR-A-03: Arena Verification
- The admin shall view all arenas with "Pending Approval" status.
- The admin shall approve or reject arenas with a reason.
- Approved arenas become visible to players.
- Rejected arenas trigger notification to owner with rejection reason.

### FR-A-04: Booking Monitoring
- The admin shall view all bookings across the platform.
- The admin shall receive notifications when owners approve bookings.
- The admin shall be able to investigate booking issues.

### FR-A-05: Payment Monitoring
- The admin shall view all payment transactions across the platform.
- The admin shall view transaction details (amount, method, status, gateway ID).

### FR-A-06: Complaint Management
- Players shall submit complaints through the app.
- The admin shall view, respond to, and resolve complaints.
- Complaint tickets shall have statuses: Open, Under Review, Resolved.

### FR-A-07: Reports and Analytics
- The admin shall generate system-wide reports: total users, total arenas, total bookings, total revenue.
- Reports shall be downloadable in PDF format.
- The admin dashboard shall display key metrics and trends.

---

## 5. System Functional Requirements

### FR-S-01: Distributed Locking
- The system shall use Redis distributed locking to prevent double bookings.
- Lock format: `lock:court:{id}:date:{d}:slot:{s}`
- Lock auto-expires after 30 seconds.

### FR-S-02: Real-Time Updates
- The system shall use WebSockets for live slot availability synchronization.
- All connected clients viewing the same arena receive instant updates.

### FR-S-03: Push Notifications
- The system shall use Firebase Cloud Messaging for all push notifications.

### FR-S-04: Authentication and Authorization
- The system shall use JWT-based authentication with RBAC.
- Three roles: Player, Arena Owner, Administrator.

### FR-S-05: Responsive Design
- The web dashboard shall be fully responsive for desktop, laptop, tablet, and mobile screens.
- The mobile app shall be responsive for phones and tablets/iPads.

---

End of Document
