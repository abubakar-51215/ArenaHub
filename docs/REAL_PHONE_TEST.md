# Real phone test sheet

This sheet is only for what a browser cannot prove. Everything else (screens, sizes, API, payments in
test mode, filters, balance, owner and admin web) has already been checked in a browser and by the
automatic tests. Do the steps in order. For each step, tick one box.

**Before you start**

- Build and install the Android development build: follow `docs/DEV_BUILD_AND_GOOGLE_PUSH.md`
  ("First APK").
- Use a test account only (a fake or your own test mailbox), never a real customer.
- Keep the backend log open on the computer so you can read sign-in codes when mail is not set up.
- Do this on one **small** phone (about 5 inches) and one **large** phone (6.5 inches or bigger) where
  the sheet says so.

Tick **PASS** only when you see exactly the expected result. If anything else happens, tick **FAIL**
and see the last section.

---

## 1. Install and open

| # | Do this | You should see | Result |
|---|---|---|---|
| 1.1 | Install the APK and open ArenaHub | A welcome screen, then the log in screen. No crash, no red error screen. | ☐ PASS ☐ FAIL |
| 1.2 | Close the app fully, open it again | It opens again in a few seconds. | ☐ PASS ☐ FAIL |

## 2. Google sign-in

| # | Do this | You should see | Result |
|---|---|---|---|
| 2.1 | On the log in screen tap **Continue with Google** | The phone's own Google account picker opens (not a web page that fails). | ☐ PASS ☐ FAIL |
| 2.2 | Choose a Google test account | You land inside the app (Home, or "One more step" if the phone number is missing). | ☐ PASS ☐ FAIL |
| 2.3 | Tap Back out of the picker on a second try | You return to the log in screen with no error. | ☐ PASS ☐ FAIL |

## 3. Push notifications

On the computer, in `backend`, run: `uv run python -m scripts.send_test_push <the test account's email>`

| # | Do this | You should see | Result |
|---|---|---|---|
| 3.1 | Sign in on the phone, allow notifications when the phone asks, then run the command above | The script prints **Sent.** | ☐ PASS ☐ FAIL |
| 3.2 | Lock the phone screen and wait up to one minute | A notification "ArenaHub test notification — Push notifications are working on this phone." | ☐ PASS ☐ FAIL |
| 3.3 | Make a real booking from a second account on the same arena, then tap the "booking" notification on the phone | The app opens on that booking's details (not on the home screen). | ☐ PASS ☐ FAIL |
| 3.4 | Tap a notification while the app is fully closed | The app starts and goes to the right screen. | ☐ PASS ☐ FAIL |
| 3.5 | In Profile → Settings switch the booking notices off, trigger another booking event | No push arrives for that kind. Switch it back on after. | ☐ PASS ☐ FAIL |

## 4. Location, near me, distance, radius

| # | Do this | You should see | Result |
|---|---|---|---|
| 4.1 | Open the app on a fresh install (or the next day after "Not now"). A card asks to use your location: tap **Use my location** | The phone's own location question appears. | ☐ PASS ☐ FAIL |
| 4.2 | Allow while using the app | Arena cards show a distance like "2.4 km". In Search → Filters → Sort by → **Near me**, the nearest arena is first. | ☐ PASS ☐ FAIL |
| 4.3 | Search → Filters → **How far**: choose 5 km, then apply | Only arenas inside 5 km are listed. The Filters button shows a count. | ☐ PASS ☐ FAIL |
| 4.4 | Turn the phone's location off, open Filters again | The **How far** row is greyed out and says "Location is off." | ☐ PASS ☐ FAIL |
| 4.5 | Turn location on again and open an arena page → **Get Directions** | Google Maps (or the phone's map app) opens with a route to the arena. | ☐ PASS ☐ FAIL |
| 4.6 | Deny the location question on a fresh install | The app still works. You see "Needs your location." where distance would be, and no crash. | ☐ PASS ☐ FAIL |

## 5. Camera and gallery

| # | Do this | You should see | Result |
|---|---|---|---|
| 5.1 | Profile → Edit profile → tap the picture | A sheet "Add a photo" with **Take photo**, **Choose from gallery** and **Cancel**. | ☐ PASS ☐ FAIL |
| 5.2 | Tap **Take photo**, allow the camera, take a picture, accept it | The new picture shows in the profile. After Save, it is still there when you reopen the screen. | ☐ PASS ☐ FAIL |
| 5.3 | Tap **Take photo** and press **Don't allow** | The message "Camera is off. Allow it in your phone settings to take a photo." No crash. | ☐ PASS ☐ FAIL |
| 5.4 | Tap **Choose from gallery** and pick a photo | The photo is used. The phone does not ask for storage permission on a new Android. | ☐ PASS ☐ FAIL |
| 5.5 | On an older Android (version 10 or lower) repeat 5.4 | The gallery opens and a photo can be picked. | ☐ PASS ☐ FAIL |
| 5.6 | Make a bank-transfer booking, open the receipt screen, tap **Upload a photo**, then **Take photo** of any paper | The picture appears as the receipt. **Send receipt** works. | ☐ PASS ☐ FAIL |
| 5.7 | Pick a file that is not a picture or is very large (over 5 MB) | A clear message is shown and nothing is sent. | ☐ PASS ☐ FAIL |

## 6. Booking pass (QR)

| # | Do this | You should see | Result |
|---|---|---|---|
| 6.1 | Open a **confirmed** booking → **View Pass** | A screen "Your pass" with a QR code and the booking code in text. | ☐ PASS ☐ FAIL |
| 6.2 | Look at the QR at half brightness, then full brightness | It is sharp and scannable by a second phone's camera app (it shows a long code; that is expected). | ☐ PASS ☐ FAIL |
| 6.3 | Open the pass of a booking that is not confirmed | No pass. A clear message instead of a QR. | ☐ PASS ☐ FAIL |

## 7. Payments on the phone

Test mode only. Do not use a real card.

| # | Do this | You should see | Result |
|---|---|---|---|
| 7.1 | Book a slot → Pay. Look at the list of ways to pay | Only the ways that really work are tappable. Others say "Not available yet" or "Coming soon". | ☐ PASS ☐ FAIL |
| 7.2 | Pay with **Bank transfer**: send the receipt photo, then on the owner's web approve it | The booking changes from "Awaiting approval" to confirmed, and a notification arrives. | ☐ PASS ☐ FAIL |
| 7.3 | Pay by **Card** (only if shown as available): use the Stripe test card 4242 4242 4242 4242 | The Stripe page opens, then the app returns to a confirmed booking. | ☐ PASS ☐ FAIL |
| 7.4 | While paying by card, press the phone's Back button | You go back safely; the booking is not confirmed and not charged twice. | ☐ PASS ☐ FAIL |

## 8. Pay the balance

| # | Do this | You should see | Result |
|---|---|---|---|
| 8.1 | Open a confirmed booking that was paid with an advance only | A line "Balance to pay" with an amount, and a **Pay balance** button. | ☐ PASS ☐ FAIL |
| 8.2 | Tap **Pay balance** | The amount is fixed (the text says it cannot be changed). You can only choose how to pay. | ☐ PASS ☐ FAIL |
| 8.3 | Pay it by bank transfer and send the receipt | The booking shows "Awaiting approval". The Pay balance button is gone. | ☐ PASS ☐ FAIL |
| 8.4 | Owner approves on the web | The booking shows **Balance paid**. A notification arrives. | ☐ PASS ☐ FAIL |
| 8.5 | Tap Back or close the app in the middle of paying | When you return, you are not charged twice and the screen shows the real state. | ☐ PASS ☐ FAIL |

## 9. Light and dark mode

| # | Do this | You should see | Result |
|---|---|---|---|
| 9.1 | Set the phone to **dark** mode, open Home, Search, Bookings, Play, Profile and one arena page | Every screen is readable: no white text on a white card, no black text on black. | ☐ PASS ☐ FAIL |
| 9.2 | Set the phone to **light** mode and repeat | Same, readable. | ☐ PASS ☐ FAIL |
| 9.3 | Open the Filters sheet and the photo sheet in dark mode | Both are readable and the buttons are visible. | ☐ PASS ☐ FAIL |

## 10. Android Back button

Press the phone's Back button on each screen and check where you go.

| # | Screen | Back should | Result |
|---|---|---|---|
| 10.1 | Home | Close the app (or ask to exit). It must not return to the log in screen. | ☐ PASS ☐ FAIL |
| 10.2 | Search | Go to Home. | ☐ PASS ☐ FAIL |
| 10.3 | Bookings | Go to Home. | ☐ PASS ☐ FAIL |
| 10.4 | Play | Go to Home. | ☐ PASS ☐ FAIL |
| 10.5 | Profile | Go to Home. | ☐ PASS ☐ FAIL |
| 10.6 | An arena page | Go back to where you came from. | ☐ PASS ☐ FAIL |
| 10.7 | Booking pass, booking details, filters, a sheet | Close the sheet first, then go back one screen. | ☐ PASS ☐ FAIL |
| 10.8 | After a payment is confirmed | Back does not return into the payment screen. | ☐ PASS ☐ FAIL |

## 11. Small phone and large phone

| # | Do this | You should see | Result |
|---|---|---|---|
| 11.1 | Small phone: open Home, an arena, Pick a slot, Pay, Pay balance, Filters | Nothing is cut off, all buttons can be tapped (scroll if needed), no text overlaps. | ☐ PASS ☐ FAIL |
| 11.2 | Large phone: the same screens | Nothing looks stretched or tiny. | ☐ PASS ☐ FAIL |
| 11.3 | Turn the phone's font size to the largest | Text grows, buttons still readable and tappable. | ☐ PASS ☐ FAIL |
| 11.4 | Open the keyboard on a form (log in, search, profile) | The field you are typing in stays visible above the keyboard. | ☐ PASS ☐ FAIL |

## 12. Slow network and airplane mode

| # | Do this | You should see | Result |
|---|---|---|---|
| 12.1 | Turn on airplane mode while on Home | A banner "You are offline" appears. No crash. | ☐ PASS ☐ FAIL |
| 12.2 | In airplane mode tap Search or open Bookings | A friendly message about no connection, not a blank screen. | ☐ PASS ☐ FAIL |
| 12.3 | Turn airplane mode off | The banner disappears and the lists load by themselves or with Try again. | ☐ PASS ☐ FAIL |
| 12.4 | Use a very slow connection (or Wi-Fi far from the router) and open an arena | A loading state, then the arena. No endless spinner and no double booking. | ☐ PASS ☐ FAIL |

## 13. Sign out and sign in again

| # | Do this | You should see | Result |
|---|---|---|---|
| 13.1 | Profile → **Log out** → confirm | The log in screen. The Back button does not return into the app. | ☐ PASS ☐ FAIL |
| 13.2 | Log in again with the same account | Home, with your bookings still there. | ☐ PASS ☐ FAIL |
| 13.3 | After logging out, send the test push again | Nothing arrives on this phone (the phone is no longer registered for that account). | ☐ PASS ☐ FAIL |
| 13.4 | Log in with the wrong password | A clear "wrong email or password" message. | ☐ PASS ☐ FAIL |

## 14. Delete account (last, on a throwaway account)

| # | Do this | You should see | Result |
|---|---|---|---|
| 14.1 | Profile → Settings → **Delete account** | A sheet "Delete your account?". | ☐ PASS ☐ FAIL |
| 14.2 | Confirm | A screen "Enter the code". A 6-digit code was sent to the account's email (or is in the backend log). | ☐ PASS ☐ FAIL |
| 14.3 | Type a wrong code | A clear error. The account is still there. | ☐ PASS ☐ FAIL |
| 14.4 | Type the right code | You are logged out. Logging in again with that account is refused. | ☐ PASS ☐ FAIL |
| 14.5 | With an upcoming booking, try again on another test account | The app says why it cannot delete now. | ☐ PASS ☐ FAIL |

---

## If something looks wrong, send me:

1. A **screenshot** of the phone (include the whole screen).
2. The **screen name** (for example "Pay balance" or "Filters").
3. **What you tapped**, in order, just before it looked wrong.
4. The step number from this sheet (for example "8.3").
5. For a crash: the phone model and Android version, and the time it happened.

Please do not send passwords, full card numbers or real customers' details.
