# Real-phone test results

The log for the real-device run. The step-by-step instructions are in `docs/REAL_PHONE_TEST.md` (the full 14-section
sheet) and `docs/PHONE_PAYMENT_TEST.md` (the Stripe card part). This file only records **what actually happened**.

Rules for filling it in:

- A row is **NOT TESTED** until it was done on a real phone. Never write PASS from "the code exists" or from a browser run.
- PASS needs evidence (a screenshot name, or the booking code). FAIL needs the step, what you saw and a screenshot.
- Stripe **test mode** passing is not proof of real-money readiness. Push and Google sign-in are not "done" because the code
  exists: they count only after they are seen working on the device.
- Fake or your own test accounts only; test cards only.

Device: ____________ (Android version ____ ) Date: ____________ Backend address used: http://<IP>:8000 App: Expo Go / development build

## 1. Setup

| # | Check | Result | Evidence / notes |
|---|---|---|---|
| 1.1 | PC and phone are on the same Wi-Fi | NOT TESTED | |
| 1.2 | Phone browser opens `http://<IP>:8000/api/v1/health` and shows `"success":true` | NOT TESTED | |
| 1.3 | `EXPO_PUBLIC_API_URL` is the PC address (not `localhost`); Expo was started with `--clear` | NOT TESTED | |
| 1.4 | The app opens on the phone and signs a test player in | NOT TESTED | |

## 2. Core booking flow

| # | Check | Result | Evidence / notes |
|---|---|---|---|
| 2.1 | Player sees arenas and free slots | NOT TESTED | |
| 2.2 | A booking is created (bank transfer, or card step 3) | NOT TESTED | |
| 2.3 | The same slot from a second account is refused ("no longer available"), no second booking | NOT TESTED | Server side already proven: 8 simultaneous requests gave one booking (`docs/qa/QA_BOOKING_PAYMENT_AUDIT.md`) |
| 2.4 | The booking pass and its QR code show | NOT TESTED | |

## 3. Payments (Stripe test mode)

| # | Check | Result | Evidence / notes |
|---|---|---|---|
| 3.1 | Card `4242 4242 4242 4242`: Stripe page opens, payment succeeds | NOT TESTED | Browser build already PASS (`docs/PAYMENT_SANDBOXES.md`) |
| 3.2 | The app comes back by itself to the waiting screen and then "Booking confirmed" | NOT TESTED | The real phone's browser window should close at the app address; the web pop-up does not |
| 3.3 | Declined card `4000 0000 0000 0002`: booking stays unpaid, can retry | NOT TESTED | Browser build PASS |
| 3.4 | Closing the Stripe window without paying: waiting screen, "reopen", leaving checkout frees the slot | NOT TESTED | |
| 3.5 | 3-D Secure `4000 0025 0000 3155`: authenticate, payment succeeds | NOT TESTED | Card numbers confirmed on Stripe's test-card page |
| 3.6 | 3-D Secure then decline `4000 0084 0000 1629` | NOT TESTED | |
| 3.7 | Cancelling a confirmed booking makes a refund (Stripe test dashboard: succeeded) | NOT TESTED | Browser PASS |
| 3.8 | Pay the balance online (after a reschedule to a dearer slot) | NOT TESTED | `REAL_PHONE_TEST.md` section 8 |

## 4. Device features

| # | Check | Result | Evidence / notes |
|---|---|---|---|
| 4.1 | Take photo and Choose from gallery work for the receipt and the profile picture | NOT TESTED | `REAL_PHONE_TEST.md` section 5 |
| 4.2 | Location permission, near-me, distance and radius | NOT TESTED | section 4 |
| 4.3 | A push notification arrives on the phone and its tap opens the right screen | NOT TESTED | Needs a development build and Firebase (`docs/DEV_BUILD_AND_GOOGLE_PUSH.md`); does not work in Expo Go |
| 4.4 | Google sign-in (new person, existing player, an owner email is refused) | NOT TESTED | Needs the Google Cloud Android client and an EAS development build |
| 4.5 | Android Back button on every main screen | NOT TESTED | section 10 |
| 4.6 | A small phone and a large phone | NOT TESTED | section 11 |
| 4.7 | Email codes arrive in a real inbox | NOT TESTED | Only the test Gmail account is set up |

## 5. Final checks

| # | Check | Result | Evidence / notes |
|---|---|---|---|
| 5.1 | Slow network and airplane mode: sensible messages, nothing lost | NOT TESTED | section 12 |
| 5.2 | Sign out and in again | NOT TESTED | section 13 |
| 5.3 | Account deletion (last, on a throwaway account) | NOT TESTED | section 14 |
| 5.4 | Every result above has its screenshot or booking code saved | NOT TESTED | |

## Summary (fill in at the end)

PASS ___  FAIL ___  NOT TESTED ___. Failures to fix: ____________________
