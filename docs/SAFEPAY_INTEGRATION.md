# SafePay card payments: status, blockers and how to close them

SafePay is the second card provider, next to Stripe. Stripe stays the default (`CARD_PROVIDER=stripe`).
Nothing in this file is a guess: an item is either **Verified** (with its source) or **UNVERIFIED**
(with the safe way to close it). Sources: SafePay's developer docs (`safepay-docs.netlify.app`) and
the API reference (`apidocs.getsafepay.com`; its pages could not be read by the tools used so far).

## What is built

| Stage | What | State |
|---|---|---|
| A | Provider foundation: `backend/app/integrations/payments/safepay.py`, settings, registry, provider recorded per payment, webhook / refund routing by the recorded provider, availability, `.env.example`, integration check | **Done and tested.** SafePay refuses safely: no payment started, no webhook confirms, no refund sent. |
| B | Start a payment (tracker + fresh checkout address) | Blocked, see list B |
| C | Webhook signature + authoritative status check | Blocked, see list C |
| D | Refunds / reversal / void | Blocked, see list D |
| E | Phone and web screens | After B |
| F | Sandbox end-to-end run | Needs a SafePay sandbox account |

`SAFEPAY_CHECKOUT_ENABLED` must stay off until B to D are signed off in the sandbox. With it off, SafePay
is shown as unavailable and a card payment cannot start through it.

## Settings

`CARD_PROVIDER` (stripe|safepay), `SAFEPAY_ENV` (sandbox|production), `SAFEPAY_API_KEY` (public),
`SAFEPAY_SECRET_KEY`, `SAFEPAY_WEBHOOK_SECRET`, `SAFEPAY_WEBHOOK_SECRET_PREVIOUS` (optional, for a
rotation), `SAFEPAY_CHECKOUT_ENABLED`. The secret key and the webhook secrets live only in
`backend/.env`; nothing here is a public Expo or Next.js variable.

## Verified (source: SafePay developer docs, 24 Oct 2026)

- Hosts: sandbox `https://sandbox.api.getsafepay.com`, production `https://api.getsafepay.com`.
- Create a payment session: `POST /order/payments/v3/` with `merchant_api_key`, `intent`, `mode`,
  `currency`, `amount` ("lowest denomination"), optional `metadata`; response `data.tracker.token`
  (`track_<uuid>`) and `data.tracker.state`.
- Checkout token: `POST /client/passport/v1/token`; the checkout URL is built from `tracker`, `tbt`,
  `environment`, `source`, `redirect_url`, `cancel_url`.
- Status: `GET /reporter/api/v1/payments/{tracker}`; `TRACKER_ENDED` means paid. There is no "failed"
  tracker state. A failed attempt can be retried on the same tracker.
- Webhook events (v2.0.0): `payment.succeeded`, `payment.failed`, `payment.refunded`,
  `authorization.succeeded`, `authorization.reversed`, `void.succeeded`; data has `tracker`, `state`,
  `amount`, `currency`, `metadata`. Header `X-SFPY-SIGNATURE`, HMAC-SHA512 hex, per-endpoint secret.
  Answer 200 within 10 seconds or the event is retried.
- Test cards: success `4456 5300 0000 1005` / `5200 0000 0000 1005`; step-up success
  `4456 5300 0000 1096` / `5200 0000 0000 1096` / `4000 0000 0000 2503`; unsuccessful step-up
  `4456 5300 0000 1104` (Visa) and `5200 0000 0000 1104` (Mastercard).

## UNVERIFIED: what blocks each stage

**B, start a payment**
1. Sign-in per call: merchant-secret header `X-SFPY-MERCHANT-SECRET` or a JWT.
2. `intent` (`CYBERSOURCE` or `MPGS`) and `mode` for a one-time PKR card payment; PKR in the sandbox.
3. The unit of `amount` when creating a tracker (paisa assumed, not confirmed).
4. The checkout address layout and the encoding of `redirect_url` / `cancel_url`; whether SafePay adds
   `tracker` to a return address that already carries `?to=...` (ours does).
5. The lifetime of the checkout token (the docs and a second report disagree: 1 hour vs 2 minutes).
   Whatever it is, a fresh URL is made each time the player opens or reopens checkout; none is stored.

**C, webhooks**
6. Whether the signature is over the raw bytes received or over a re-serialised copy. Capture one real
   sandbox delivery and compare both.
7. The unit of `amount` in an event, and the amount / currency fields of the status call, and its
   sign-in.

**D, refunds**
8. REST path, sign-in and amount unit of refund, reversal and void; which one applies to a payment
   younger than 24 hours (the docs call a refund "for payments older than 24 hours").

**How to close them safely:** with a SafePay sandbox account (test dashboard
`https://sandbox.api.getsafepay.com/dashboard/login`), use the API Explorer / Postman collection from
the API reference, one request at a time, with the test cards above; for webhooks add an endpoint under
Developers > Endpoints with a public URL (a tunnel from this PC) and read one real delivery. Record the
evidence here, then build the stage.

## Rules the code keeps

- A booking is confirmed only by a verified server-side result: never by a redirect, a query parameter
  or an app event.
- Each payment records its provider (`payment_provider`). Its webhook, status check and refund use that
  record, not the current `CARD_PROVIDER`. Tests: `backend/tests/modules/test_card_provider.py`.
- `payment.failed` is an attempt-level event (the tracker can be retried); it must not cancel the booking
  by itself.
- No secret, card detail or raw provider payload is logged.
