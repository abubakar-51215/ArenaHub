# Arena Hub — Booking Engine Specification

**Version:** 2.0

---

## 1. Overview

The booking engine is the core transactional system of Arena Hub. It handles slot selection, distributed locking to prevent double bookings, payment processing, owner approval, and cancellation with configurable refund policies.

---

## 2. Booking Status Flow

```
PENDING_PAYMENT → (payment succeeds) → PENDING_APPROVAL
                → (payment fails) → CANCELLED

PENDING_APPROVAL → (owner approves) → CONFIRMED
                 → (owner rejects) → REJECTED (refund initiated)
                 → (player cancels) → CANCELLED (refund per policy)

CONFIRMED → (booking time passes) → COMPLETED
          → (player cancels) → CANCELLED (refund per policy)
          → (force majeure) → CANCELLED (admin full refund)
```

---

## 3. Distributed Locking (Redis)

### Purpose
Prevent two players from booking the same slot simultaneously.

### Lock Key Format
```
lock:court:{court_id}:date:{YYYY-MM-DD}:slot:{start_time}
```

### Lock Flow
1. Player confirms booking → system tries `SET lock_key txn_id NX PX 30000`
2. **NX** = only set if key does not exist (atomic check-and-set)
3. **PX 30000** = auto-expire after 30 seconds
4. If SET succeeds → lock acquired → proceed with booking
5. If SET fails → lock held by another → return "Slot being booked" error
6. After transaction completes (success or failure) → `DEL lock_key`
7. If service crashes → lock auto-expires after 30 seconds

### Logging
All lock events (acquire, release, expire, conflict) logged with timestamps for monitoring.

---

## 4. Booking Creation Flow

```python
# Pseudocode
def create_booking(player_id, court_id, date, slot_id, payment_method, payment_type):
    
    # Step 1: Validate slot is available
    slot = get_slot(slot_id)
    if slot.status != 'available':
        raise SlotNotAvailableError()
    
    # Step 2: Acquire Redis lock
    lock_key = f"lock:court:{court_id}:date:{date}:slot:{slot.start_time}"
    lock_acquired = redis.set(lock_key, txn_id, nx=True, px=30000)
    if not lock_acquired:
        raise SlotBeingBookedError()
    
    try:
        # Step 3: Double-check availability (post-lock)
        slot = get_slot(slot_id)
        if slot.status != 'available':
            raise SlotNotAvailableError()
        
        # Step 4: Calculate price
        price = calculate_price(court_id, date, slot.start_time)
        advance = calculate_advance(arena.advance_percentage, price, payment_type)
        
        # Step 5: Create pending booking (PostgreSQL transaction)
        booking = create_booking_record(
            player_id, court_id, slot_id, date,
            total_amount=price, advance_amount=advance,
            remaining_amount=price - advance,
            payment_type=payment_type,
            status='pending_payment'
        )
        
        # Step 6: Process payment
        payment = process_payment(payment_method, advance, booking.id)
        if payment.status != 'completed':
            delete_booking(booking.id)
            raise PaymentFailedError()
        
        # Step 7: Update booking and slot status
        booking.status = 'pending_approval'
        slot.status = 'booked'
        save(booking, slot)
        
        # Step 8: Notify owner
        send_notification(arena.owner_id, 'new_booking', booking)
        
        # Step 9: Return booking with "Waiting for Approval"
        return booking
        
    finally:
        # Always release lock
        redis.delete(lock_key)
```

---

## 5. Payment Types

### Full Payment
- Player pays 100% of total amount
- `advance_amount = total_amount`, `remaining_amount = 0`

### Advance Payment
- Player pays configured percentage of total
- Example: Arena requires 30%, total is PKR 5000
- `advance_amount = 1500`, `remaining_amount = 3500`
- Remaining paid at arena on arrival

### No on-spot cash-only bookings allowed

---

## 6. Owner Approval Flow

1. After payment → booking status = `pending_approval`
2. Player sees: "Waiting for Approval"
3. Owner receives notification with booking details
4. Owner reviews and taps Approve or Reject
5. **Approve:** status → `confirmed`, notifications to player + admin
6. **Reject:** status → `rejected`, refund initiated, player notified

---

## 7. Cancellation and Refund

### Cancellation Flow
1. Player requests cancellation of upcoming booking
2. System checks arena's refund policy tiers
3. Calculate refund amount based on hours before booking
4. Cancel booking → release slot → initiate refund → notify all parties

### Refund Policy (Configurable per Arena)

**Default:**
| Hours Before | Refund % |
|---|---|
| > 6 hours | 100% |
| < 6 hours | 0% |

**Custom Example:**
| Hours Before | Refund % |
|---|---|
| > 24 hours | 100% |
| 12-24 hours | 50% |
| < 12 hours | 0% |

**Force Majeure:** Admin can initiate 100% refund for natural disasters regardless of policy.

---

## 8. Equipment Addon

- During booking, player can add equipment items
- Equipment cost added to total booking amount
- Equipment availability checked and reserved
- On cancellation, equipment reservation is released

---

End of Document
