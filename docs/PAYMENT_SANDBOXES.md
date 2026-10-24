# Payment sandboxes (Stripe, JazzCash, EasyPaisa)

Written in simple English. It says how to run each payment method against its
test/sandbox, which setting holds which value, and — for JazzCash and EasyPaisa —
the exact questions and papers to get from each company. We do **not** invent any
API here: the wallet providers stay simulators until the real sandbox details and
credentials arrive.

All three go through the same webhook route: `POST /api/v1/webhooks/<method>`
(`stripe`, `jazzcash`, `easypaisa`), and the same `PaymentProvider` interface
(`backend/app/integrations/payments/`). Swapping a simulator for the real API is a
one-file change; nothing outside that folder depends on it being simulated.

## Card — Stripe test mode

Stripe has a full test mode, so this one works end to end today with test keys.

### 1. Settings (backend `.env`)
| Setting | Value |
|---|---|
| `STRIPE_SECRET_KEY` | your `sk_test_...` key from the Stripe dashboard (Test mode) |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_...` printed by `stripe listen` (below) |
| `API_PUBLIC_URL` | `http://localhost:8000` in dev (Stripe sends the player back through `/api/v1/payments/return`) |

The server only treats a key as real when it looks like a Stripe key and is not a
placeholder (`app/core/config.py`, `stripe_configured`): with no key, card payments
answer "Card payments are not available yet."

### 2. Forward test webhooks with the Stripe CLI
Stripe must reach your machine. Use the Stripe CLI:
```
stripe login
stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe
```
Newer Stripe CLI builds refuse to start with "must specify events to forward using
--events, --all-snapshot, or --all-thin" unless told which events to send — add
`--events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired`
if you hit that.

`stripe listen` prints a `whsec_...` signing secret — put it in `STRIPE_WEBHOOK_SECRET`
and restart the backend. Leave `stripe listen` running while you test.

### 3. Try a payment
- Start a card checkout in the app; Stripe shows its hosted card page.
- Pay with a **test card**: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- Watch the events arrive: the booking confirms on `checkout.session.completed`.
- Other useful triggers:
  ```
  stripe trigger checkout.session.completed
  stripe trigger checkout.session.async_payment_failed
  ```
- The server verifies every event with `STRIPE_WEBHOOK_SECRET`
  (`stripe.Webhook.construct_event`), so an unsigned call is rejected.

### Verified end to end (24 October 2026, Stripe TEST mode, scratch database)
`scripts/qa_stripe_e2e.mjs` drives Stripe's real hosted card page with Playwright, with the Stripe CLI
forwarding Stripe's real signed events to the backend. All five checks passed:

| Check | Result |
|---|---|
| Pay `4242 4242 4242 4242` on Stripe's page (amount PKR 2,000.00) | Booking confirmed by Stripe's webhook; one payment, lifecycle `confirmed` |
| Declined card `4000 0000 0000 0002` | Stripe shows the decline; booking stays `pending_payment`, nothing confirmed |
| Player leaves checkout (`/bookings/group/{id}/release`) | Booking cancelled, slot freed |
| Session expired by Stripe | Webhook `checkout.session.expired` cancels the booking |
| Cancel the paid booking (24 h or more ahead) | Refund created and **processed** by Stripe's test API (100%) |

**Through the phone app itself (Expo web build), `scripts/qa_stripe_app_e2e.mjs`:** the app's Pay button opens
Stripe's real page in a pop-up and the app's own payment screen is used. Three checks passed on a warm dev
server: (A1) a good card: Stripe sends the player back to the app's return address, and once that window is
closed the app moves by itself to "Booking confirmed" (the booking was confirmed by Stripe's webhook, the
app learns it by polling); (A2) a declined card: Stripe shows the decline, the booking stays unpaid and the
app sits on its waiting screen; (A3) cancelling the paid booking: refund processed (Rs 2,000.00).

Known limit of the **web build only**: after paying, the Stripe pop-up lands on the app's return page but does
not close by itself (the check that normally closes it fails there), so on the web the player closes that
window and the app carries on. A first visit to a page after the dev server starts can also be slow enough
to time out a check; run it again. How the real phone behaves (the system browser window closing when the
app address is reached) is **not tested**: it needs a real device.

PKR is accepted by this Stripe test account. Not covered: Android/iOS app on a real phone, and
Stripe's 3-D Secure challenge cards. To repeat: start the Stripe CLI with `--events ...` (above),
start the scratch backend with the CLI's webhook secret, then
`QA_TAG=<fresh prefix> node scripts/qa_stripe_e2e.mjs` (variables are listed at its top).

### 4. Before real money
A live account needs `sk_live_` keys, a webhook endpoint registered in the Stripe
dashboard at `{API_PUBLIC_URL}/api/v1/webhooks/stripe` sending
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, and the account
must be allowed to accept **PKR**. See `docs/BEFORE_GOING_LIVE.md`.

## Wallets — JazzCash and EasyPaisa

Today both are deterministic **simulators** behind the `PaymentProvider` interface
(`jazzcash.py`, `easypaisa.py`): in development they log a request and the payment is
confirmed through the dev-only simulate route; outside development they refuse with
"coming soon" until the real API is connected. What is **already real** and does not
change when the sandbox arrives:

- **The callback signature check.** A webhook must carry an HMAC-SHA256 signature in
  the `X-Signature` header (hex, over the raw body), keyed by `JAZZCASH_WEBHOOK_SECRET`
  / `EASYPAISA_WEBHOOK_SECRET`; an unsigned or forged callback is rejected exactly as
  in production.
- **The settings seams** already exist in `.env`: `JAZZCASH_MERCHANT_ID`,
  `JAZZCASH_PASSWORD`, `JAZZCASH_WEBHOOK_SECRET`, `EASYPAISA_MERCHANT_ID`,
  `EASYPAISA_WEBHOOK_SECRET`.
- **The plug-in point** is each provider's `initiate()` (and the webhook field
  mapping in `verify_webhook()`); only the inside of those two methods changes.

### What we cannot do until the companies give us the details
Their real APIs are not public, so the `initiate()` call, the exact signing formula
(JazzCash uses a `pp_SecureHash`; the current code uses a stand-in HMAC), and the
callback field names are **unknown** and must not be guessed.

### Exact questions and papers to get from each company

Ask JazzCash (and the same list for EasyPaisa) for:

1. **Sandbox/UAT access**: test merchant credentials — merchant id, the integration
   password/secret, and any salt/key used for signing. (Which maps to
   `*_MERCHANT_ID`, `*_PASSWORD`, and the webhook secret.)
2. **The integration document** for the **"mobile account" / wallet payment request**
   API: the exact endpoint URL, the request fields, and how a payment is started from a
   wallet number (this is what `initiate()` will call).
3. **The signing formula**: which fields are concatenated, in what order, with which
   secret/salt, and which hash (e.g. JazzCash `pp_SecureHash` — HMAC-SHA256? over which
   string?). We need the exact recipe to both sign requests and verify callbacks.
4. **The callback (webhook) spec**: the URL they will POST to, the exact field names and
   status values, which header carries the signature, and what the signature is computed
   over — so `verify_webhook()` reads the right fields.
5. **Test wallet numbers / test OTPs** for the sandbox, and how to simulate success,
   failure, and timeout.
6. **The return/redirect flow** (if any) back to the app after the user approves in their
   wallet app, and the allowed return URLs.
7. **Refund API** (endpoint, fields, signing) if refunds are supported in sandbox.
8. **Go-live paperwork**: merchant onboarding form, business documents required, PKR
   settlement details, and the IP allow-list or certificate they need from us.

Until items 2–4 arrive, the simulators stay in place and the code outside
`integrations/payments/` is already correct, so connecting the real sandbox is a
contained change.
