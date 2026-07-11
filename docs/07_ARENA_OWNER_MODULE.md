# Arena Hub — Arena Owner Module Specification

**Version:** 2.0  
**Platform:** Next.js Web Dashboard (Responsive: Desktop/Laptop/Tablet/Mobile)

---

## 1. Module Overview

The Arena Owner Module allows facility owners to register and manage sports arenas, configure courts and pricing, approve bookings, track revenue, manage equipment rentals, and download reports through the responsive web dashboard.

---

## 2. Registration and Authentication

### Registration Fields
- Full Name, Email, Phone, Password
- Business Name, Business Contact Number
- OTP verification (email/SMS)
- Password: min 8 chars, 1 uppercase, 1 number, 1 special char

### Authentication
- JWT access token (15 min) + refresh token (7 days)
- Password reset via email verification link
- Account lockout after 5 failed attempts

---

## 3. Dashboard (Home Screen)

### Summary Cards
- Total Arenas (owned)
- Total Bookings (today / this month)
- Monthly Revenue
- Pending Approvals (bookings awaiting owner action)

### Quick Actions
- View pending bookings
- Add new arena
- View latest notifications

---

## 4. Arena Management

### Register New Arena
**Required Fields:**
- Arena Name, Description, Address (text + GPS coordinates)
- Sports Offered (multi-select), Operating Hours
- Images (multiple upload), Contact Information

**Amenities Checklist:**
- Parking, Washroom, Shower, Canteen/Cafeteria, WiFi
- First Aid Kit, Drinking Water, Changing Room
- Floodlights, Seating Area, CCTV, Locker Room

**Status:** New arenas start as "Pending Approval" until admin verifies

### Edit Arena
- Update any field (name, description, images, amenities, hours)
- Changes reflected immediately (no re-approval needed for edits)

### Delete Arena
- Soft delete — preserves historical booking data
- Active bookings must be completed or cancelled before deletion

---

## 5. Court Management

### Add Court
- Court Name, Sport Type(s), Capacity (optional)

### Edit Court
- Update name, sport types, capacity

### Toggle Availability
- Active: available for booking
- Under Maintenance: hidden from player slot view

### Delete Court
- Only if no active bookings exist

---

## 6. Pricing Management

### Base Pricing
- Set base hourly rate per court

### Peak-Hour Pricing
- Define time ranges (e.g., 6PM-10PM)
- Set increased rate for peak periods

### Display
- Players see correct pricing during slot selection (standard vs peak clearly labeled)

---

## 7. Payment Configuration

### Advance Payment Settings
- Set advance percentage: 20%, 30%, 50%, or custom
- OR require full payment (100%)
- No on-spot cash-only bookings

### Cancellation / Refund Policy
- Default: >6 hours before = full refund, <6 hours = no refund
- Custom tiers: 24hr=100%, 12hr=50%, 6hr=0%
- Option: "No Refunds Allowed"
- Natural disaster / force majeure: admin-initiated full refund

---

## 8. Booking Approval

### Flow
1. Player completes payment (full or advance)
2. Owner receives push notification + in-dashboard alert
3. Owner reviews booking details (player, court, date, time, amount)
4. Owner taps "Approve" or "Reject"
5. **Approve:** Status → Confirmed, player + admin notified
6. **Reject:** Status → Rejected, refund initiated, player notified

### Booking List
- Pending Approval tab
- Confirmed tab
- Completed tab
- Cancelled tab

---

## 9. Calendar View

- Monthly/weekly/daily calendar showing all bookings
- Color-coded by status (pending, confirmed, completed, cancelled)
- Click on a date/slot to see booking details

---

## 10. Equipment Management

### Add Equipment
- Equipment name, description, rental price per use, quantity available

### Edit/Delete Equipment
- Update details or remove items

### Availability Tracking
- System tracks quantities booked vs available

---

## 11. Revenue and Earnings

### Dashboard Metrics
- Today's Revenue, This Week, This Month, Total
- Pending Settlements (advance payments not yet collected on-site)

### Payment Records
- Transaction list with: player name, amount, payment method, date, status

### Earnings Breakdown
- Revenue per arena, per court, per time period

---

## 12. Reports (Downloadable)

| Report | Contents |
|---|---|
| Booking Report | All bookings with dates, players, amounts, statuses |
| Revenue Report | Revenue breakdown by period, arena, court |
| Payment Report | All transactions with gateway details |
| Occupancy Report | Peak hours, busiest courts, utilization rates |

**Format:** PDF download

---

## 13. Notifications

### Types
- New booking payment received (action required: approve/reject)
- Booking cancelled by player
- Arena approved/rejected by admin

### Notification Center
- In-dashboard notification panel
- Badge count for unread notifications

---

End of Document
