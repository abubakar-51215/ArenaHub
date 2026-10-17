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
   `com.arenahub.app` and the **SHA-1** from step 2. Add this id to
   `GOOGLE_CLIENT_IDS` too (comma-separated with the Web one).
5. Restart the backend so it reads the new `GOOGLE_CLIENT_IDS`. The Google button
   in the dev build now signs in for real.

## 4. Firebase: push on Android

Expo's push service delivers to Android through Firebase Cloud Messaging, so a
real Android build needs FCM credentials uploaded to EAS.

1. In console.firebase.google.com create a project (you can reuse the Google
   Cloud project).
2. **Add an Android app** with package name `com.arenahub.app`. Download the
   `google-services.json` it gives you and put it in `frontend/mobile/`
   (referenced by the build; do not commit a real one).
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

## What is missing in the backend push-sending code (for later)

`backend/app/integrations/push/expo_push.py` works (it posts to Expo's push API),
but for production it is thin:

1. **No receipt check / dead-token cleanup.** Expo returns a *ticket* per message
   and, a little later, a *receipt* that can say `DeviceNotRegistered`. We ignore
   both, so tokens for uninstalled apps are never removed and pile up. Add: read
   the tickets, fetch receipts, and delete `device_tokens` rows that come back
   `DeviceNotRegistered`.
2. **No chunking.** Expo accepts at most 100 messages per request; a large fan-out
   should be split into batches of 100.
3. **The module comment overstates it.** It says "no Firebase project or server key
   needed" — true only for Expo Go. A real Android build needs the FCM credentials
   from step 4 above.
4. **No access token.** Optionally send an Expo access token header for stricter
   delivery security (not required).

None of these stop push from working in a dev build today; they are hardening for
real traffic.
