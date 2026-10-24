# Development build, Google sign-in, and push (phone app)

Written in simple English. It lists the exact steps and says which key goes
where. **Android first** (it is free); iOS is noted at the end (it needs a paid
Apple account). You do these once, when the accounts exist; nothing here is
needed for day-to-day development in Expo Go.

Why a development build at all: native Google sign-in and push notifications do
**not** work in Expo Go. In Expo Go the app already fails safely — the Google
button says "Google sign-in is not available yet." and push is simply off. To
try them for real you build a *development build* (a real app with the native
code) and run the same dev server against it.

Values you will create are kept out of the repo. Where each one goes:

| Value | Goes in | Read by |
|---|---|---|
| Web OAuth client id | backend `.env` `GOOGLE_CLIENT_IDS`, and phone `.env` `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | the server checks the sign-in token's audience; the phone asks Google with it |
| Android OAuth client id | backend `.env` `GOOGLE_CLIENT_IDS` (add it next to the Web one, comma-separated) | the server's audience check |
| iOS OAuth client id | backend `.env` `GOOGLE_CLIENT_IDS`, phone `.env` `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and `GOOGLE_IOS_URL_SCHEME` (reversed) | server + phone (iOS only) |
| `google-services.json` (Firebase) | phone project, referenced by the build | the Android build, for push |
| FCM service-account JSON | uploaded to EAS (not the repo) | Expo's push service, to deliver to Android |

The app identifiers are fixed: **`com.arenahub.app`** for both `ios.bundleIdentifier`
and `android.package` (in `app.json`). **Changing them later also means redoing the
Google and Firebase setup** (the Android OAuth client and the Firebase app are tied
to the package name), so decide the final identifier before the first real build.

## First APK: what the owner of the Expo account types, in order

Do this once, on the computer, from the repo. It makes an installable test APK (the `preview`
profile) with nothing from the Expo or Google accounts written in the code. Android only. Allow
about 20 minutes for the first cloud build.

1. `npm install -g eas-cli` (once), then `eas login` and sign in as the Expo account that owns the
   project (`owner` in `frontend/mobile/app.json`; check with `eas whoami`).
2. `cd frontend/mobile`
3. Give the build its public values (plain text; these are not secrets). Run
   `eas env:create` once for each name below and answer the questions it asks (the value, then
   the environment: choose **preview**, and visibility **plain text**):
   * `EXPO_PUBLIC_API_URL` — the **https** address of the API, with no trailing slash and no
     `/api/v1` (the app adds that itself). A release build refuses a plain `http` address.
   * `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — only when Google sign-in is set up (step 3 below).
   * `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` — the Android OAuth client id for Expo's browser OAuth flow.
4. Push needs Firebase's file (step 4 below). Either keep `google-services.json` in
   `frontend/mobile/` while you build (git ignores it), or store it as an EAS file secret:
   `eas env:create` with name `GOOGLE_SERVICES_JSON`, type **file**, visibility **secret**,
   environment **preview**.
5. `eas build --profile preview --platform android`
   When it ends, EAS prints a link to the `.apk`. Open the link on the phone and install it
   (allow "install unknown apps" when the phone asks).
6. On the server, check what is set up: `cd backend` then
   `uv run python -m scripts.check_integrations` (it prints only SET or MISSING).
7. Sign in on the phone, then from the server send one test push:
   `uv run python -m scripts.send_test_push you@example.com` (it prints "Sent." or the reason; it
   never prints a token). Then follow `docs/REAL_PHONE_TEST.md`.

The `development` profile (a dev client, see section 1) is for trying changes against the dev
server; `preview` is the build to hand to testers; `production` makes the store bundle (an AAB)
and is not used until the store accounts exist. `production` has no development-only settings: it
is not a dev client, and it asks for no developer-menu permission.

## 0. One-time tools

1. Create a free **Expo** account at expo.dev.
2. Install the CLI and sign in (from `frontend/mobile/`):
   ```
   npm install -g eas-cli
   eas login
   ```
3. `eas.json` already exists in `frontend/mobile/` with three profiles:
   `development` (a dev client APK), `preview` (an internal test APK), `production`.

## 1. Android development build

From `frontend/mobile/`:
```
eas build --profile development --platform android
```
EAS builds in the cloud and gives a link to an `.apk`. Install it on an Android
phone (or an emulator). Then start the dev server and open the dev build:
```
npm run dev:mobile
```

## 2. Get the Android signing SHA-1 (needed by the Google Android client)

```
eas credentials
```
Choose **Android → (your project) → Keystore → Build credentials**. Copy the
**SHA-1 fingerprint**. (Once the app is on Google Play, also add the Play App
Signing SHA-1 from the Play Console.)

## 3. Google Cloud: the OAuth clients

1. In console.cloud.google.com create (or choose) a project for ArenaHub.
2. **OAuth consent screen:** set the app name, a support email, and the privacy
   policy link; add the scopes `openid`, `email`, `profile`; publish it before
   launch.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   This id is the **audience the server checks**. Put it in:
   - backend `.env`: `GOOGLE_CLIENT_IDS=<web client id>`
   - phone `.env`: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>`
4. **Create credentials → OAuth client ID → Android.** It needs the package name
   `com.arenahub.app` and the **SHA-1** from step 2. Google uses it to recognise the
   app, so it must exist in the same project, but the sign-in token the phone sends is
   issued for the **Web** client id (that is what the app asks with), so the server's
   `GOOGLE_CLIENT_IDS` needs the Web id. Adding the Android id next to it
   (comma-separated) is harmless. The phone needs no Android id in its settings.
5. Restart the backend so it reads the new `GOOGLE_CLIENT_IDS`. The Google button
   in the dev build now signs in for real.

## 4. Firebase: push on Android

Expo's push service delivers to Android through Firebase Cloud Messaging, so a
real Android build needs FCM credentials uploaded to EAS.

1. In console.firebase.google.com create a project (you can reuse the Google
   Cloud project).
2. **Add an Android app** with package name `com.arenahub.app`. Download the
   `google-services.json` it gives you and put it in `frontend/mobile/`, or store it
   as the EAS file secret `GOOGLE_SERVICES_JSON` (see "First APK", step 4).
   `frontend/mobile/app.config.js` hands the file to the build when it exists; git
   ignores it, so a real one is never committed. Without the file the build still
   works but push does not reach Android.
3. In Firebase **Project settings → Service accounts → Generate new private key**
   — this downloads a service-account JSON for FCM V1.
4. Upload it to EAS:
   ```
   eas credentials
   ```
   **Android → Push Notifications: FCM V1 → upload the service-account key.**
5. Rebuild the development build so it includes the Firebase config. Register the
   device (the app does this on first open), then a real notification arrives.

## 5. iOS (note only — needs a paid Apple Developer account)

- Bundle id `com.arenahub.app` (already set).
- An **iOS OAuth client id**: add it to `GOOGLE_CLIENT_IDS`, set
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and give the build the **reversed** client id
  as `GOOGLE_IOS_URL_SCHEME` (`app.config.js` adds the Google plugin only when that
  is set).
- Push on iOS needs an **APNs key** uploaded to EAS (`eas credentials → iOS`).
- Build with `eas build --profile development --platform ios` (needs the Apple
  account). Everything else mirrors Android.

## What the backend push-sending code does now, and what is left

`backend/app/integrations/push/expo_push.py` posts to Expo's push API.

Done (tested in `backend/tests/test_push_delivery.py`):

1. Expo's answer for each message is read. A device it says is gone
   (`DeviceNotRegistered`) is switched off in `device_tokens` and never tried again.
2. At most 100 messages go to Expo in one request; a bigger send is split.
3. Each message names the Android channel the app creates (`default`) and carries the
   event name, so a tap opens the right screen.
4. A push token is never written to a log (a failed send logs only how many devices
   and the error's name).
5. Signing out removes the phone's token; deleting the account switches off all of
   that person's tokens; one phone belongs to one account at a time.
6. The player's notification preferences are respected (a notice switched off sends no
   push; the in-app notice is still saved).

Left for later (hardening, not needed for a first test):

1. **Receipts.** Expo also gives a *receipt* a few minutes after a send, which can say
   `DeviceNotRegistered` for a phone that looked fine at send time. Only the
   immediate answer is read today. Add a scheduled job that fetches receipts and
   switches off those tokens.
2. An Expo access token header, for stricter delivery security (optional).
