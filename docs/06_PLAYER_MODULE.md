# Arena Hub — Player Module Specification

**Version:** 2.0  
**Platform:** React Native (Android + iOS + Tablet)

---

## 1. Module Overview

The Player Module is the core consumer-facing module of Arena Hub. It allows players to discover sports arenas, check real-time availability, make bookings with distributed locking, complete payments, manage bookings, rent equipment, submit reviews, and receive personalized recommendations through the mobile application.

---

## 2. Registration

### Required Fields
- Full Name (text, required)
- Email Address (email format, unique, required)
- Phone Number (numeric, unique, required)
- Password (min 8 chars, 1 uppercase, 1 number, 1 special char, required)

### Flow
1. Player enters registration details
2. System validates all fields (format, uniqueness, password strength)
3. System sends OTP to email or phone
4. Player enters OTP
5. System verifies OTP and creates account with Player role
6. Player is redirected to login

### Validation Errors
- "Email is already registered"
- "Phone number is already in use"
- "Password must contain at least 8 characters, one uppercase letter, one number, and one special character"
- "Invalid OTP. Please try again."

---

## 3. Authentication

### Login
- **Input:** Email + Password
- **Output:** JWT access token (15 min) + refresh token (7 days) + user session
- **Auto-refresh:** Access token refreshed silently using refresh token
- **Lockout:** Account locked after 5 failed attempts for 15 minutes

### Logout
- All tokens invalidated, session terminated

### Password Reset
- Player requests reset via email
- System sends verification link
- Player sets new password (must meet strength requirements)
- Old sessions invalidated

---

## 4. Profile Management

### Viewable/Editable Fields
- Profile Picture (upload/change)
- Full Name
- Phone Number
- Bio (short text)
- Preferred Sports (multi-select: Cricket, Football, Badminton, Tennis, Basketball, Volleyball, Futsal)
- Preferred Locations (city/area)

### Additional Features
- Change Password
- Delete Account (soft delete, data retention policy applies)

---

## 5. Home Screen

### Layout
- Search bar at top
- AI Recommended Arenas section (personalized)
- Nearby Arenas section (GPS-based)
- Recent Bookings section (last 3-5)
- Quick access to Liked Arenas

---

## 6. Arena Search and Discovery

### Search Methods
1. **Text Search:** Type arena name, location, or sport
2. **Filter Search:** Apply filters for sport, price, rating, distance, availability
3. **NLP Search:** Natural language queries ("best football ground near me")
4. **Map Search:** Browse arenas on Google Maps

### Search Filters
- Sport Type (Cricket, Football, Badminton, Tennis, Basketball, Volleyball, Futsal)
- Location (City, Area)
- Price Range (min-max)
- Minimum Rating (1-5 stars)
- Availability (available now, available today)
- Distance (within X km)

### Sort Options
- Distance (nearest first)
- Price (low to high / high to low)
- Rating (highest first)

### Result Card Display
- Arena name, main image, sport types, average rating, distance, starting price

### Recent Searches
- System stores last 10 searches for quick repeat

---

## 7. Arena Details Page

### Information Sections

**Basic Info:** Arena name, description, address, contact, operating hours

**Media:** Image gallery (swipeable)

**Amenities:** Parking, Washroom, Shower, Canteen, WiFi, First Aid, Drinking Water, Changing Room, Floodlights, Seating Area (displayed as icons with labels)

**Courts:** List of courts with sport type, capacity, availability status

**Pricing:** Hourly rates per court (standard and peak-hour)

**Reviews:** Average rating, individual reviews (name, rating, text, date)

**Map:** Embedded Google Map with pin + "Get Directions" button

---

## 8. Real-Time Slot Availability

### Technology: WebSockets

### Slot States
- **Available** (green) — can be booked
- **Reserved** (yellow) — being processed by another user
- **Booked** (red) — confirmed booking exists
- **Unavailable** (gray) — court under maintenance

### Real-Time Behavior
- When any player books or cancels, all connected clients see the update instantly
- No page refresh required
- Slot status color-coded for quick scanning

---

## 9. Booking Flow

### Steps
1. Select court from arena details
2. Select date from calendar
3. View available slots (real-time)
4. Select one or more consecutive time slots
5. Optionally add equipment rental
6. View booking summary (arena, court, date, time, price breakdown)
7. Select payment type (Full or Advance per arena settings)
8. Complete payment via Stripe / JazzCash / EasyPaisa
9. Booking created with "Pending Approval" status
10. Wait for arena owner approval
11. Receive confirmation notification when approved

### Booking Status Flow
```
Pending Payment → Pending Approval → Confirmed → Completed
                                   → Rejected (refund)
Confirmed → Cancelled (refund per policy)
```

---

## 10. Payment

### Supported Gateways
- **Stripe:** Credit card, debit card
- **JazzCash:** Mobile wallet (Pakistan)
- **EasyPaisa:** Mobile wallet (Pakistan)

### Payment Types
- **Full Payment:** 100% of booking amount
- **Advance Payment:** Percentage set by arena owner (20%, 30%, 50%, etc.)

### No cash/on-spot-only payments allowed

### Receipt Contents
- Booking ID, Arena Name, Court, Date, Time
- Total Amount, Advance Paid (if applicable), Remaining Balance
- Payment Method, Transaction ID, Timestamp

---

## 11. Booking Management

### My Bookings Screen
- **Upcoming Tab:** Active bookings awaiting or confirmed
- **Completed Tab:** Past bookings
- **Cancelled Tab:** Cancelled bookings with refund status

### Booking Details
- Arena name, court, date, time, amount, status, payment type, receipt

### Cancellation
- Cancel button on upcoming bookings
- System checks cancellation window (per arena refund policy)
- If eligible: cancel → release slot → initiate refund → notify
- If not eligible: display "Cancellation period has passed"
- Natural disaster refunds: admin-initiated

---

## 12. Liked Arenas

- Heart icon on arena cards and detail page to add to favorites
- Dedicated "Liked Arenas" section accessible from profile
- Remove from liked list at any time

---

## 13. Equipment Rental

### Flow
1. During booking, after selecting slot
2. View available equipment at the arena (e.g., football, cricket bat, rackets)
3. Select items and quantities
4. Equipment cost added to booking total
5. Equipment reserved along with the booking

---

## 14. Reviews and Ratings

### Submit Review
- Available only for completed bookings (`booking.status == completed`)
- Star rating: 1 to 5
- Text review: optional but encouraged
- One review per booking

### View Reviews
- Displayed on arena detail page
- Shows: reviewer name, rating, text, date

### Edit/Delete
- Player can edit their own review within 30 days of posting it
- Player can delete their own review at any time

### Owner Response
- Arena owner can post one public response per review, visible alongside it

### Report/Flag
- Any player can report a review as inappropriate; flagged reviews are
  queued for admin moderation (review moderation is Sprint 5 scope, per
  MASTER_DEVELOPMENT_PLAN.md)

### Rating Recalculation
- The arena's average rating and review count are recalculated automatically
  whenever a review is created, edited, deleted, or removed via moderation

These features ensure authentic reviews, allow arena owners to respond
publicly to feedback, and provide moderation tools to maintain content
quality.

---

## 15. AI Recommendations

### Recommendation Factors
- Current GPS location
- Preferred sports
- Previous booking history
- Budget/price preferences
- Arena ratings

### Display
- Recommended Arenas section on home screen
- "You might also like" on arena detail pages
- Nearby alternatives when preferred arena is fully booked

---

## 16. Push Notifications

### Notification Types
- Booking payment received
- Booking approved by owner
- Booking rejected by owner
- Booking reminder (before scheduled time)
- Booking cancelled
- Refund processed
- New slots available at liked arenas

### Notification Center
- In-app notification history
- Mark as read / clear all

---

## 17. Report Generation

### Available Reports
- Booking history report (all bookings with details)
- Individual payment receipt download

### Format: PDF

---

## 18. Error Handling

| Scenario | Message |
|---|---|
| Arena not found | "This arena is no longer available." |
| Slot already booked | "This slot has been reserved by another player." |
| Lock conflict | "This slot is currently being booked. Please try again." |
| Payment failed | "Payment could not be processed. Please try again." |
| Network error | "Please check your internet connection." |
| Invalid OTP | "The verification code is incorrect. Please try again." |
| Account locked | "Your account has been locked. Please try again after 15 minutes." |

---

End of Document
