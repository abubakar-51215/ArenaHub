# Test the Stripe card payment on a real phone (test mode, no real money)

Everything below uses Stripe TEST mode and Stripe's test cards. Never type a real card. General phone set-up
(Expo Go or a development build, same Wi-Fi) is in `docs/RUN_ON_PHONE.md`; this sheet is only the payment part.
Evidence so far: the whole flow passes in the browser build (`docs/PAYMENT_SANDBOXES.md`, "Verified end to end").
The phone itself has **not** been tested yet: that is what this sheet is for.

## 1. Find this computer's address

In PowerShell run `ipconfig` and take the IPv4 address of the Wi-Fi adapter (the block "Wireless LAN adapter Wi-Fi"; it differs on
every network and can change, so read it fresh each time). Below it is written `<IP>`. The phone and the computer must be on the same Wi-Fi (no guest
network, no "AP isolation").

## 2. Settings you change (you do this; the files hold secrets or are yours)

`backend/.env` (keep the Stripe TEST keys that are already there):

```
API_PUBLIC_URL=http://<IP>:8000
STRIPE_WEBHOOK_SECRET=<the whsec_... that step 4 prints>
```

`frontend/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://<IP>:8000
```

No slash at the end, no `/api/v1`. Do not put a secret key in any `EXPO_PUBLIC_` variable.

## 3. Let the phone reach the backend

1. Start the backend on all addresses (`localhost` on a phone means the phone itself):
   `npm run dev:backend:lan` from the repository root.
2. Allow port 8000 through the Windows firewall, once, in an **administrator** PowerShell:
   `New-NetFirewallRule -DisplayName "ArenaHub dev 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private`
   (the Wi-Fi is "Private" on this computer; remove the rule when you are done:
   `Remove-NetFirewallRule -DisplayName "ArenaHub dev 8000"`).
3. On the phone's browser open `http://<IP>:8000/api/v1/health`. It must show `"success":true`. If not, fix this
   (Wi-Fi, firewall, wrong IP) before anything else.

## 4. Send Stripe's webhooks to the backend

Keep this window open for the whole test:

```
backend\stripe.exe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:8000/api/v1/webhooks/stripe
```

It prints `Ready! ... whsec_...`: put that secret in `backend/.env` as `STRIPE_WEBHOOK_SECRET` and restart the
backend. (The CLI must be logged in to your Stripe TEST account: `backend\stripe.exe login`.)

## 5. Start the app

`cd frontend/mobile` then `npx expo start --clear` (the address in `.env` is read at start). Open it on the phone.
In Expo Go the card page comes back to `exp://<IP>:8081/--/booking/return`, which the backend allows in development.

## 6. What to try, and what must happen

| # | On the phone | Expected |
|---|---|---|
| 1 | Sign in as a test player, pick an arena, a court and a slot, Pay, choose **Card** | Stripe's card page opens in the in-app browser, amount in PKR |
| 2 | Pay with `4242 4242 4242 4242`, any future date, any CVC | The window closes by itself, the app shows "waiting", then **Booking confirmed** within a few seconds |
| 3 | In the app: Bookings, the booking, the pass | Status confirmed; the arena owner sees it on the web dashboard |
| 4 | New booking, card `4000 0000 0000 0002` | Stripe says the card was declined; the booking stays unpaid; you can try again |
| 5 | New booking, open Card, then close the window without paying | Waiting screen with the "reopen" button; the slot is held; leaving checkout frees it |
| 6 | **3-D Secure:** new booking, card `4000 0025 0000 3155` | A Stripe test authentication step appears; completing it confirms the booking |
| 7 | 3-D Secure failing: card `4000 0084 0000 1629` (as listed on Stripe's test-card page; check it there if it behaves differently) | Authentication, then a decline; the booking stays unpaid |
| 8 | Cancel the confirmed booking (more than the policy's hours ahead) | A refund is made; in Stripe's test dashboard the refund shows as succeeded |
| 9 | Kill the app while Stripe's page is open, reopen it | The booking is either confirmed (if paid) or still waiting; never lost |

## 7. If something fails

Send me (secrets hidden): the step number, a screenshot, and the last 30 lines of the backend window and the
Stripe CLI window. Typical causes: the phone cannot reach `<IP>:8000` (step 3.3), `API_PUBLIC_URL` still
`localhost`, a stale webhook secret after restarting `stripe listen`, or Expo started before the `.env` change.

## 8. After the test

Remove the firewall rule, close the Stripe CLI, and put `EXPO_PUBLIC_API_URL` and `API_PUBLIC_URL` back if you
want. Not covered even by this sheet: push notifications, email delivery, real money (a live PKR Stripe account).
