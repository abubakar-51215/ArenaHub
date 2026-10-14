# Before going live

A short list of values that are set for development and must be changed (or checked) for a real launch.
Nothing here has been changed; this is only the list.

1. **WEB_PUBLIC_URL** (backend). File: `backend/.env` (the example is `backend/.env.example`). It is read by the setting `web_public_url` in `backend/app/core/config.py` (alias `WEB_PUBLIC_URL`) and used in `backend/app/integrations/email/templates.py` to build the address of the logo badge in every email (`{WEB_PUBLIC_URL}/brand/email-badge@2x.png`). In development it is not set in `backend/.env`, so it uses the default `http://localhost:3000`, which a mail client cannot reach. Set it to the public address of the web app (https).
2. **NEXT_PUBLIC_SITE_URL** (web). Environment variable of the Next.js app, read in `frontend/web/app/layout.tsx` (`metadataBase`). Without it the share card and icons are addressed as `http://localhost:3000`. Set it to the public web address.
3. **NEXT_PUBLIC_API_URL** (web) and **EXPO_PUBLIC_API_URL** (mobile). Read in `frontend/web/config/index.ts` and `frontend/mobile/lib/config.ts`. The mobile one must be an https address in a release build.
4. **ENVIRONMENT** in `backend/.env` is `dev`; set it to `prod`.
5. **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** in `backend/.env` are placeholders (`sk_test_xxx`, `whsec_xxx`). Card payments answer "Card payments are not available yet" until a real key is set. JazzCash and EasyPaisa are "coming soon" until their gateway work is done.
6. **Must do: send email through a proper transactional email service on the real sending domain.** Every 6-digit code (sign-up, admin sign-in, password reset, change of email or password) is emailed, so sign-up and sign-in stop working when mail does. A personal Gmail account is fine for testing only (low daily limits, mail can land in spam). The service and the sending domain are chosen at the very end, together with the domain and the name (see "Decide at the very end"); then set the **EMAIL_*** settings in `backend/.env` (host, port, username, password, from) to that service and check them with `uv run python scripts/send_test_email.py <address>`. At start-up the server prints one line, `email_mode mode=smtp host=... port=...` or `mode=console reason=...`; production must say `mode=smtp`.
7. **Must do: set CODE_HASH_SECRET** in `backend/.env` (setting `code_hash_secret` in `backend/app/core/config.py`) to a random value of 32+ characters, kept secret like the JWT secrets. Codes are stored only as an HMAC keyed by it. Outside dev the server refuses to start without it. Changing it later makes every code that is waiting unusable (people ask for a new one); nothing else.
8. Dev-only helpers: the payment `simulate-confirm` route must stay disabled outside dev. The code line in the server log (`code_dev_delivery`, with the code) is written only when `ENVIRONMENT=dev`; outside dev neither the code nor its hash is ever logged.
9. **TRUSTED_PROXIES** in `backend/.env` (setting `trusted_proxies` in `backend/app/core/config.py`; addresses or ranges, comma-separated; empty by default). If production runs behind a proxy or load balancer, set trusted_proxies to that proxy. If it is left empty, every user appears to come from the proxy's address and shares one limit, so people will be blocked.

**Rule for the development database: backup first, then migrate, every time** (`pg_dump -Fc` into `backend/backups/`, then `alembic upgrade head`; test and scratch first). Last backup: `backend/backups/arenahub-20261014-135820-before-otp-code-hash.dump` (taken before migration `e6c3a9d2b8f1`, which drops the stored plain codes), restore-checked into a throwaway database (dropped afterwards).

## Decide at the very end (do not build yet)

Open decisions only. Nothing here is chosen, and nothing for them is built in the app today.

1. **App identifiers** (`ios.bundleIdentifier`, `android.package`, build number, version code): which domain they will be based on. They cannot be changed after the first upload to a store.
2. **Final Terms and Privacy text**, and where it lives (in the app or on a web page). The Profile row "Terms and privacy" is left out until then.
3. **Real support email and support hours.** The "Contact us" block of Help and support is left out until then.
4. **The production web address** (`WEB_PUBLIC_URL`, and the matching `NEXT_PUBLIC_SITE_URL`).

## Also check before launch (added in the admin round)

* **Emailed codes.** Every code works for 10 minutes and once; 5 wrong tries end it; a new code waits 60 seconds after the last one,
  and at most 5 go to one address an hour. In development the code is written to the server log (`code_dev_delivery`); outside
  development it never is (see items 6 to 8 above).
* **Suspended accounts** are told "Your account has been suspended." only after the right password. No support contact is shown
  there; add it with the support email once decided (see the list above).
* **Log lines.** The server now replaces characters a console cannot print (the rupee sign), so a notice never crashes a request on a
  non-UTF-8 console. Production logs are JSON on UTF-8; nothing to change.
* **Slot listing for past days:** decided, see "Decided" below (hidden from players).
* **Low-contrast tokens:** decided, see "Decided" below (text colours darkened).
* **Dark theme.** The phone app is light only (`hooks/use-color-scheme.ts`). The owner and admin web apps have light and dark.


## Decided (last build round, 2026-10-13)

1. **Colours: decided.** Only TEXT colours were darkened, so body-size text reaches 4.5 : 1. Backgrounds, borders, icons, the switch
   track and the layout are unchanged. New phone tokens in `frontend/mobile/constants/theme.ts`: `muted` (the text grey), and new
   `limeText`, `amberText`, `redText` (the old `limeDeep`, `amber` and `red` stay for fills, borders and icons). Same hue, same look.
   | Text colour | Old to new | On | Before | After |
   |---|---|---|---|---|
   | Muted grey text | #79857E to #656F69 | card #FFFFFF | 3.84 | 5.21 |
   | Muted grey text | #79857E to #656F69 | paper #F1F2EF | 3.42 | 4.64 |
   | Muted grey text | #79857E to #656F69 | soft line #EDEFEB | 3.32 | 4.50 |
   | Muted grey text | #79857E to #656F69 | lime wash #F2FBDA | 3.58 | 4.86 |
   | Lime text (links, tags, pill) | #7FA30F to #5B750B | card | 2.94 | 5.26 |
   | Lime text (links, tags, pill) | #7FA30F to #5B750B | paper | 2.61 | 4.68 |
   | Lime text (links, tags, pill) | #7FA30F to #5B750B | soft line | 2.54 | 4.54 |
   | Lime text (links, tags, pill) | #7FA30F to #5B750B | lime wash | 2.74 | 4.90 |
   | Amber text (pill, number) | #D9930B to #956508 | amber wash #FDF3DC | 2.34 | 4.59 |
   | Amber text (pill, number) | #D9930B to #956508 | card | 2.58 | 5.07 |
   | Red text (pill, errors) | #CF4141 to #C83333 | red wash #FBE9E9 | 4.00 | 4.51 |
   | Red text (pill, errors) | #CF4141 to #C83333 | card | 4.68 | 5.28 |
   | Red text (pill, errors) | #CF4141 to #C83333 | paper | 4.17 | 4.70 |

   * The phone has no text below 4.5 : 1 except disabled buttons (inactive controls are exempt): the grey "off" button text on
     `#808683` (3.3) and "This match was cancelled" on the soft line (4.1), and large text.
   * Owner web and admin web (light and dark, measured on six pages): already at 4.5 or more everywhere (the web tokens were
     darkened in an earlier gate). One pair was low and is fixed: the count on the Refunds tab (amber on amber wash, 2.3 to 4.6).
2. **Past slots: decided.** `GET /courts/{id}/slots` no longer lists slots that have started (all of yesterday and earlier, and
   today's past hours, Karachi time = the server clock). The owner's own list (`GET /owner/courts/{id}/slots`, used by the owner web)
   still shows every slot; nothing else calls the public route. Booking or pricing a started slot answers 409 "One of the selected
   slots is no longer available." (this check did not exist before; it only worked because past slots were usually not "available").
3. **Owner notices "Your arena is approved" and "Your arena was not approved": decided, they stay.**

## Decided (integration-test follow-up, 2026-10-14)

4. **Discount use: decided.** Applying a code at Pay reserves one use for that booking (`bookings.discount_code_id`, migration
   `d5a9c2e7f1b3`; older bookings stay NULL). The reservation counts toward the code's limit while the booking waits for payment or
   for the owner's check, so a limited code is never used more times than its limit (two players at once: one gets it, the other is
   told "This code has been used up."). When the booking is confirmed the use is permanent. It is given back, once and never below
   zero (`bookings.discount_released_at`), when the booking is abandoned, expires unpaid, the receipt is rejected, the player cancels
   before payment is confirmed, or the arena is suspended before payment. **After a confirmed booking is cancelled, the use stays
   counted (the code was used).** Backup taken before the dev migration:
   `backend/backups/arenahub-20261013-235404-before-discount-reservation.dump` (restore-checked, then the check database dropped).
5. **Rate limiter: decided.** The limit is counted on the real connection address. `X-Forwarded-For` is read only when the
   connection comes from an address in `TRUSTED_PROXIES` (addresses or ranges, empty by default), walking from the right and skipping
   the trusted hops; a malformed header falls back to the proxy's address. The limit numbers are unchanged. See item 8 in the list at
   the top.
6. **Suspension refunds: decided.** Suspending or removing an arena refunds once per booking group, not once per hour: one refund
   row, one "Refund initiated" and one "Booking cancelled" for the player, one "A refund is waiting for you" for the owner, one line in
   the owner Refunds tab and in the admin Refunds list. Only paid or part-paid groups get a refund, of what was paid for the cancelled
   hours and never more (a group that already has a pending or processed refund only gets what is left). A receipt still waiting for
   the owner becomes one pending refund of the full amount. Unpaid bookings are cancelled with no refund row. A single slot still
   refunds its own share; the player's own group-cancel policy is unchanged.
7. **Text size: decided.** Phone: any text that carries information (tags, chips, prices, labels, status words, badges, row details)
   is at least 14px; purely decorative micro labels (uppercase eyebrow lines, tab-bar labels, weekday letters, the password-rule
   bullet, avatar initials) may be smaller but never below 12px. Owner and admin web: no text below 12px; dashboard density is
   unchanged. See `docs/MOBILE_QA_GATE.md`.
8. **Currency symbol: decided.** The owner and admin web write "Rs." and the phone and every notice write "₨", as in the prototypes.
