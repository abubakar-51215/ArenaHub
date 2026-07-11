# Arena Hub — Notification Module

**Version:** 2.0  
**Technology:** Firebase Cloud Messaging (FCM)

---

## 1. Overview

The notification module delivers real-time push notifications to all three user roles across mobile and web platforms. It also maintains an in-app notification history.

---

## 2. Notification Types

### Player Notifications
| Event | Title | Body |
|---|---|---|
| Payment Received | "Payment Successful" | "Your payment of PKR {amount} for {arena} has been received." |
| Booking Approved | "Booking Confirmed" | "Your booking at {arena} on {date} at {time} has been approved." |
| Booking Rejected | "Booking Rejected" | "Your booking at {arena} has been rejected. Refund initiated." |
| Booking Reminder | "Upcoming Booking" | "Reminder: You have a booking at {arena} tomorrow at {time}." |
| Booking Cancelled | "Booking Cancelled" | "Your booking at {arena} has been cancelled." |
| Refund Processed | "Refund Processed" | "Your refund of PKR {amount} has been processed." |
| New Slots Available | "New Slots" | "New time slots are available at {arena} (liked arena)." |

### Arena Owner Notifications
| Event | Title | Body |
|---|---|---|
| New Booking Payment | "New Booking" | "{player} has booked {court} on {date} at {time}. Action required." |
| Booking Cancelled | "Booking Cancelled" | "{player} has cancelled their booking at {arena}." |
| Arena Approved | "Arena Approved" | "Your arena {arena} has been approved and is now live." |
| Arena Rejected | "Arena Rejected" | "Your arena {arena} has been rejected. Reason: {reason}." |

### Admin Notifications
| Event | Title | Body |
|---|---|---|
| Booking Approved by Owner | "Booking Approved" | "{owner} approved a booking at {arena}." |
| New Arena Submitted | "Arena Verification" | "New arena {arena} submitted by {owner} for verification." |
| New Complaint | "New Complaint" | "A new complaint has been submitted by {player}." |

---

## 3. Delivery Mechanism

### Mobile (React Native)
- Firebase Cloud Messaging (FCM) push notifications
- FCM device token registered on login and stored in database
- Token refreshed on app restart

### Web Dashboard (Next.js)
- In-app notification panel (polling or WebSocket)
- Browser push notifications via FCM (optional)

---

## 4. Notification Storage

All notifications stored in the `notifications` table:
- user_id, title, body, type, is_read, data (JSON), created_at

### In-App Notification Center
- Badge count showing unread notifications
- Tap to view notification details
- Mark as read / Mark all as read
- Notification history with timestamps

---

## 5. Booking Reminder Schedule

- Reminder sent 24 hours before booking start time
- Additional reminder sent 1 hour before (optional, configurable)
- Implemented via background job scheduler (e.g., Celery or APScheduler)

---

End of Document
