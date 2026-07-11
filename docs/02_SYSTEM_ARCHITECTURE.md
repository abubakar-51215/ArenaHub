# Arena Hub — System Architecture

**Version:** 2.0

---

## 1. Architecture Overview

Arena Hub follows a modern three-tier architecture:

1. **Presentation Layer** — React Native Mobile App (Players) + Next.js Web Dashboard (Owners & Admins)
2. **Application Layer** — FastAPI Backend (Python)
3. **Data Layer** — PostgreSQL (primary database) + Redis (locking & caching)

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                         │
├──────────────────────┬──────────────────────────────────┤
│  React Native App    │   Next.js Web Dashboard          │
│  (Players)           │   (Arena Owners & Admins)        │
│  Android + iOS       │   Responsive: Desktop/Tablet/    │
│  + Tablet Support    │   Mobile Screens                 │
└──────────┬───────────┴──────────────┬───────────────────┘
           │         HTTPS/WSS        │
           ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│                   FASTAPI BACKEND                       │
├─────────────────────────────────────────────────────────┤
│  Authentication Service    │  Booking Service            │
│  User Management Service   │  Payment Service            │
│  Arena Management Service  │  Review Service             │
│  Court Management Service  │  Equipment Rental Service   │
│  AI Recommendation Service │  Notification Service       │
│  Admin Service             │  Report Generation Service  │
│  WebSocket Manager         │                             │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐  ┌───────────────────────────────┐
│     PostgreSQL       │  │          Redis                │
│  (Primary Database)  │  │  (Distributed Locking +       │
│  ACID Transactions   │  │   Caching + Session Store)    │
│  Relational Schema   │  │                               │
└──────────────────────┘  └───────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                      │
├─────────────────────────────────────────────────────────┤
│  Stripe          │  JazzCash       │  EasyPaisa         │
│  Firebase FCM    │  Google Maps API │                   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Presentation Layer

### 2.1 Mobile Application (React Native)

**Users:** Players  
**Platforms:** Android (8.0+), iOS (13.0+), Tablets/iPads  
**Key Requirement:** Fully responsive for phone and tablet screen sizes

**Responsibilities:**
- User registration with OTP verification
- Login/logout with JWT session management
- Arena search, filters, NLP search
- Google Maps integration (nearby arenas, navigation)
- Real-time slot viewing via WebSocket
- Booking flow (select → lock → pay → wait for approval)
- Payment integration (Stripe, JazzCash, EasyPaisa)
- Booking management (upcoming, history, cancellation)
- Reviews and ratings
- Equipment rental
- Liked arenas (favorites)
- Push notification handling
- Report download (booking history, payment receipts)

### 2.2 Web Dashboard (Next.js)

**Users:** Arena Owners, Administrators  
**Browsers:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+  
**Key Requirement:** Fully responsive for desktop, laptop, tablet, and mobile screens

**Arena Owner Responsibilities:**
- Arena registration with amenities, images, GPS
- Court management (CRUD + availability toggle)
- Pricing management (base + peak-hour)
- Payment settings (advance percentage, refund policy)
- Booking approval (manual approval after payment)
- Calendar view for scheduling
- Revenue and earnings dashboard
- Report generation and download
- Notification center

**Admin Responsibilities:**
- User and owner account management
- Arena verification and approval
- Booking and payment monitoring
- Complaint management
- System-wide reports and analytics
- Booking approval tracking

---

## 3. Application Layer (FastAPI Backend)

### 3.1 Authentication Service

| Feature | Description |
|---|---|
| Registration | Player/Owner registration with OTP email/SMS verification |
| Login | Email + password authentication, JWT issuance |
| Token Management | Access token (15 min), refresh token (7 days) |
| Password Reset | Email verification link, password strength validation |
| Role Assignment | Player, Arena Owner, Administrator roles |
| Account Lockout | Lock after 5 failed login attempts for 15 minutes |

### 3.2 User Management Service

| Feature | Description |
|---|---|
| Profile CRUD | View, edit, delete profile (name, photo, bio, preferences) |
| Preferred Sports | Store user sport preferences for recommendations |
| Preferred Locations | Store preferred areas for search optimization |
| Account Deletion | Soft delete with data retention policy |

### 3.3 Arena Management Service

| Feature | Description |
|---|---|
| Arena Registration | Name, address, GPS, description, sports, hours, images, amenities |
| Amenities | Parking, washroom, shower, canteen, WiFi, first aid, etc. |
| Arena Editing | Update any arena field including images and amenities |
| Arena Deletion | Soft delete, preserves booking history |
| Arena Approval | Pending → Approved or Rejected by admin |
| Arena Search | Full-text search, filters, location-based, NLP |

### 3.4 Court Management Service

| Feature | Description |
|---|---|
| Court CRUD | Add, edit, delete courts within an arena |
| Sport Assignment | Assign one or more sport types per court |
| Availability Toggle | Mark court as active or under maintenance |
| Capacity | Optional capacity field for team size reference |

### 3.5 Booking Service

| Feature | Description |
|---|---|
| Slot Selection | Select court + date + time slot with real-time availability |
| Redis Locking | Acquire distributed lock on court-date-time key |
| Booking Creation | Create pending booking record in PostgreSQL |
| Booking Approval | Owner manually approves after payment |
| Booking Cancellation | Cancel with refund per arena policy |
| Booking History | Upcoming, completed, cancelled bookings per user |
| Status Flow | Pending Payment → Pending Approval → Confirmed → Completed/Cancelled |

### 3.6 Payment Service

| Feature | Description |
|---|---|
| Payment Gateways | Stripe, JazzCash, EasyPaisa |
| Payment Types | Full payment (100%) or advance payment (configurable %) |
| Receipt Generation | Digital receipt with booking ID, amounts, payment method |
| Refund Processing | Automated refund based on arena cancellation policy |
| Transaction Records | Store all transactions with amount, method, status, timestamps |
| No Cash Payments | All payments must be online (no on-spot cash) |

### 3.7 Equipment Rental Service

| Feature | Description |
|---|---|
| Equipment Listing | View available equipment per arena |
| Equipment Booking | Add equipment to a booking (addon) |
| Pricing | Per-item rental pricing set by arena owner |
| Availability | Real-time equipment availability tracking |

### 3.8 Review Service

| Feature | Description |
|---|---|
| Submit Review | 1-5 star rating + text review after completed booking |
| View Reviews | Display on arena detail page with reviewer info |
| Edit/Delete | Users can edit or delete their own reviews |
| Average Calculation | Auto-recalculate arena average on each submission |
| Owner View | Owners can view all reviews for their arenas |

### 3.9 AI Recommendation Service

| Feature | Description |
|---|---|
| NLP Search | Extract sport type and location from natural language queries |
| Recommendations | Suggest arenas based on location, sport, history, budget |
| Nearby Alternatives | Show alternative arenas when preferred ones are full |

### 3.10 Notification Service

| Feature | Description |
|---|---|
| Technology | Firebase Cloud Messaging (FCM) |
| Player Notifications | Booking confirmed, payment received, reminder, cancellation |
| Owner Notifications | New booking, cancellation, payment received |
| Admin Notifications | Booking approved by owner, new arena submitted |
| In-App Notifications | Notification center with history |

### 3.11 Report Generation Service

| Feature | Description |
|---|---|
| Player Reports | Booking history report, payment receipt download |
| Owner Reports | Booking report, revenue report, payment report, occupancy report |
| Admin Reports | Total users, total arenas, total bookings, total revenue, arena reports |
| Format | PDF download |

### 3.12 WebSocket Manager

| Feature | Description |
|---|---|
| Slot Updates | Broadcast availability changes to all connected clients |
| Booking Status | Push booking status changes (pending, approved, cancelled) |
| Connection Management | Auto-reconnect on network interruptions |

---

## 4. Data Layer

### 4.1 PostgreSQL

**Role:** Primary relational database  
**Hosting:** Cloud-hosted (or local for development)

**Key Tables:**
- users, arena_owners, admins
- arenas, courts, amenities, arena_amenities
- time_slots, bookings, booking_equipment
- payments, refunds
- reviews, ratings
- equipment
- notifications
- complaints
- liked_arenas

**Why PostgreSQL:**
- ACID transactions for booking and payment consistency
- Foreign keys for relational integrity
- Complex JOIN queries for reporting
- Mature tooling for backups, replication, and monitoring

### 4.2 Redis

**Role:** Distributed locking, caching, rate limiting

**Key Uses:**
- Acquire lock: `SET lock:court:{id}:date:{d}:slot:{s} {txn_id} NX PX 30000`
- Release lock after transaction completes or fails
- Auto-expire locks to prevent deadlocks on crashes
- Cache frequently accessed arena listings and search results
- Rate limiting for API endpoints

---

## 5. External Services

| Service | Purpose |
|---|---|
| Stripe | Credit/debit card payments, international transactions |
| JazzCash | Mobile wallet payments (Pakistan local) |
| EasyPaisa | Mobile wallet payments (Pakistan local) |
| Firebase FCM | Push notification delivery to mobile devices |
| Google Maps API | Arena location display, nearby search, navigation |

---

## 6. Booking Workflow (Detailed)

```
Player selects arena → court → date → slot
         │
         ▼
System checks real-time availability (WebSocket)
         │
         ▼
Player taps "Confirm Booking"
         │
         ▼
System acquires Redis distributed lock on slot
         │
    ┌────┴────┐
    │ Lock    │ Lock
    │ Success │ Failed
    │         │──→ "Slot being booked by another user" → Select different slot
    ▼
System creates pending booking in PostgreSQL
         │
         ▼
Player selects payment type (Full or Advance)
         │
         ▼
Player completes payment (Stripe / JazzCash / EasyPaisa)
         │
    ┌────┴────┐
    │ Payment │ Payment
    │ Success │ Failed
    │         │──→ Delete pending booking → Release lock → Show error
    ▼
System stores payment record → releases Redis lock
         │
         ▼
Booking status = "Pending Approval"
Player sees "Waiting for Approval"
         │
         ▼
Arena Owner receives notification → reviews booking
         │
         ▼
Arena Owner taps "Approve" (or "Reject")
         │
    ┌────┴────┐
    │ Approved│ Rejected
    │         │──→ Refund initiated → Player notified
    ▼
Booking status = "Confirmed"
Admin receives approval notification
Player receives confirmation notification
WebSocket broadcasts slot as booked
```

---

## 7. Security Architecture

| Layer | Mechanism |
|---|---|
| Authentication | JWT (access + refresh tokens) |
| Password Storage | BCrypt hashing |
| Communication | HTTPS with TLS 1.2+ |
| Authorization | Role-Based Access Control (RBAC) |
| Payment Security | No card data stored on platform; handled by gateways |
| Input Validation | Server-side validation on all API endpoints |
| Account Protection | Lockout after 5 failed login attempts |
| OTP Verification | Email/SMS OTP for registration |

---

## 8. Responsiveness Requirements

| Platform | Requirement |
|---|---|
| Mobile App (Phone) | Responsive layouts for all phone screen sizes |
| Mobile App (Tablet) | Adapted layouts for iPad, Android tablets |
| Web Dashboard (Desktop) | Full-width layouts for 1920px+ screens |
| Web Dashboard (Laptop) | Optimized for 1366px-1920px |
| Web Dashboard (Tablet) | Stacked layouts for 768px-1024px |
| Web Dashboard (Mobile) | Single-column responsive for 320px-767px |

---

## 9. Deployment Architecture

```
┌─────────────────────────────────────┐
│         Docker Compose              │
├─────────────────────────────────────┤
│  fastapi-backend     (port 8000)    │
│  postgresql           (port 5432)   │
│  redis               (port 6379)    │
│  nextjs-web          (port 3000)    │
└─────────────────────────────────────┘
```

- All services containerized with Docker
- Single Docker Compose configuration for deployment
- Environment variables for secrets and configuration
- Health checks for all service containers

---

End of Document
