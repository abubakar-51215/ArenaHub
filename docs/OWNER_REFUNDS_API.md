# Owner refunds (backend only; no owner web screen yet)

A bank-transfer refund is pending by design: the arena owner sends the money back by bank
transfer and then marks it as paid. Gateway refunds (card, JazzCash, EasyPaisa) are processed or
retried by the server and are never marked by hand.

## Routes (owner token required; a player gets 403)

| Route | What it does |
|---|---|
| `GET /api/v1/owner/refunds?status=pending\|processed\|all&page=&page_size=` | The owner's own arenas only. Default `pending`. Each item: `id`, `status`, `amount`, `reason`, `payment_method`, `player_name`, `booking_code`, `arena_name`, `booking_date`, `start_time`, `end_time`, `created_at`, `processed_at`, `can_mark_paid`. |
| `POST /api/v1/owner/refunds/{id}/mark-paid` | Only a pending bank-transfer refund on the owner's own arena. Sets it to processed with the time and who did it (`refunds.processed_by`), adds a note to the payment history, keeps the "fully refunded" state, and sends the player the existing "Refund completed" notice once. A second call changes nothing and answers `already_processed: true` ("Already marked as paid."). Another owner's refund answers 404; a gateway refund answers 422. |

## Owner notice
When a bank-transfer refund is created (a player cancels a paid booking, or cancels while the
receipt is waiting) the arena owner gets the notice `refund_to_send`: "A refund is waiting for you".

## Limits kept
* Total refunds on a payment never go above what was paid (checked when a refund is created and
  again when it is marked as paid; a refund above the payment answers 409).
* A receipt-waiting cancellation leaves the payment as `expired` (a terminal state); the refund row
  holds the money. A confirmed payment that is fully refunded shows `refunded`.

## Database
Migration `a7c3e9d1b5f2` adds `refunds.processed_by` (nullable, user id). Run `alembic upgrade head`.

Tests: `backend/tests/modules/test_owner_refunds.py`.
