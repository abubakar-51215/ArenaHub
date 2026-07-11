# Arena Hub — Project Overview

**Version:** 2.0  
**Status:** Development Phase  
**Methodology:** Agile (Iterative & Incremental)

---

## 1. Introduction

Arena Hub is a centralized sports arena booking and management platform that connects players with sports facility owners through a mobile and web-based system. The platform eliminates the traditional manual booking process that relies on phone calls, WhatsApp messages, registers, and physical visits.

---

## 2. Problem Statement

Sports facility booking in Pakistan remains largely manual. Players call arena owners, send WhatsApp messages, or physically visit venues to check availability. This creates:

- No real-time slot visibility for players
- Double booking conflicts when multiple people call simultaneously
- No centralized booking records for owners
- Limited or no online payment options
- Poor schedule management and manual record keeping
- Difficulty finding suitable arenas nearby
- No analytics or revenue tracking for owners
- No platform-level oversight or quality control

Arena owners face parallel challenges: managing schedules, bookings, customer records, pricing, payments, and equipment rentals entirely by hand.

---

## 3. Proposed Solution

Arena Hub provides a unified digital platform with three interfaces:

**For Players (React Native Mobile App):**
- Search and discover sports arenas with filters, NLP search, and Google Maps
- View real-time slot availability via WebSocket connections
- Book courts with distributed locking to prevent double bookings
- Pay online through Stripe, JazzCash, or EasyPaisa (full or advance payment)
- Receive push notifications for booking confirmations, reminders, and updates
- Rate and review arenas after completed bookings
- Rent sports equipment alongside bookings
- Receive AI-powered arena recommendations

**For Arena Owners (Next.js Web Dashboard):**
- Register arenas with details, images, amenities, and GPS coordinates
- Manage courts, pricing (base and peak-hour), and availability
- Manually approve bookings after payment confirmation
- Configure advance payment percentages and refund policies
- Track revenue with daily, weekly, and monthly reports
- Download and generate booking, payment, and revenue reports
- Receive notifications for new bookings and cancellations

**For Administrators (Next.js Web Dashboard):**
- Verify and approve newly registered arenas
- Manage player and arena owner accounts (suspend, reactivate)
- Monitor all bookings and payment transactions platform-wide
- Handle complaints and support tickets
- Generate system-wide reports (total users, arenas, revenue, bookings)
- Receive notifications when owners approve bookings

---

## 4. Project Objectives

1. Build a centralized sports arena booking platform for Pakistan
2. Provide real-time slot availability using WebSocket technology
3. Prevent double bookings using Redis distributed locking
4. Enable secure online payments with full and advance payment options
5. Simplify arena management for facility owners
6. Provide AI-based arena recommendations and NLP search
7. Support equipment rental as an add-on to bookings
8. Provide reviews and ratings for quality transparency
9. Enable configurable payment and refund policies per arena
10. Provide downloadable reports for all user roles
11. Ensure responsive design across all devices and screen sizes

---

## 5. Project Scope

### Included Features

**Player Module:**
- Registration with OTP verification (email/SMS)
- JWT authentication with access and refresh tokens
- Profile management (photo, bio, preferred sports, preferred locations)
- Arena search with filters (location, sport, price, rating, availability)
- NLP natural language search
- Google Maps integration (nearby arenas, navigation)
- Real-time slot availability via WebSockets
- Court booking with Redis distributed locking
- Online payment (Stripe, JazzCash, EasyPaisa) — full or advance
- Booking history (upcoming, completed, cancelled)
- Booking cancellation with configurable refund policy
- Equipment rental alongside bookings
- Reviews and ratings (1-5 stars + text)
- AI-powered arena recommendations
- Push notifications (FCM)
- Liked arenas section (favorites)
- Report generation and download

**Arena Owner Module:**
- Registration and login
- Arena registration with amenities (parking, washroom, shower, canteen, etc.)
- Court management (add, edit, delete, toggle availability)
- Pricing management (base rate, peak-hour rules)
- Payment configuration (advance percentage, full payment, refund policy)
- Manual booking approval after payment
- Booking management with calendar view
- Revenue and earnings tracking
- Report generation and download (bookings, payments, revenue)
- Notification management

**Admin Module:**
- Admin login with elevated access
- User and arena owner account management
- Arena verification and approval workflow
- Booking monitoring across the platform
- Payment transaction monitoring
- Complaint and support ticket management
- System-wide report generation and download
- Booking approval notification tracking

**System Features:**
- Redis distributed locking for concurrent booking prevention
- WebSocket real-time slot synchronization
- JWT with RBAC (Player, Owner, Admin roles)
- Firebase Cloud Messaging for push notifications
- PostgreSQL with ACID transactions for data integrity
- Responsive web design for all screen sizes
- Responsive mobile design for phones and tablets

### Excluded Features (Future Scope)

- Matchmaking system
- Team management and challenges
- Tournament management
- Dynamic AI pricing
- Loyalty programs and gamification
- AI chatbot support
- Multi-language support
- Advanced analytics dashboards

---

## 6. Stakeholders

### Primary Stakeholders

| Stakeholder | Role |
|---|---|
| Player | Searches, books, pays for sports arenas via mobile app |
| Arena Owner | Manages facilities, approves bookings, tracks revenue via web dashboard |
| System Administrator | Oversees platform, verifies arenas, manages accounts via admin panel |

### Secondary Stakeholders

| Stakeholder | Role |
|---|---|
| Stripe | International card payment processing |
| JazzCash | Local mobile wallet payments (Pakistan) |
| EasyPaisa | Local mobile wallet payments (Pakistan) |
| Google Maps API | Location services, arena mapping, navigation |
| Firebase Cloud Messaging | Push notification delivery |

---

## 7. Technology Stack

| Layer | Technology |
|---|---|
| Mobile Application | React Native (Android + iOS) |
| Web Dashboard | Next.js |
| Backend API | FastAPI (Python) |
| Primary Database | PostgreSQL |
| Caching & Locking | Redis |
| Real-Time Communication | WebSockets |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Payment Gateways | Stripe, JazzCash, EasyPaisa |
| Maps & Location | Google Maps API |
| Authentication | JWT (Access + Refresh Tokens) |
| Containerization | Docker + Docker Compose |

### Why PostgreSQL Over MongoDB

Initially MongoDB was selected for flexibility and rapid development. After further analysis, PostgreSQL was chosen because:

- Arena Hub is a transactional booking system where data consistency is critical
- Bookings, payments, refunds, and users have clear relational structures
- ACID transactions are essential for reservation and payment integrity
- Foreign keys enforce referential integrity across tables
- Better support for complex queries needed in reporting and analytics
- Examiners associate booking and payment systems with relational databases

Redis continues to be used alongside PostgreSQL for distributed locking and caching.

---

## 8. High-Level System Workflow

1. Player registers via mobile app with OTP verification
2. Player searches for sports arenas (filters, NLP, or map)
3. Player selects an arena, views details, amenities, and reviews
4. Player selects a court, date, and time slot (real-time via WebSocket)
5. System acquires a Redis distributed lock on the selected slot
6. Player selects payment type (full or advance as configured by owner)
7. Player completes payment through Stripe, JazzCash, or EasyPaisa
8. System creates booking with "Pending Approval" status
9. Arena Owner receives notification and manually approves the booking
10. Admin receives notification that booking is approved
11. Player receives confirmation notification
12. WebSocket broadcasts updated slot availability to all connected clients
13. After the booking is completed, player can leave a review and rating

---

## 9. Payment Model

### Payment Options (Configurable Per Arena)

**Option 1 — Full Payment:**
- Player pays 100% of the booking amount online
- Booking is created with "Pending Approval" status
- Receipt is generated with full payment details

**Option 2 — Advance Payment:**
- Player pays a predefined percentage (e.g., 20%, 30%, 50%) set by the arena owner
- Remaining amount is paid at the arena on arrival
- Booking is created with "Pending Approval" status
- Receipt shows: Total Amount, Advance Paid, Remaining Balance

**No on-spot cash-only bookings are allowed.** Every booking requires at least an advance online payment to reduce cancellation risk and ensure commitment.

### Booking Approval Flow

1. Player completes payment (full or advance)
2. Player sees "Waiting for Approval" status
3. Arena Owner receives booking notification
4. Arena Owner reviews and manually approves the booking
5. System updates booking status to "Confirmed"
6. Admin receives notification that booking is approved
7. Player receives confirmation notification

### Refund Policy (Configurable Per Arena)

Arena owners can configure their own refund policy:

**Default Policy:**
- Cancellation more than 6 hours before booking → Full refund
- Cancellation less than 6 hours before booking → No refund

**Custom Policy Example:**
- 24 hours before → 100% refund
- 12 hours before → 50% refund
- 6 hours before → No refund

**Special Cases:**
- Natural disasters or force majeure events → Full refund (admin-initiated)
- Arena owner can also set "No Refunds Allowed"

---

## 10. Expected Outcomes

- Elimination of manual booking processes and double bookings
- Improved booking accuracy through Redis distributed locking
- Simplified sports facility management for arena owners
- Secure digital payments with configurable advance payment options
- Transparent pricing with reviews and ratings
- Real-time availability information for players
- Efficient platform administration and monitoring
- Comprehensive reporting for all stakeholder roles

---

End of Document
