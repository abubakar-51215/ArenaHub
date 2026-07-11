# Arena Hub — Admin Module Specification

**Version:** 2.0  
**Platform:** Next.js Web Dashboard (Responsive)

---

## 1. Module Overview

The Admin Module provides platform administrators with tools to verify arenas, manage user accounts, monitor bookings and payments, handle complaints, and generate system-wide reports.

---

## 2. Authentication
- Admin login with email and password
- JWT tokens with Admin role
- No self-registration (admin accounts created manually or by superadmin)

---

## 3. Admin Dashboard

### Key Metrics
- Total Registered Players
- Total Arena Owners
- Total Arenas (approved, pending, rejected)
- Total Bookings (today, this month, all time)
- Total Revenue (platform-wide)
- Active Complaints

### Recent Activity
- Latest bookings approved
- Latest arenas submitted for verification
- Latest complaints received

---

## 4. User Management

### View All Users
- List of all players and arena owners
- Search by name, email, role
- Filter by status (active, suspended, pending)

### Account Actions
- View detailed profile and booking history
- Suspend account (with reason)
- Reactivate suspended account
- System notifies account holder of status change

---

## 5. Arena Verification

### Pending Queue
- List of arenas with "Pending Approval" status
- Display: arena name, owner name, location, submission date

### Review Process
1. Admin clicks on pending arena
2. Reviews: name, address, images, amenities, sports, hours
3. Approves (arena goes live for players) or Rejects (with written reason)
4. Owner receives notification of decision

---

## 6. Booking Monitoring

### All Bookings View
- Platform-wide booking list with filters (date, arena, status, player)
- Booking details: arena, court, player, date, time, amount, status
- Receive notifications when owners approve bookings

### Investigation
- Flag suspicious bookings
- View payment details for any booking

---

## 7. Payment Monitoring

### All Transactions
- List of all payments across the platform
- Filter by date, method, status, arena
- Transaction details: amount, method, gateway ID, player, arena, timestamp

---

## 8. Complaint Management

### Flow
1. Player submits complaint from mobile app (category + description)
2. Admin views complaint in dashboard
3. Admin investigates and writes response
4. Admin updates status: Open → Under Review → Resolved
5. Player receives resolution notification

### Complaint Categories
- Booking issue, Payment issue, Arena quality, Owner behavior, Technical problem, Other

---

## 9. Reports and Analytics (Downloadable)

| Report | Contents |
|---|---|
| User Report | Total players, owners, registrations per period |
| Arena Report | Total arenas, approvals, rejections, locations |
| Booking Report | Total bookings, cancellations, completion rates |
| Revenue Report | Total platform revenue, per-arena breakdown |
| System Report | Active users, peak hours, popular sports |

**Format:** PDF download

---

## 10. Notifications

### Types
- New arena submitted for verification
- Booking approved by arena owner
- New complaint received

### Notification Center
- In-dashboard panel with history

---

End of Document
