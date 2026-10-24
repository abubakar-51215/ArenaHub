# Before going live

A short list of values that are set for development and must be changed (or checked) for a real launch.
Nothing here has been changed; this is only the list.

1. **WEB_PUBLIC_URL** (backend). File: `backend/.env` (the example is `backend/.env.example`). It is read by the setting `web_public_url` in `backend/app/core/config.py` (alias `WEB_PUBLIC_URL`) and used in `backend/app/integrations/email/templates.py` to build the address of the logo badge in every email (`{WEB_PUBLIC_URL}/brand/email-badge@2x.png`). In development it is not set in `backend/.env`, so it uses the default `http://localhost:3000`, which a mail client cannot reach. Set it to the public address of the web app (https).
2. **NEXT_PUBLIC_SITE_URL** (web). Environment variable of the Next.js app, read in `frontend/web/app/layout.tsx` (`metadataBase`). Without it the share card and icons are addressed as `http://localhost:3000`. Set it to the public web address.
3. **NEXT_PUBLIC_API_URL** (web) and **EXPO_PUBLIC_API_URL** (mobile). Read in `frontend/web/config/index.ts` and `frontend/mobile/lib/config.ts`. The mobile one must be an https address in a release build.
4. **ENVIRONMENT** in `backend/.env` is `dev`; set it to `prod`.
5. **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** in `backend/.env` must be real keys (a placeholder such as `sk_test_xxx` counts as no key). Card payments answer "Card payments are not available yet" until a real key is set. JazzCash and EasyPaisa are "coming soon" until their gateway work is done. **Check what is set without showing any value:** `cd backend` then `uv run python -m scripts.check_integrations` prints `SET` or `MISSING` for Google, Cloudinary, Sentry, Stripe, SMTP, the support email, JazzCash and EasyPaisa. Before launch every line you need must say `SET`.
6. **Must do: send email through a proper transactional email service on the real sending domain.** Every 6-digit code (sign-up, admin sign-in, password reset, change of email or password) is emailed, so sign-up and sign-in stop working when mail does. A personal Gmail account is fine for testing only (low daily limits, mail can land in spam). The service and the sending domain are chosen at the very end, together with the domain and the name (see "Decide at the very end"); then set the **EMAIL_*** settings in `backend/.env` (host, port, username, password, from) to that service and check them with `uv run python scripts/send_test_email.py <address>`. At start-up the server prints one line, `email_mode mode=smtp host=... port=...` or `mode=console reason=...`; production must say `mode=smtp`.
7. **Must do: set CODE_HASH_SECRET** in `backend/.env` (setting `code_hash_secret` in `backend/app/core/config.py`) to a random value of 32+ characters, kept secret like the JWT secrets. Codes are stored only as an HMAC keyed by it. Outside dev the server refuses to start without it. Changing it later makes every code that is waiting unusable (people ask for a new one); nothing else.
8. Dev-only helpers: the payment `simulate-confirm` route must stay disabled outside dev. The code line in the server log (`code_dev_delivery`, with the code) is written only when `ENVIRONMENT=dev`; outside dev neither the code nor its hash is ever logged.
9. **TRUSTED_PROXIES** in `backend/.env` (setting `trusted_proxies` in `backend/app/core/config.py`; addresses or ranges, comma-separated; empty by default). If production runs behind a proxy or load balancer, set trusted_proxies to that proxy. If it is left empty, every user appears to come from the proxy's address and shares one limit, so people will be blocked.
10. **structlog's `cache_logger_on_first_use`** (`backend/app/core/logging.py`) was set to `False` so log-capture tests work correctly; this costs a little speed on every log call (a fresh processor-chain lookup instead of a cached one). Re-check this under real production load before launch.

**Rule for the development database: backup first, then migrate, every time** (`pg_dump -Fc` into `backend/backups/`, then `alembic upgrade head`; test and scratch first). Last backup: `backend/backups/arenahub-20261014-183210-before-google-sign-in.dump` (taken before migration `a7d4c1f9e2b6`: `users.google_sub`, and `users.phone` may be empty until "One more step"), restore-checked into a throwaway database (dropped afterwards).

## Decide at the very end (do not build yet)

Open decisions only. Nothing here is chosen, and nothing for them is built in the app today.

1. **App identifiers** (`ios.bundleIdentifier`, `android.package`, build number, version code): which domain they will be based on. They cannot be changed after the first upload to a store.
2. **Final Terms and Privacy text**, and where it lives (in the app or on a web page). The Profile row "Terms and privacy" is left out until then.
3. **Real support email and support hours.** The "Contact us" block of Help and support is left out until then.
   **Support email:** temporary arenahub.support@gmail.com. If the domain arenahub.com.pk is bought, change `SUPPORT_EMAIL` to support@arenahub.com.pk after the email service is set up on that domain. (`SUPPORT_EMAIL` is used only in the owner login-alert email.)
4. **The production web address** (`WEB_PUBLIC_URL`, and the matching `NEXT_PUBLIC_SITE_URL`).
5. **Continue with Google: the Google Cloud set-up (TODO, after items 1, 2 and 3).** The code is built and tested with
   test tokens; it stays off until these exist. No real value is written anywhere in the code or docs. Steps:
   1. Create (or choose) the Google Cloud project for ArenaHub.
   2. **OAuth consent screen:** app name, the privacy policy link (item 2) and a support email (item 3); add the
      scopes `openid`, `email`, `profile`. Publish it (out of testing) before launch.
   3. **Web client id** (type "Web application"): this is the audience the server checks. Put it in
      `GOOGLE_CLIENT_IDS` (backend) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (phone build).
   4. **Android client id** (type "Android"): needs the package name (item 1) and the SHA-1 of the signing key (the EAS
      build credentials, and the Play App Signing key once on Google Play). Google uses it to recognise the app; the
      sign-in token itself is issued for the Web client id, so the server only needs the Web id in `GOOGLE_CLIENT_IDS`
      (adding the Android id as well is harmless).
   5. **iOS client id** (type "iOS"): needs the bundle id (item 1). Add it to `GOOGLE_CLIENT_IDS`, set
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and give the build its reversed form as `GOOGLE_IOS_URL_SCHEME`
      (`app.config.js` adds the Google sign-in config plugin only when that is set).
   6. **A development build with EAS** (`eas build --profile development`): the native Google sign-in does not work in
      Expo Go, which shows "Google sign-in is not available yet." on purpose.
   7. Try on a real phone: new Google person (One more step), existing player, an owner email (refused), cancel.

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

## Deployment tasks (security round, 2026-10-15)

None of these chooses a deferred value; they are the work to do when a server exists.

1. **HTTPS certificate** on the API and the web address, and redirect plain http to https. Set `ENVIRONMENT=prod`, `ALLOWED_HOSTS` (exact names) and `CORS_ALLOWED_ORIGINS` (exact https origins); the server refuses to start otherwise.
2. **Firewall:** only 80/443 open to the world. The database and Redis must not be reachable from outside.
3. **Secret management:** `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CODE_HASH_SECRET`, database and Redis passwords come from a secret store or the host's environment, never from the repository. Rotate them if they were ever shared.
4. **Redis:** set a password, bind to the private network only, never expose it publicly (rate limits, session cutoffs and locks live there).
5. **TRUSTED_PROXIES** and **CODE_HASH_SECRET**: set the final values when the server layout and keys are decided (not chosen here).
6. **Database:** a migration user and a separate least-privilege app user (see `docs/SECURITY.md`); encrypted backups; a restore drill before launch and then regularly.
7. **Monitoring and alerts:** error rate, 5xx, failed-sign-in spikes (audit log), disk, backup success, certificate expiry.
8. **Recovery procedure:** who can restore the database, how to revoke all sessions (change `JWT_SECRET`, or run "log out everywhere" per account), how to rotate a leaked secret.
9. Run `scripts/security-check.py` and fix what it reports; keep dependency updates flowing (`.github/dependabot.yml`).
10. **Arrange an independent security review and penetration test before processing real payments.**
11. Decision waiting for the owner: where web sign-in tokens live (httpOnly cookies need the final web address; see `docs/SECURITY.md`). Receipts are private since 2026-10-16 (signed links).
12. **Content-Security-Policy: replace `'unsafe-inline'` in `script-src` with a per-request nonce policy** (`frontend/web/next.config.ts`, with a middleware that sets the nonce). Deferred by decision (2026-10-24) to deploy time, because it needs the final web address and a production build to test against. Until then `script-src` is `'self' 'unsafe-inline'` (no `unsafe-eval` in a built site).

## Go-live blockers found in review (2026-10-16)

1. **Picture storage (Cloudinary) is built; it only needs the key.** `save_image`
   (`backend/app/shared/storage.py`) now uploads to Cloudinary when `CLOUDINARY_URL` is set:
   public pictures (arenas, courts, avatars, misc) as `type=upload` (public `secure_url` stored),
   and receipts as `type=authenticated` — receipts keep the same `/uploads/receipts/<name>`
   reference and the existing short-lived signed link (`/api/v1/media/receipts/...`), and the
   authenticated Cloudinary URL is minted server-side only, so a receipt never has a public
   address. Replacing/removing a picture deletes the old one from Cloudinary too. Outside
   development the server **refuses to start without `CLOUDINARY_URL`** (it used to fall back to
   local disk silently). **To do at go-live:** create a Cloudinary account (free plan is enough),
   copy its `CLOUDINARY_URL` from the dashboard into `backend/.env`. Local disk stays the default
   in development. (Warning kept for the record: many hosts wipe a server's own disk on every
   restart/deploy, which is why uploads must not live there.)
2. **Set `ENVIRONMENT` explicitly on every server** (`prod` or `staging`). The default is `dev`, which turns on the development behaviour (codes written to the log, interactive docs, mock helpers, plain-http origins). `scripts/security-check.py` warns when it is not set.

## Paying by card and mobile wallet (2026-10-16)

Built: card on Stripe's hosted card page and JazzCash / EasyPaisa by wallet number, both confirming the booking at once when the payment arrives (no owner step); bank transfer stays receipt + owner approval. Development uses stand-ins (a test card page and a wallet simulator with "development only" buttons). To make them real, nothing here chosen yet:

1. **Card (Stripe):** a Stripe account and keys: `STRIPE_SECRET_KEY`, and a webhook endpoint at `{API_PUBLIC_URL}/api/v1/webhooks/stripe` sending `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`, whose signing secret goes in `STRIPE_WEBHOOK_SECRET`. Stripe Checkout must accept PKR for the account (check before launch).
2. **`API_PUBLIC_URL`:** the public https address of the API; Stripe's card page sends the player back to the app through `/api/v1/payments/return`, which forwards only to app addresses (`arenahub://...`, and the web address in `WEB_PUBLIC_URL`).
3. **JazzCash and EasyPaisa:** merchant accounts, then connect their "mobile account" payment request APIs in `backend/app/integrations/payments/jazzcash.py` and `easypaisa.py` (the `initiate` method, which receives the wallet number) and their signed callbacks (already verified with `JAZZCASH_WEBHOOK_SECRET` / `EASYPAISA_WEBHOOK_SECRET`). Until then they show "coming soon" outside development.
4. The phone app's own link scheme (`arenahub://`) must be kept when the app identifiers are decided, or the return address list updated.
5. **Card provider switch (added 2026-10-25).** `CARD_PROVIDER` is `stripe` by default. Stripe was proven end to end in TEST mode (`docs/PAYMENT_SANDBOXES.md`); real PKR payments need a live Stripe account that is allowed to accept PKR, or SafePay. SafePay is only a switched-off foundation (`docs/SAFEPAY_INTEGRATION.md`): it needs a SafePay sandbox account and the unconfirmed API details settled before it can be used. With `CARD_PROVIDER=safepay` and `ENVIRONMENT=prod` the server refuses to start without its three credentials and `SAFEPAY_ENV=production`. Each payment records its provider, so a switch never strands an old payment.

## Go-live task: orphan photo uploads (2026-10-22)

**Known limitation, not fixed yet.** The owner photo picker (`frontend/web/components/owner/photo-upload.tsx`) uploads each photo to storage (local disk or Cloudinary) as soon as it is chosen, before the arena form is saved. If the owner then removes that photo from the picker, or closes the form without saving, the file stays on the storage backend with nothing in the database pointing at it — `update_arena`'s own cleanup only deletes a URL that was *dropped from a previously saved* `images` array, which never applies to a file that was uploaded and removed again before the first save. No route exists today to delete an uploaded-but-unsaved file by URL, so none is called.

This does not expose anything (the file sits at the same kind of address any saved photo would), it only wastes storage over time. At go-live, pick one:

1. **A scheduled cleanup job** (the existing APScheduler, `backend/app/tasks/scheduler.py`, already runs other periodic jobs): list files under the arenas/courts/misc folders older than some threshold (e.g. 48 hours), diff against every `images` URL actually referenced in `arenas`/`courts` rows, delete what's left over. Needs a "file created at" source — Cloudinary's admin API returns asset creation time; local disk can use the file's mtime.
2. **A `DELETE /uploads/image` route**, called by the picker itself the moment a photo is removed before save — simpler to reason about (no orphan ever accumulates) but is a new authenticated endpoint that has to be scoped so an owner can only delete files from their own just-uploaded batch, not an arbitrary URL.

Either way: **do this before storage costs matter**, since nothing currently reclaims this space.

## Added in the mobile round (2026-10-23)

1. **Production values for the phone build.** `EXPO_PUBLIC_API_URL` (https, no trailing slash, no `/api/v1`) and, once Google is set up, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, are given to the EAS build with `eas env:create` (see "First APK" in `docs/DEV_BUILD_AND_GOOGLE_PUSH.md`). Never put a secret in an `EXPO_PUBLIC_*` value: it is inside the app.
2. **Push needs Firebase.** `google-services.json` (kept out of git, or the EAS file secret `GOOGLE_SERVICES_JSON`) and the FCM service-account key uploaded to EAS. Without them the build works but push does not reach Android. Later hardening: check Expo's *receipts* and switch off phones they report gone (only the immediate answer is read today).
3. **Amenities: decided and built (2026-10-23).** One standard list of 14 (`backend/app/core/amenities.py`); owners tick them in the arena form. Older typed amenities that matched nothing were kept as extra text on the arena page. Before the first live deploy, run the migration on the live database after a backup, then look at the count in the migration log line ("N old rows matched ... kept as extra text").
4. **Mail.** The SMTP user and password on this machine are a Gmail test account. Move to a transactional service on the real sending domain (Brevo or Resend) before launch (item 6 at the top).
5. **Real gateway keys.** Stripe keys exist here, but card payments are not proven end to end until the public https webhook address is registered with Stripe and PKR is enabled on the account (the "Paying by card and mobile wallet" section). JazzCash and EasyPaisa still need merchant accounts.
6. **Terms and Privacy** text and the support email and hours are still open ("Decide at the very end", items 2 and 3); the Profile row and the "Contact us" block stay out until then.
7. **A balance payment nobody finishes** (a card page or wallet request left open) is closed by the scheduler after 24 hours so a new one can be started; a bank-transfer balance with a receipt waits for the owner and is never closed by it.
8. **Android permissions were trimmed** (no storage read or write, no developer-menu overlay in preview and store builds; the camera is now allowed for Take photo). On the first real phone, check both Take photo and Choose from gallery on an older and a newer Android.
9. **Sentry for the phone** is pinned to the version Expo SDK 54 expects (`~7.2.0`). When Expo is upgraded, run `npx expo-doctor` again.

10. **The final phone test.** Do `docs/REAL_PHONE_TEST.md` on one small and one large Android phone, with the development build, before anything is shown to real people. It lists only what a browser cannot prove, with an expected result and a PASS or FAIL box for each step.
11. **The dev-only "Backend Health" screen** (`/health` in the phone app) is a developer page with the system header. Hide it or remove it from the store build; it is not linked from any screen.
12. **Run the browser checks again against the staging site** (not only the scratch stack) after deployment: `scripts/verify_all_screens.mjs`, `scripts/verify_roles_security.mjs` and `scripts/verify_journey_extra.mjs`. Each has its usage at the top of the file.
