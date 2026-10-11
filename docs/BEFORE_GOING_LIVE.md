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
8. **Replace the draft Terms and Privacy text** (mobile, `frontend/mobile/constants/legal.ts`) with the final wording before any Play Store or App Store upload.
9. **Replace the PLACEHOLDER support email and hours** (mobile, `frontend/mobile/constants/support.ts`: `support@arenahub.pk` and "Monday to Friday, 9:00 AM to 6:00 PM (PKT)") with the real ones before any Play Store or App Store upload.
10. **App identifier** `arenahub.app.pk` (`ios.bundleIdentifier` and `android.package` in `frontend/mobile/app.json`, build number 1, version code 1) cannot be changed after the first upload to a store. Both stores accept the format; neither checks that you own the domain.
