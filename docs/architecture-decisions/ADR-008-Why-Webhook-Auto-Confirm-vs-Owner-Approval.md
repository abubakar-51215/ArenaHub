# ADR-008: Why webhook auto-confirm instead of blanket owner approval

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
Docs 01/02/07/11 describe a single booking flow where **every** booking waits
in "Pending Approval" until the arena owner manually approves it after payment.
But ArenaHub supports four payment methods (CLAUDE.md deviation #2): card
(Stripe test mode), JazzCash, EasyPaisa, and manual bank transfer. For the
three gateway-backed methods, payment success is provable automatically via a
webhook — a manual approval step there adds friction with no verification
value, unlike consumer apps (Bookme, airlines) that confirm instantly on
payment. Manual bank transfer has **no** webhook: the owner must eyeball the
uploaded receipt.

## Decision
Split the approval flow by payment method (CLAUDE.md deviation #2b), governed by
one principle: **if a payment method has a webhook, it auto-confirms; if it
doesn't, a human verifies.**
- **card / JazzCash / EasyPaisa:** `pending_payment` → gateway webhook →
  `confirmed` → QR generated → notify player + owner + admin. No owner step.
- **bank_transfer:** `pending_payment` → player uploads receipt →
  `pending_approval` → owner reviews receipt image → `confirmed` or refunded.

The `pending_approval` status still exists on the Booking model but is only
entered by the bank-transfer path. Auto-cancel-after-24hr and refund policies
apply identically to both paths.

## Consequences
- **Positive:** Frictionless, industry-standard checkout for the common
  (gateway) case; manual verification reserved for the one method that
  genuinely needs it; the rule generalizes cleanly to any future payment
  method. Reduces owner workload and speeds confirmations.
- **Negative / trade-offs:** Two code paths through the booking state machine
  instead of one; correct webhook handling (idempotency, signature
  verification, replay) is now security-critical for confirmation; the split
  contradicts the literal wording of docs 07/11 (CLAUDE.md wins and records
  why).
- **Mitigation:** Both paths converge on the same `confirmed` state and share
  refund/cancel logic; webhook handlers verify signatures and are idempotent;
  the deviation is documented in CLAUDE.md #2/#2b and the "payment verification
  principle" so the divergence from the docs is intentional and traceable.
