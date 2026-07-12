# Arena Hub — User Roles and Permissions

**Version:** 2.0

> **Note:** Owner Staff sub-accounts (Manager, Staff, Viewer) are intentionally deferred to Sprint 5 as a stretch goal. The MVP supports a single Arena Owner account per arena; if the owner has hired staff to help, those staff use the owner account itself. See `PROJECT_GUIDELINES.md` Deviation #10 for the authoritative project decision.

---

## 1. System Roles

| Role | Platform | Description |
|---|---|---|
| Player | React Native Mobile App | Searches, books, pays, reviews arenas |
| Arena Owner | Next.js Web Dashboard | Manages arenas, approves bookings, tracks revenue |
| Administrator | Next.js Web Dashboard | Oversees platform, verifies arenas, manages accounts |

## 2. Role Hierarchy

```
Administrator (highest access)
      │
Arena Owner (manages own arenas only)
      │
Player (manages own account and bookings only)
```

## 3. Permission Matrix

| Feature | Player | Owner | Admin |
|---|---|---|---|
| Register Account | ✓ | ✓ | ✗ |
| Login / Logout | ✓ | ✓ | ✓ |
| Update Profile | ✓ | ✓ | ✓ |
| Delete Own Account | ✓ | ✓ | ✗ |
| Search Arenas | ✓ | ✗ | ✓ |
| NLP Search | ✓ | ✗ | ✗ |
| View Arena Details | ✓ | ✓ (own) | ✓ |
| Book Slot | ✓ | ✗ | ✗ |
| Make Payment | ✓ | ✗ | ✗ |
| Cancel Booking | ✓ | ✗ | ✗ |
| View Booking History | ✓ | ✓ (own arenas) | ✓ (all) |
| Rent Equipment | ✓ | ✗ | ✗ |
| Write Review | ✓ | ✗ | ✗ |
| Like Arena | ✓ | ✗ | ✗ |
| Receive Recommendations | ✓ | ✗ | ✗ |
| Register Arena | ✗ | ✓ | ✗ |
| Manage Arena | ✗ | ✓ | ✓ |
| Manage Courts | ✗ | ✓ | ✗ |
| Set Pricing | ✗ | ✓ | ✗ |
| Configure Payment Policy | ✗ | ✓ | ✗ |
| Approve/Reject Booking | ✗ | ✓ | ✗ |
| Manage Equipment | ✗ | ✓ | ✗ |
| View Revenue | ✗ | ✓ | ✓ |
| Generate Owner Reports | ✗ | ✓ | ✗ |
| Verify Arena | ✗ | ✗ | ✓ |
| Manage User Accounts | ✗ | ✗ | ✓ |
| Suspend/Reactivate Accounts | ✗ | ✗ | ✓ |
| Monitor All Bookings | ✗ | ✗ | ✓ |
| Monitor All Payments | ✗ | ✗ | ✓ |
| Handle Complaints | ✗ | ✗ | ✓ |
| Generate Admin Reports | ✗ | ✗ | ✓ |
| Download Reports | ✓ | ✓ | ✓ |
| Receive Notifications | ✓ | ✓ | ✓ |

## 4. Access Control Rules

1. Players cannot access Owner or Admin dashboards.
2. Arena Owners cannot access Administrator functions.
3. Administrators have full system-level access.
4. Owners can only manage their own arenas, courts, and bookings.
5. Players can only access their own bookings, profiles, and reviews.
6. All API requests must validate user roles before processing.
7. Unauthorized requests return HTTP 403 (Forbidden).
8. Cross-role data access is strictly prohibited at the API level.

---

End of Document
