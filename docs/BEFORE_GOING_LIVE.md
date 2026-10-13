# Before going live

A short list of values that are set for development and must be changed (or checked) for a real launch.
Nothing here has been changed; this is only the list.

1. **WEB_PUBLIC_URL** (backend). File: `backend/.env` (the example is `backend/.env.example`). It is read by the setting `web_public_url` in `backend/app/core/config.py` (alias `WEB_PUBLIC_URL`) and used in `backend/app/integrations/email/templates.py` to build the address of the logo badge in every email (`{WEB_PUBLIC_URL}/brand/email-badge@2x.png`). In development it is not set in `backend/.env`, so it uses the default `http://localhost:3000`, which a mail client cannot reach. Set it to the public address of the web app (https).
2. **NEXT_PUBLIC_SITE_URL** (web). Environment variable of the Next.js app, read in `frontend/web/app/layout.tsx` (`metadataBase`). Without it the share card and icons are addressed as `http://localhost:3000`. Set it to the public web address.
3. **NEXT_PUBLIC_API_URL** (web) and **EXPO_PUBLIC_API_URL** (mobile). Read in `frontend/web/config/index.ts` and `frontend/mobile/lib/config.ts`. The mobile one must be an https address in a release build.
4. **ENVIRONMENT** in `backend/.env` is `dev`; set it to `prod`.
5. **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** in `backend/.env` are placeholders (`sk_test_xxx`, `whsec_xxx`). Card payments answer "Card payments are not available yet" until a real key is set. JazzCash and EasyPaisa are "coming soon" until their gateway work is done.
6. **EMAIL_*** settings in `backend/.env` (host, username, password, from). The admin sign-in code is sent by email, so mail must work before launch.
7. Dev-only helpers: the payment `simulate-confirm` route must stay disabled outside dev, and the dev OTP logging must not be used.

**Rule for the development database: backup first, then migrate, every time** (`pg_dump -Fc` into `backend/backups/`, then `alembic upgrade head`; test and scratch first). Last backup: `backend/backups/arenahub-20261012-112458-after-g6.dump`, restore-checked into a throwaway database (dropped afterwards).

## Decide at the very end (do not build yet)

Open decisions only. Nothing here is chosen, and nothing for them is built in the app today.

1. **App identifiers** (`ios.bundleIdentifier`, `android.package`, build number, version code): which domain they will be based on. They cannot be changed after the first upload to a store.
2. **Final Terms and Privacy text**, and where it lives (in the app or on a web page). The Profile row "Terms and privacy" is left out until then.
3. **Real support email and support hours.** The "Contact us" block of Help and support is left out until then.
4. **The production web address** (`WEB_PUBLIC_URL`, and the matching `NEXT_PUBLIC_SITE_URL`).

## Also check before launch (added in the admin round)

* **Admin sign-in code email.** Admins sign in on the phone with a 6-digit emailed code (10 minutes, one new code a minute). In
  development the code is written to the server log (`otp_dev_delivery`); that must be off in production, and mail must work.
* **Suspended accounts** are told "Your account has been suspended." only after the right password. No support contact is shown
  there; add it with the support email once decided (see the list above).
* **Log lines.** The server now replaces characters a console cannot print (the rupee sign), so a notice never crashes a request on a
  non-UTF-8 console. Production logs are JSON on UTF-8; nothing to change.
* **Slot listing for past days.** `GET /courts/{id}/slots` still lists yesterday's slots as available; booking one is refused with
  "One of the selected slots is no longer available." (the app never shows past days). Decide if the list should hide them.
* **Low-contrast tokens.** The muted grey and the status-pill colours of the design tokens are below 4.5 : 1 for small text
  (3.3 to 4.0 for muted and red pills, 2.3 and 2.7 for the amber and lime pills). They come from the frames and are used on every
  screen. Decide if the tokens should be darkened.
* **Dark theme.** The phone app is light only (`hooks/use-color-scheme.ts`). The owner and admin web apps have light and dark.
