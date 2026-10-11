# Run ArenaHub on your real phone

Simple steps, in order. Tested from the computer as far as possible (see "What was and was not tested" at the end). Do the steps on the Windows computer where the project is.

## 1. What to install on the phone

- Install **Expo Go** (Android: Play Store; iPhone: App Store).
- The app uses **Expo SDK 54** (`"expo": "~54.0.x"` in `frontend/mobile/package.json`). Expo Go must support SDK 54.
- If Expo Go says "Project is incompatible with this version of Expo Go" (the store version is newer than SDK 54):
  - **Android:** open https://expo.dev/go, choose SDK 54 and install that Expo Go file (an APK). Remove the store version first.
  - **iPhone:** the App Store only gives the newest Expo Go and you cannot install an older one. Tell me and I will upgrade the project to the newer SDK, or we make a development build.
- Expo Go cannot show push notifications and shows its own splash, not the ArenaHub one. The animated ArenaHub splash inside the app still plays.

## 2. Same Wi-Fi, and the computer's address

- The phone and the computer must be on the **same Wi-Fi**. A guest network or "AP isolation" blocks it.
- On the computer open PowerShell and run: `ipconfig`
- Find the block "Wireless LAN adapter Wi-Fi" and write down **IPv4 Address**. On this computer it is `192.168.10.11` (yours may change; check again if the router restarts). Ignore the "Local Area Connection*" blocks (hotspot).
- Below, `<IP>` means that address.

## 3. Tell the app where the backend is

- File: `frontend/mobile/.env`
- Setting name: `EXPO_PUBLIC_API_URL`
- It is now `EXPO_PUBLIC_API_URL=http://localhost:8000`. **`localhost` does not work on a phone** (on the phone it means the phone itself).
- Change it to `EXPO_PUBLIC_API_URL=http://<IP>:8000` (for example `http://192.168.10.11:8000`). No slash at the end and no `/api/v1`.
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
  3. `npx expo start --tunnel` is a last resort. It needs one extra install the first time (Expo asks to install `@expo/ngrok`; answer yes). **The tunnel only carries the app code (Metro). It does not carry the backend.** The phone still has to reach the backend, so with a tunnel you also need a tunnel for port 8000 (for example `ngrok http 8000`) and `EXPO_PUBLIC_API_URL` set to that https address. The normal same-Wi-Fi way is simpler.

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

**Admin code in dev:** an admin sign-in sends a 6-digit code by email. In dev there is no mail server, so the code is printed in the backend terminal (the window where `uvicorn` runs) as a line like `otp_dev_delivery code=123456 destination=admin@arenahub.pk purpose=admin_login`. Type those six digits. The code works for 10 minutes. (The admin screen on the phone is temporary; admin work is on the web at http://localhost:3000/admin/login.)

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

- Tested from the computer: the backend starts with `--host 0.0.0.0` and `http://192.168.10.11:8002/docs`, the health route and a player sign-in all answer through the computer's Wi-Fi address; Expo's server (port 8081) answers at the same address; the test accounts and the scratch player sign in; the Windows network profile and firewall state were read (not changed).
- **Not tested:** anything from a real phone (no phone here): the QR scan, Expo Go on SDK 54, the firewall rule, haptics, the share sheet, the photo picker, native blur, push notifications. A connection made from the computer to its own address does not go through the firewall, so step 6 is untested.
