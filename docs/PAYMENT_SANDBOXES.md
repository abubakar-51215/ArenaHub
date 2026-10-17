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
