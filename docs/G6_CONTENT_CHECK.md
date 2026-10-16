# G6 content check: what the app says against what the app and backend do

Checked 2026-10-12. Each sentence is listed with the rule it relies on. "Fixed" means the wording was changed in this check.

## FAQ: How do I cancel a booking?
| Sentence | Rule it relies on | Result |
|---|---|---|
| "Open My bookings, tap the booking, then tap Cancel booking." | Booking detail shows "Cancel booking" when `can_cancel` is true (`booking/detail/[groupId].tsx`). | True |
| "You will see how much comes back before you confirm." | The sheet reads `GET /bookings/group/{id}/cancel-preview` (paid, percentage, refund amount) before "Yes, cancel booking". | True |
| "Refunds follow the arena policy shown on your booking." | The percentage comes from the arena's `refund_policy` tiers by hours before the start (`booking/service.py` tier lookup); the booking shows `cancellation_note`. | True |

## FAQ: When do I get my refund? (was drafted with "a few working days": fixed)
| Sentence | Rule it relies on | Result |
|---|---|---|
| "When you cancel, we show how much comes back before you confirm." | Same cancel preview. | True |
| "If it is more than nothing, the refund starts at once." | `create_refund_for_cancelled_group` makes a Refund row at the moment of cancelling when the percentage and the amount paid are above 0 (`payment/service.py`); the player gets the notice "Refund initiated". | True |
| "You pay by bank transfer, so the arena sends the money back to you itself." | Only Bank transfer works today (`payment/methods.py`: Card "not available yet", JazzCash and EasyPaisa "coming soon"). A bank-transfer refund stays pending by design; the owner sends it (`_issue_refund`, comment: never retried automatically). | True today. Must be re-read when card or wallets go live (then refunds are sent by the gateway and retried: 6 tries, then handled by the team). |
| "We tell you here when the arena marks it as sent." | `POST /owner/refunds/{id}/mark-paid` sets it processed and sends the player "Refund completed" once; the booking shows Pending then Refunded. | True |
| "How long it takes depends on the arena." | There is no deadline or setting in the code. | True (no number promised) |
| "You can follow it on the booking and in Profile, Payment history." | Booking detail shows the refund status; `/payments/my` lists refunds under each payment (G6). | True |

Removed: "a few working days" (no rule gives it) and "Card refunds are sent back by the payment service" (cards are not available).

## FAQ: How does bank transfer work?
| Sentence | Rule it relies on | Result |
|---|---|---|
| "Pick Bank transfer when you pay." | Payment screen method list. | True |
| "Send the exact amount to the arena account shown, with the reference shown" | The bank screen shows Amount, bank, title, account number and `booking_code` as Reference. | True (reference added) |
| "then upload a photo of your receipt (JPG or PNG, up to 5 MB)" | `photoProblem` (JPG, PNG or WebP, 5 MB) and the server limit `MAX_IMAGE_BYTES`. | True (WebP is also accepted; the text keeps the simple two) |
| "The arena checks it and confirms or turns down your booking." | Owner approve or reject (`/owner/payments/{id}/approve|reject`); a rejection shows the owner's reason. | True |
| "Your time is only booked once the arena confirms your receipt." | The booking is `pending_approval` until approved (`payment/service.py`); the bank screen already says it. | True |

## Match price line and detail
| Sentence | Rule it relies on | Result |
|---|---|---|
| "The booking costs ₨ T." | `booking_total` is the sum of `total_amount` of the creator's booking group; `total_amount` includes equipment and a discount (`booking/service.py`), so it is the whole booking, not only the court. Drafted as "The court price": fixed to "The booking costs". | Fixed |
| "Shared by N players, that is about ₨ X each." | X = round(T / (players needed + 1)) on the phone (`lib/match-ui.ts priceEach`); the creator counts as a player. | True (a guess, labelled "about") |
| "about ₨ X each" on the card | T / `max_players`. | True |
| "You settle it with each other. No payment happens in the app." | No match route touches payments; joining takes no money. | True |
| "The 5 players who joined will be told. Your court booking stays as it is." (cancel sheet) | `_cancel` notifies every other participant ("match_cancelled"); cancelling a match does not touch the booking. | True |
| "Your place will open for someone else." (leave sheet) | Leaving removes the participant and reopens a full match. | True |
| "Sorry, that match just filled up." | Join returns 409 "This match is full." when full. | True |

## Booking detail refund lines (read, not changed)
"The arena sends your refund to your bank. We will tell you here when it is done." and "Your refund was sent to your bank." are true while only bank transfer exists; re-read with the FAQ when other methods go live.
