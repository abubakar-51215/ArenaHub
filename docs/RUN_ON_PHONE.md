# Run ArenaHub on your real phone

Simple steps, in order. Tested from the computer as far as possible (see "What was and was not tested" at the end). Do the steps on the Windows computer where the project is.

## 1. What to install on the phone

- Install **Expo Go** (Android: Play Store; iPhone: App Store).
- The app uses **Expo SDK 58** (`"expo": "~58.0.x"` in `frontend/mobile/package.json`). Expo Go must support SDK 58.
- If Expo Go says "Project is incompatible with this version of Expo Go" (the store version does not match SDK 58):
  - **Android:** open https://expo.dev/go, choose SDK 58 and install that Expo Go file (an APK). Remove the store version first.
  - **iPhone:** the App Store only gives the newest Expo Go and you cannot install an older one. If it does not match SDK 58, make a development build instead (`docs/DEV_BUILD_AND_GOOGLE_PUSH.md`).
- **Expo Go cannot receive push notifications** (Expo removed them from Expo Go in SDK 53). The app knows this: in Expo Go it never loads the push code, registers nothing and logs nothing about it. Push works only in a real build. Expo Go also shows its own splash first, not the ArenaHub one; the animated ArenaHub splash inside the app still plays.
- Expo Go must match the project: the exact versions are in `frontend/mobile/package.json` (for example `expo ~58.0.19`, `expo-constants ~58.0.13`, `expo-file-system ~58.0.11`). Run `npm install` in `frontend/mobile` after pulling. The computer needs Node 22.13 or newer.

## 2. Same Wi-Fi, and the computer's address

- The phone and the computer must be on the **same Wi-Fi**. A guest network or "AP isolation" blocks it.
- On the computer open PowerShell and run: `ipconfig`
- Find the block "Wireless LAN adapter Wi-Fi" and write down **IPv4 Address**. It is different on every network and can change when the router restarts, so read it from `ipconfig` each time; do not reuse an address from an old note. Ignore the "Local Area Connection*" blocks (hotspot).
- Below, `<IP>` means that address.

## 3. Tell the app where the backend is

- File: `frontend/mobile/.env`
- Setting name: `EXPO_PUBLIC_API_URL`
- It is now `EXPO_PUBLIC_API_URL=http://localhost:8000`. **`localhost` does not work on a phone** (on the phone it means the phone itself).
- Change it to `EXPO_PUBLIC_API_URL=http://<IP>:8000` (for example, if `ipconfig` shows `192.168.x.y`, write `http://192.168.x.y:8000`). No slash at the end and no `/api/v1`.
- The app builds the live-slots WebSocket address from the same setting, so nothing else needs changing.
- This setting is read when Expo starts. After you change it, start Expo again with `--clear` (step 5).
- To use the scratch backend (see step 8) use `http://<IP>:8001` instead.

## 4. Start the backend so the phone can reach it

In PowerShell:

```
cd E:\summerr\ArenaHub\backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` means "listen on every network address", not only on this computer.

- Check from the computer: open `http://<IP>:8000/docs` in a browser. You should see the API page. (Tested: it opens with the computer's own Wi-Fi address.)
- Check from the phone browser (after step 6): the same address should open too. If it does not, the firewall is the reason.
- Allowed hosts and CORS: nothing to change. CORS only applies to browsers; the phone app is not a browser. The backend has no allowed-hosts list. The dev CORS list (`localhost:3000`, `localhost:8081`) only matters for the web versions.

## 5. Start Expo and open the app

```
cd E:\summerr\ArenaHub\frontend\mobile
npx expo start --clear
```

- A QR code appears in the terminal.
- **Android:** open Expo Go, tap "Scan QR code", scan.
- **iPhone:** open the normal Camera app, scan, tap the banner "Open in Expo Go".
- If it says **"could not connect"** or the page never loads:
  1. Check the phone is on the same Wi-Fi (step 2).
  2. Open `http://<IP>:8081` in the phone browser. If it does not open, it is the firewall (step 6) or Wi-Fi isolation (try another Wi-Fi or the phone's hotspot with the computer joined to it).
  3. `npx expo start --tunnel` is a last resort. It needs one extra install the first time (Expo asks to install `@expo/ngrok`; answer yes). **The tunnel only carries the app code (Metro). It does not carry the backend.** The phone still has to reach the backend, so with a tunnel you also need a tunnel for port 8000 (for example `ngrok http 8000`) and `EXPO_PUBLIC_API_URL` set to that https address. The normal same-Wi-Fi way is simpler. With a tunnel for port 8000, every request reaches the backend from the tunnel program on this computer, so start the backend with `TRUSTED_PROXIES=127.0.0.1` (the rate limit is then counted per phone, not shared by all of them). On the same Wi-Fi nothing is needed.

## 6. Windows Firewall (you do this yourself; I did not change it)

Windows blocks other devices from reaching your computer on a "Public" network. On this computer the Wi-Fi network "PTCL-BB 5" is **Public**, so the rule below would do nothing until you make it **Private**.

1. Settings > Network & internet > Wi-Fi > your network > **Network profile type: Private network**. Use this only on a network you trust (home).
2. Open PowerShell **as Administrator** and run (private networks only):
   ```
   New-NetFirewallRule -DisplayName "ArenaHub dev phone test" -Direction Inbound -Protocol TCP -LocalPort 8000,8001,8081 -Action Allow -Profile Private
   ```
   (8001 is only for the scratch backend in step 8.)
3. When you finish testing, **undo it**:
   ```
   Remove-NetFirewallRule -DisplayName "ArenaHub dev phone test"
   ```
   and set the network back to Public if you want.
4. Never open these ports on a Public network (cafe, university).

## 7. Test accounts (test data only)

All passwords below are for test accounts in the development databases.

| Database | Role | Sign in with | Password |
|---|---|---|---|
| dev (`arenahub`, backend port 8000) | Player | `ayesha.siddiqui@example.com` or phone `03061234567` | `Player@1234` |
| dev | Owner | `owner@arenahub.pk` or phone `03001112233` | `Owner@1234` |
| dev | Admin | `admin@arenahub.pk` | `StrongP@ss1`, then an emailed code (below) |
| scratch (`arenahub_scratch`, backend port 8001) | Player | `ayesha.siddiqui@example.com` or phone `03061234567` | `Player@1234` |

The scratch database has no owner or admin account that I know the password of. Use the dev database for those.

**Codes in dev:** every 6-digit code (sign-up, admin sign-in, forgot password, change of email or password) is printed in the backend terminal (the window where `uvicorn` runs) as a line like `code_dev_delivery destination=admin@arenahub.pk purpose=admin_login code=123456`. Type those six digits. A code works for 10 minutes and once; after 5 wrong tries ask for a new one; a new code can be asked for 60 seconds after the last. (The admin screen on the phone is temporary; admin work is on the web at http://localhost:3000/admin/login.)

**Real email (to see a code arrive in Gmail):**

1. In `backend\.env` fill `EMAIL_HOST` (`smtp.gmail.com`), `EMAIL_PORT` (`587`), `EMAIL_USERNAME` and `EMAIL_FROM` (your Gmail address) and `EMAIL_PASSWORD` (a Gmail App Password: turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords; 16 letters, no spaces; the normal Gmail password does not work). Set `EMAIL_SEND_IN_DEV=1`. Do not share this file.
2. Check it without the app, in `backend`: `uv run python scripts/send_test_email.py <your address>`. It answers `Sent.` or names the problem (login refused, cannot connect, TLS, sender refused) with a one-line fix. It never prints the password.
3. Restart the backend. Its first lines include `email_mode mode=smtp host=smtp.gmail.com port=587`. If it says `mode=console`, the reason is on the same line.
4. On the phone and on the web, check:
   * **Sign up** with an inbox you can open: the code screen says "We sent a 6-digit code to a\*\*\*@gmail.com", and the email "Your ArenaHub code: 123456" arrives (check Spam the first time).
   * **Wrong code:** the boxes shake once and "That code is not right, or it has expired." shows under them; the boxes empty for the next try.
   * **Right code:** you are signed in.
   * **Send a new code:** grey "Send a new code in 0:42" counts down, then "Send a new code"; tap it, "New code sent to a\*\*\*@gmail.com" shows, only the newest code works.
   * **Admin sign-in** (web `/admin/login`, or the phone): after the password, the code email arrives; enter it.
   * **Forgot password:** the code email arrives; enter it, then the new password; every device is signed out.
   * **Change email** (phone Profile > Personal information > Change email, or web owner Profile): enter the new address and your password; the code goes to the new address; the old address gets "Your ArenaHub email was changed" after it is confirmed.
5. If the email does not come: the backend terminal shows `code_not_sent` with the reason and a hint, and the screen says "We could not send the code. Tap Resend."

## 8. Which backend to use for the phone test

Use the **scratch backend (port 8001)** for testing G1 to G5. The player `ayesha.siddiqui@example.com` has bookings in every state there: confirmed, awaiting approval, awaiting payment, past (rated and not rated), cancelled (refund pending, refunded, none), a rejected receipt and a released booking. The dev database is not seeded and has only 2 bookings for her.

Start it (PowerShell). Take the database address from `backend\.env` (`DATABASE_URL`) and change only the database name at the end to `arenahub_scratch`; do not paste the password anywhere else:

```
cd E:\summerr\ArenaHub\backend
$env:DATABASE_URL = "<the DATABASE_URL line from backend\.env, with /arenahub at the end changed to /arenahub_scratch>"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Then set `EXPO_PUBLIC_API_URL=http://<IP>:8001` in `frontend/mobile/.env` and run `npx expo start --clear`. Redis must be running (it is shared with the dev backend).

Note: some scratch bookings are for fixed dates a few days ahead; if they have passed they move to Past on their own. Moving, cancelling or paying changes scratch data only.

## 8b. What you see when the backend cannot be reached

The app never waits forever on the splash. At start-up every network call gives up after 8 seconds, and the splash ends by itself after 12 seconds at the latest.

- **Backend stopped, or the computer unreachable (wrong address, firewall, other Wi-Fi):** the splash plays, then **Log in** opens with a calm green note at the top: "Cannot reach the server. Check your connection." and a **Try again** link. A wrong address takes about 8 seconds longer (the app waits 8 seconds for an answer); a stopped backend is answered at once.
- If you were signed in before, you are **not** signed out: the saved sign-in stays on the phone. After the backend is back, tap **Try again** and the app goes straight to Home. (A sign-in that the server turns down, for example an expired one, is removed.)
- If you were not signed in, Log in shows as usual (no network call is made at start-up).
- In development the Metro terminal prints a short line for each step the splash waits for, for example: `[startup +  253 ms] splash shown`, `saved sign-in read from the phone`, `checking the saved sign-in with the server (GET /users/me, 8 s limit)`, `session ready`, `leaving the splash`. Read these lines and send them to me if the splash ever stays too long.

## 9. A 15-minute test list

Do these in order on the phone. "OK" says what a correct result looks like.

1. **Splash:** open the app. OK: the dark ArenaHub animation plays (ring, racket and bat, a ball laps the ring, wordmark and tagline appear), then the Log in screen. First launch about 6 seconds; next launches about 3. A tap skips it.
2. **Log in:** the small ArenaHub mark is at the top; sign in with the player. OK: if it takes over half a second a full-screen loader (a ball running round the ring) shows; then Home.
3. **Haptics:** a light tap when you press a black button; a buzz on an error (try a wrong password once).
4. **Home:** the dark top with the mark, sport chips, sections of arenas. OK: pull down to refresh; a small spinner shows and the lists reload.
5. **Search:** type a sport or name. OK: results list; Filters opens and closes.
6. **Arena:** open one. OK: photos, courts with "N open tonight", the sticky "Choose a court" button.
7. **Slots:** choose a court. OK: a 7-day strip, times in groups; tap two times next to each other; the bar shows the range and the total; Continue.
8. **Review booking:** OK: arena, date, time, price from the server, the cancellation sentence; "Continue to payment".
9. **Payment:** OK: four options (Card "Not available yet", Bank transfer, JazzCash and EasyPaisa "Coming soon"); nothing chosen; the Pay button is grey until you pick Bank transfer. Pay. OK: the Bank transfer screen with the account details and "Copy account number" (try it and paste somewhere).
10. **Receipt photo:** tap "Upload a photo", pick a photo from the phone, "Send receipt". OK: "Receipt sent." screen with status "Awaiting approval".
11. **My bookings:** OK: Upcoming, Past, Cancelled tabs with cards; pull to refresh. Open the new booking: status "Awaiting approval".
12. **Cancel sheet:** on that booking tap "Cancel booking". OK: the background dims and blurs and the sheet rises (about a third of a second); it shows You paid / Kept by arena / You get back and, for a booking with a receipt, "Your receipt is with the arena...". Tap "Stay" (the sheet closes). Try cancel on a confirmed booking from the scratch data: after "Yes, cancel booking" a top message and the Cancelled tab.
13. **Reschedule:** on a confirmed booking tap "Reschedule", pick another day and time, "Review change", "Move booking". OK: "Booking moved." and the detail shows "Reschedule not available" (one move only).
14. **History report:** Profile > Booking History > pick a period > "Download report". OK: the phone's share sheet opens with a PDF; open it or save it.
15. **Logo loader:** open a slow list (Past tab right after pulling to refresh, or turn Wi-Fi off and open Search): a ball runs around the ring. With Wi-Fi off, "Could not load" shows the grey broken-ring mark and "Try again".
16. **Blur and sheet:** any sheet (Cancel, Leave payment on the bank screen back button): OK on iPhone the background is blurred; on Android it is only dimmed (this is expected).

## 10. What to send back to me

- A screenshot of anything that looks wrong (cut-off text, overlapping, wrong colours, a button you could not tap).
- The exact text of any red error screen (Expo Go shows the message and a stack).
- Which step number from the list above, which phone (model and Android or iOS version), and which backend (8000 or 8001).
- If something is slow: how many seconds, and whether Wi-Fi was strong.

## What was and was not tested

- Tested from the computer: the backend starts with `--host 0.0.0.0` and `http://<IP>:8002/docs`, the health route and a player sign-in all answer through the computer's Wi-Fi address; Expo's server (port 8081) answers at the same address; the test accounts and the scratch player sign in; the Windows network profile and firewall state were read (not changed).
- **Not tested:** anything from a real phone (no phone here): the QR scan, Expo Go on SDK 58, the firewall rule, haptics, the share sheet, the photo picker, native blur, push notifications. A connection made from the computer to its own address does not go through the firewall, so step 6 is untested.

## 11. Phone-only checks (the final real-phone test)

Everything below was tested on the web build and on the scratch backend. These are the things a browser cannot prove. Set up as in
sections 1 to 8 (scratch or test database only, never the dev database with real data), then tick each line and write down what you
saw if it differs. Push messages need a **development build** (not Expo Go) on a real device. Two phones are best: a player on one,
an owner or admin on the other. Scratch accounts (password `Player@1234`): player `ayesha.siddiqui@example.com`, owner
`o7@scratch.pk`, admin `admin@scratch.pk` (the admin code is in the server log in development).

### 11.1 Sign in
| Try | Expected |
|---|---|
| Log in with a wrong password | "Invalid email/phone or password." The same words for an unknown address. |
| Log in with the right details | Home opens. Closing and reopening the app keeps you signed in. |
| Log in as a suspended account (an admin suspends one first) | "Your account has been suspended." |
| Tap the eye on the password box | The password shows and hides. The tap is easy to hit with a thumb. |
| Turn the phone's text size up one step | Nothing is cut off on Log in. |

### 11.2 Booking and receipt upload
| Try | Expected |
|---|---|
| Search, open an arena, pick a time, Review booking, Pay by Bank transfer | The bank details show. The booking is held for a few minutes. |
| Choose a receipt photo from the gallery (the photo picker) | It shows "Receipt ready". A 6 MB photo says "That photo is too big." |
| Send receipt on a slow connection | A progress bar with a percent. Cancel opens the red "Stop uploading?" sheet with "Keep uploading". |
| Switch the phone to Airplane mode mid-upload | "Upload failed. Check your connection." with Try again and Choose another. |
| The owner approves it | The player's booking moves to Upcoming and a notice arrives. |
| Reschedule once, then cancel | The cancel sheet shows the real refund. The owner sees a pending refund. |

### 11.3 Offline banner
| Try | Expected |
|---|---|
| Turn Wi-Fi and data off on Home | A dark bar "You are offline. Showing what we saved earlier." Content stays. Nothing jumps. |
| Open a screen that was never opened | "No connection." with Try again, and the bar says only "You are offline." |
| Tap Pay, Cancel, Post or Join while offline | The button says "... needs a connection"; a tap gives a soft buzz and "No connection. Your change was not saved." |
| Turn the connection back on | A lime bar "Back online. Updating..." for about two seconds; open screens load again. |
| Settings, Accessibility, Reduce motion on | The bar appears and goes without sliding. |

### 11.4 Notifications and push (development build only)
| Try | Expected |
|---|---|
| Allow notifications when asked | Profile, Settings shows the push switches on. |
| Have the other phone book, cancel, join a match, send a complaint reply | A push arrives with the same words as the Notifications screen, with "₨" amounts and dates like "Tue 13 Oct". |
| Tap the push with the app closed | The app opens on the right screen (booking, match, complaint). |
| Admin phone: an owner submits an arena, a player sends a complaint | The admin gets "New arena waiting" and "New complaint" once each; the bell shows a number. |

### 11.5 Photo picker, share sheet, haptics
| Try | Expected |
|---|---|
| Profile, Personal information, change the photo | The gallery opens; the crop is square; a 6 MB photo is refused with a toast. |
| Booking confirmed, Add to calendar | The share sheet opens with a calendar file. |
| Tap buttons, tabs, switches, send a reply, mark a refund paid | A soft tap on press, a stronger buzz on success, a short buzz on an error. Phone on silent still buzzes. |

### 11.6 Near me
| Try | Expected |
|---|---|
| Home shows "Find arenas near you" once a day | "Use my location" asks for permission; "Not now" hides it until tomorrow (Karachi day). |
| Allow, then open Results | "Near me" sorting, distances in km. If the phone's location is off, a banner says so and Home uses the saved city. |

### 11.7 Keyboard on every form
Open each form, tap the box, type, and check the box and the button stay visible above the keyboard, and "Next" or "Done" does the
right thing: Log in, Create account, Verify code, Forgot and Reset password, Personal information, Change email, Change phone,
Change password, Promo code, Bank receipt, Write review, Report review, New complaint, Post a match, and on the admin phone the
Reject, Suspend arena and Suspend user sheets and the complaint Reply box. Also rotate the phone and try the small 360 px size if you
have one.

### 11.8 Admin on the phone
| Try | Expected |
|---|---|
| Log in as the admin | "Enter your code" screen; the 6-digit code arrives by email (in development: the server log). A wrong code shakes. After the right code you land on Overview with only four tabs: Overview, Approvals, Complaints, More. |
| Approvals: open an arena, Approve | Sheet "Approve ...?", then a toast; the tab number goes down; the owner gets a notice. |
| Reject with no text | The red button stays off until you type; the counter reads "n / 500". |
| Two admins act on the same arena | The second one sees the amber "Someone already handled this arena." |
| Complaints: reply | "n / 2000"; leaving with text asks "Leave without sending?"; after sending the reply shows with "Edit reply"; the player gets one notice. |
| More, Arenas: suspend a live arena | The sheet shows the real number of upcoming bookings that will be cancelled with a full refund. |
| More, Users: suspend and reactivate | The player is signed out at once; Log in says "Your account has been suspended." |
| More, Payments and refunds, Refunds: Mark as paid | The sheet shows player, booking and amount; the toast says the player has been told; a second tap does nothing. |
| More, Log out | Red sheet with "Stay"; after logging out you cannot go back into admin screens. |
| Sign in as a player and type an admin address (web build) | No admin screen shows. |

## 12. This round: Google button, field sizes, wrong email, smart search, assistant

Real email: `scripts/send_test_email.py` still says "Refused: email sending is not set up (EMAIL_PASSWORD is not set)."
Until you fill `backend\.env` (section 7, "Real email"), the codes are in the backend terminal (`code_dev_delivery`).

| Try | You should see |
|---|---|
| Log in, tap **Continue with Google** in Expo Go | The toast "Google sign-in is not available yet." The button stays. (Google needs a development build and the Google Cloud set-up: docs/BEFORE_GOING_LIVE.md, "Decide at the very end", item 5.) |
| Turn on airplane mode on Log in | The Google button says "Google needs a connection". |
| Create account | "Sign up with Google" at the top, then "or sign up with email" and the form. |
| Every text field with an icon (Log in, Create account, Forgot password, the new password step, Search) | 48 tall with a small 20px icon, empty or typed, tapped or not. No huge icons, nothing grows or shrinks. |
| Sign up with a mistyped email, then on the code screen tap **Wrong email? Use a different email** | Back on Create account: "Change your email, then continue. We will send a new code."; your name, email and phone are still there. Fix the email, tap Continue: a new code goes to the new address and signing in works. |
| Search: type a sentence and tap search | "We understood:" chips; tap x on a chip and the results change at once. Try these 10: |
| | 1. `futsal in gulberg tonight under 3000` |
| | 2. `cheap cricket lahore tomorrow evening` |
| | 3. `padel near me after 6pm` (turn location on) |
| | 4. `best badminton dha this weekend` |
| | 5. `5-a-side under 2,500 at 8` |
| | 6. `kal raat sasta futsal` |
| | 7. `table tennis below 2k morning` |
| | 8. `sab se acha squash karachi` |
| | 9. `padel in gulberg tonight under 1000` (nothing matches: "Remove price" and "Remove time") |
| | 10. the name of an arena, for example `goal line` ("Showing arenas that match ...") |
| Profile, Help and support | "Ask the ArenaHub assistant" card at the top. |
| The assistant: tap the four starter chips, then type these 12 | |
| | 1. `When is my next booking?` (your real booking, with Open booking) |
| | 2. `How do I cancel it?` (your booking's own refund rule) |
| | 3. `Can I move it?` |
| | 4. `Where is my refund?` (real amount and code, no days promised) |
| | 5. `How do I pay by bank transfer?` |
| | 6. `Why is my booking awaiting payment?` |
| | 7. `How many bookings do I have?` |
| | 8. `How do I join a match?` |
| | 9. `meri agli booking kab hai` (Roman Urdu) |
| | 10. `paise wapas kab milenge` (Roman Urdu) |
| | 11. `How do I delete my account?` |
| | 12. `Can you change my arena owner?` ("I am not sure about that one. ..." with New complaint) |
| Airplane mode in the assistant | The box says "Needs a connection"; the banner says you are offline. |

## 13. How to reach each state by using the apps (no seeding)

Accounts: the dev accounts of section 7 (player, owner, admin). Create more by signing up (a second player, a second owner). Every
step below is done in the apps themselves; nothing is put into the database by hand. Web: owner `http://localhost:3000/login`, admin
`http://localhost:3000/admin/login`. Phone: the player app. The admin phone screens: sign in on the phone with the admin account.

| State | Steps (who, where) |
|---|---|
| A pending arena to approve | Owner (web) > Arenas > Add arena > fill the form > Submit. Admin (web) > Approvals shows it; the admin gets "New arena waiting". |
| An approved, live arena | Admin > Approvals > Approve. Owner gets "Your arena is approved". Add a court, then **Slots > Generate** so there is something to book. |
| A rejected arena | Admin > Approvals > Reject with a reason. Owner > Arenas shows "Not approved" and the reason; Resubmit puts it back in the queue. |
| A suspended arena | Admin > Arenas > open the arena > Suspend (with a reason). Players stop seeing it; its upcoming paid bookings are cancelled with a full refund (the sheet shows how many first). Reactivate brings it back. |
| A suspended user or owner | Admin > Players (or Owners) > Suspend. That person is signed out at once; Log in says "Your account has been suspended." Reactivate undoes it. |
| A complaint with a reply | Player (phone) > Profile > Help and support > New complaint > send. Admin (web) > Complaints > open > write a reply > Send. The player gets "We replied to your complaint" and the complaint shows "Reply received". |
| A booking waiting for a receipt | Player > open an arena > pick a court and a time > Pay > Bank transfer. The bank screen (transfer details, no receipt yet) is this state; the booking is "Awaiting payment". |
| A booking waiting for the owner to check the receipt | On that bank screen, upload a photo of a receipt. The booking is "Awaiting approval". Owner (web) > Bookings shows "Receipt to check". |
| A receipt rejected | Owner > Bookings > the booking > Reject receipt with a reason. Player gets "Receipt not accepted" and the failed screen shows the reason. |
| A confirmed booking | Owner > Approve receipt. Player gets "Booking confirmed"; the owner "New booking received". |
| A refund waiting | Player cancels a paid, confirmed booking (Bookings > the booking > Cancel booking; the sheet shows how much comes back). Owner (web) > Refunds shows "A refund is waiting for you"; the player's Payment history says "waiting". |
| A refund marked paid | Owner > Refunds > Mark as paid (or admin phone > More > Payments and refunds > Refunds > Mark as paid). Player gets "Refund completed". |
| An expired hold (payment window ended) | Make a booking and leave it unpaid, then run `uv run python scripts/run_sweeps.py --advance-hours 25` in `backend` (development only). The booking becomes Cancelled and its time is free again. Leaving the bank screen with Back frees the time at once without waiting. |
| A completed game, "Rate your game", the 24 h and 1 h reminders | Make a confirmed booking, then `scripts/run_sweeps.py --advance-hours N` with N past the game's end (completed, Rate your last game) or inside 24 h or 1 h before it starts (reminders). |
| A discount code used | Owner > Payments > Discount codes > add a code. Player > Pay > enter the code > Apply (the price drops). After the booking, the owner's list shows the use; a code used up says "This code has been used up." |
| A match joined and left | Player A (confirmed booking) > Play > Post a match. Player B (second account) > Play > Open matches > Join match; then My matches > Leave. A gets "A player joined your match" and "A player left your match"; a full match gives "Your match is full"; A cancelling gives B "A match was cancelled". |
| An unpaid booking reminder | Owner (web) > Bookings > a booking waiting for payment > Remind. Player gets "Your booking is waiting for payment". |
| A review | Player > Bookings > Past > Rate this game. Owner gets "New review" and can answer it. |

**Notice types:** all 30 have a sender (checked in the code). 27 are reached with the steps above. Three need a payment gateway, which is a deferred item, so they cannot be reached in the apps today: "Payment failed" (a card or wallet payment that fails), "Balance paid" (paying the balance through a gateway) and "Your refund is being handled by our team" (a gateway refund that keeps failing). The tests reach them.
