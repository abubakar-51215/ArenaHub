# Frame briefs — A to F

Design briefs for the screens/blocks not built in this pass (per instruction: backend first,
no new screens). Each cites the existing prototype frame if one exists, the existing
components to reuse, every field and state, what each button does, the route it calls, and
the exact wording needed. Items without an existing prototype frame are marked so — nothing
below invents a layout where none was drawn.

---

## A. Owner: blocked whole days (holidays / maintenance)

**No existing prototype frame.** The per-slot block/unblock UI already exists and needs no
brief — `components/owner/slots-dialog.tsx` already has a working "Block" / "Unblock" toggle
per slot (sets status to `maintenance`). This brief is only for the **whole-day** blocked-dates
list, which has a complete backend (`POST/GET/DELETE /owner/arenas/{id}/blocked-dates`) but no
web UI at all.

**Who sees it:** arena owner, on that arena's management page (natural home: a new tab/section
on the existing arena detail/edit view, or a row on `app/owner/arenas/page.tsx`'s per-arena
card — reuse whichever the owner's arena detail screen already uses for secondary lists, e.g.
the same list-with-delete-row pattern as discount codes on the arena form).

**Fields:**
- A date picker (date only, no time) + an optional reason text field (≤255 chars).
- The list of currently blocked dates: date, reason (or "No reason given"), a delete ("Unblock")
  button per row.

**States:**
- *Loading*: skeleton rows, same as other owner lists.
- *Empty*: "No blocked dates yet."
- *Error*: "Could not load blocked dates." + Try again (existing `ah-card-error` pattern).
- *Add refused — has bookings*: the API answers 409 with
  `"This date has {N} active booking(s). Cancel them first, then block the date."` — show this
  verbatim as the field-level error under the date picker. Do not build a "cancel these
  bookings" shortcut; the owner goes to the calendar themselves.
- *Add refused — duplicate*: 409 `"That date is already blocked."`
- *Add success*: the new row appears at the top of the list; clear the form.
- *Unblock confirm*: a plain `confirm()` or a small inline "Unblock?" — this is a reversible,
  low-stakes action (unlike suspend/delete), a confirm dialog is optional.

**Routes:**
- `POST /owner/arenas/{arena_id}/blocked-dates` — `{blocked_date, reason?}` → 201 or 409.
- `GET /owner/arenas/{arena_id}/blocked-dates` — list.
- `DELETE /owner/arenas/{arena_id}/blocked-dates/{blocked_id}` — unblock.

**Wording needed (new, for approval):** none beyond the two 409 messages above, which already
exist in the backend and should be shown as-is, not reworded.

---

## B. Phone: booking pass with QR ("View pass")

**No existing prototype frame.** `MOBILE_REQUIREMENTS.md` item 74 already lists "View pass" as
not built, no frame. Backend is done this pass: `GET /bookings/{booking_id}/pass` returns
`{booking_id, booking_code, arena_name, court_name, booking_date, start_time, end_time, status,
qr_code_url}`, only for the player who owns a **confirmed** booking (a pending or cancelled one
answers 422; someone else's answers 404, same as not-found). The QR image itself already exists
at confirmation time (`qr_code_url`) and now carries a random, unguessable token — not the
booking's own id — that only the server can resolve back to a booking.

**Who sees it:** the player, from the booking detail screen (`app/booking/detail/[groupId].tsx`)
— a new "View pass" row/button, shown only when the booking's status is `confirmed`.

**Open question, not decided here:** a multi-hour booking group has one `qr_code_url` *per
hour* (existing design, unchanged). "View pass" on the group detail screen needs to pick one —
recommend showing the first hour's pass (check-in normally happens once, at the start), but this
is a product call, not made here.

**Fields/content:** arena name, court name, date, time range, the QR image itself (full-screen
or a prominent card), the booking code (as text, in case the QR can't be scanned).

**States:**
- *Loading*: skeleton, matches other detail screens.
- *Not confirmed yet*: don't show the "View pass" row at all (the route would 422 anyway).
- *Error*: "Could not load your pass." + Try again.

**What the button does:** navigates to a new pass view (or expands a sheet) calling
`GET /bookings/{booking_id}/pass` and rendering `qr_code_url` as an image.

**Owner verify route:** checked — **it does not exist.** No owner-facing endpoint consumes a
scanned pass today. A repository lookup (`booking_repo.get_booking_by_pass_token`) exists and
is tested, so the claim "only the arena owner's system can verify a pass" is true in principle,
but nothing calls it yet. Building a scan screen or a verify endpoint was explicitly out of
scope for this pass.

**Wording needed:** "View pass" (button label) — new, for approval. Everything else reuses
existing booking-detail vocabulary (arena/court/date/time already shown elsewhere on that
screen).

---

## C. Owner: arena photos as file uploads, plus an optional map picker

**No existing prototype frame for the photo control specifically** (the owner prototype shows
"Change photo" / "Replace logo" buttons in a profile context, not the arena form). **Not built
this pass** — no reusable file-upload component exists anywhere in the web app yet (checked:
there is none), so per instruction this stays a brief rather than new layout.

Backend is already there and needs no change: `POST /uploads/image?folder=arenas` (owner/admin
only) accepts JPG, PNG or WebP up to 5 MB and returns `{url}`; the arena form already sends
`images: string[]` on create/update. Latitude/longitude are now optional end to end (this pass's
migration) and the form fields are already un-required — no brief needed for that part, it's
built.

**Who sees it:** arena owner, in `components/owner/arena-form.tsx`, replacing the current
newline-separated URL textarea for `images`.

**Fields:**
- A file picker (accept `.jpg,.jpeg,.png,.webp`), multiple files.
- Thumbnails of the already-chosen/already-saved photos, each with a small remove (×) button.
- A visible cap, e.g. "6 of 6 photos" once at the limit (schema allows up to 20 — pick a lower
  practical UI cap and confirm with the owner before building).

**States:**
- *Uploading*: a spinner on the thumbnail being uploaded; disable Save while any upload is in
  flight.
- *Upload error*: the server's own message — "Unsupported image type. Use JPEG, PNG, or WebP."
  or "Image is too large (max 5 MB)." — shown under the picker, not a toast (consistent with
  the rest of the form's inline errors).
- *Remove*: optimistic — the thumbnail disappears immediately; the URL is dropped from the
  `images` array sent on Save (existing `update_arena` logic already deletes the file for a
  removed image — no backend change needed).

**What each control does:** choosing a file calls `POST /uploads/image?folder=arenas`
immediately (not deferred to form Save — matches the receipt-upload pattern the mobile app
already uses), appends the returned `url` to local `images` state; the × button removes that
URL from local state only (the actual delete happens server-side on Save, as today).

**Wording needed (new, for approval):** none — reuse the backend's own error text verbatim.

**Optional: "pick the spot on a map" control.** Not built, not in any prototype. Would replace
typing latitude/longitude by hand with a tap-to-drop-a-pin map (Leaflet, per
`PROJECT_GUIDELINES.md` deviation #8 — OpenStreetMap is already the project's map choice for
web). Brief only: a small embedded Leaflet map defaulting to the arena's city centre (or Lahore
if none), a single draggable pin, with the existing lat/lng text inputs kept alongside and kept
in sync both ways (typing updates the pin; dragging the pin updates the fields) — satisfies
"keep the latitude and longitude inputs in the form." This is a genuinely new dependency
(Leaflet isn't in `frontend/web`'s `package.json` yet) and a larger task than the photo control;
flagging it as its own follow-up rather than bundling it in.

---

## D. Admin: force a 100% refund (force majeure)

**No existing web prototype frame** for this specific action (the mobile admin prototype has an
analogous "Suspend sheet" — reason textarea + a destructive confirm + a "Stay" cancel — which is
the right *pattern* to copy, just not this *screen*). Backend is done this pass:
`POST /admin/bookings/{booking_id}/force-refund` now requires `{reason}` (1–500 chars), refunds
100% once, audits the admin and the reason (`payment.force_refund`), frees the slot, sends the
existing `refund_initiated` notice, and refuses a second attempt on an already-fully-refunded
payment with `"This payment has already been fully refunded."`

**Who sees it:** admin, on a booking's detail view (wherever `GET /admin/bookings` already links
to one, or a new row if the admin bookings list has no detail view yet — check
`app/admin/(dashboard)/bookings/page.tsx` before building).

**Reuse directly:** `components/admin/arena-actions.tsx`'s `ArenaActionDialog` is *exactly* this
shape already (title, an effect description, a required reason textarea with a character
counter, a confirm button, a cancel). Generalize it or copy its pattern for a
`ForceRefundDialog` — do not design a new dialog shell.

**Fields:** the reason textarea (required, 1–500 chars, same validation as
`ArenaModerationRequest`/`RejectRequest` elsewhere).

**States:**
- *Confirm*: "Force a full refund?" / effect text: "This refunds 100% of what was paid,
  regardless of the arena's cancellation policy, and frees the time slot. The player is
  notified." (new wording, for approval — mirrors the existing suspend-dialog's effect-text
  style).
- *Already refunded*: disable/hide the button once the booking's payment is already fully
  refunded (the API would 409 anyway; checking first avoids a dead click — the booking detail
  response would need a flag for this, e.g. reusing `refund_eligible`/checking payment status
  client-side).
- *Success*: toast "Refund forced." (matches the API's own message) and refresh the row/detail.
- *Error*: the API's own message shown inline in the dialog (same pattern as
  `ArenaActionDialog`).

**What the button does:** opens the dialog; on confirm, calls the route above with the typed
reason.

**Wording needed (new, for approval):** "Force a full refund?" (dialog title) and the effect
sentence above.

---

## E. Phone: "Get Directions" on the arena page

**No existing prototype frame** — G3's decisions explicitly dropped the Location/Get Directions
block pending a frame (`MOBILE_REQUIREMENTS.md`, G3 notes: "the user will draw a Location block
frame later"). Backend needs no change: `GET /arenas/{id}` already returns `address`, `city`,
`area`, `latitude`, `longitude` (the last two nullable, per this pass's migration).

**Who sees it:** player, on the arena detail screen (`app/arena/[id].tsx`), as a button/row in
the location area that G3 dropped — this brief is for that block's minimal version (just the
button), not the whole dropped block (map preview, "You might also like", etc., which stay
later work as G3 decided).

**What the button does, exactly:**
1. If the arena has both `latitude` and `longitude`: open
   `https://www.google.com/maps/search/?api=1&query={lat},{lon}` (Google's documented universal
   maps-search URL scheme — works in a browser and hands off to a native maps app on both
   platforms; no API key needed for this URL form).
2. Else (no coordinates): open
   `https://www.google.com/maps/search/?api=1&query={encoded address, area, city}` — built from
   whichever of `address`/`area`/`city` are non-empty, joined with `", "`.
3. Safety: the query parameter is built with `encodeURIComponent` (or `URLSearchParams`) on each
   piece *before* joining — never string-concatenate raw address text into the URL. The scheme
   and host are hardcoded (`https://www.google.com/maps/search/`); nothing user-supplied ever
   becomes the scheme or host. Open via `Linking.openURL` (Expo) — never a webview, never
   `dangerouslySetInnerHTML`-style injection.

**States:** none beyond the button itself — `Linking.openURL` either succeeds (hands off to the
OS) or the Promise rejects (no maps app / no browser at all, extremely rare); on rejection, a
plain toast "Could not open maps" is enough, no dedicated error state.

**Wording needed (new, for approval):** "Get Directions" (button label, matches the dropped G3
block's original name) and "Could not open maps" (fallback toast).

---

## F. Phone: "Near me"

**Existing prototype frames** — `design/prototypes/arena-hub-player-app-play.html` already has
these, under its "Near me and Matchmaking" screen set, with exact approved wording:
- `S['Near me prompt']`: title "Find arenas near you"; body "Allow your location to see how far
  each arena is and sort by distance. We only use it while you use the app."; buttons "Use my
  location" / "Not now".
- `S['Location denied']`: inline banner "Location is off. Showing arenas in Lahore." with a
  "Turn on" link, shown above results that have no distance.
- `S['Location unavailable']`: banner "We could not find your location. Showing arenas in
  Lahore. You can try again from Filters."
- `S['Filters near me']`: sort chips "Best" / "Near me" / "Price" / "Newest".
- `S['Results with distance']`: a header like "8 arenas within 3 km" above the list.

Backend is fully built and tested this pass (it already was, mostly — this pass added the
"arena with no coordinates sorts last, never dropped" guarantee and fixed a crash):
`GET /arenas?lat=&lon=&radius_km=&sort=near` returns `distance_km` per item (haversine, null for
an arena with no pin, sorted last under `sort=near`); the player's position is never stored or
logged, exactly as `arena-hub-player-app-play.html`'s "We only use it while you use the app."
already promises. Smart search already understands "near me"/"nearby" (`ai/parser.py`), setting
`parsed.near = true` — the app already has a clear, explicit signal to prompt for location
rather than guessing a city, no change needed there either.

**Who sees it:** player, on Search/Home (`app/(tabs)/index.tsx`, the search results screen) and
the existing Filters sheet.

**Correction (2026-10-22): nothing is missing here — this was fully built already.** An earlier
pass of this brief said the sort chip and permission flow still needed building; re-checking the
actual mobile code found all of it already in place:
- `store/location.ts` — the full Zustand location store (`detect()`, three-state `status`,
  session-only, never persisted).
- `app/filters.tsx` — the "Near me" sort chip, gated on `coords` via `needLocation()`.
- `app/(tabs)/results.tsx` — all three banner states (prompt/denied/unavailable+outside), wording
  matching this brief's own cited frames exactly, plus the sort-chip row.
- `services/arenas.ts` / `hooks/useArenas.ts` — `lat`/`lon`/`radius_km`/`sort=near` already
  threaded to `GET /arenas`, matching the backend's existing query params.
- `components/venue.tsx`'s `Where` sub-component — distance on cards (`formatKm`).
- `app.json`'s `expo-location` plugin config — the iOS/Android permission string, updated
  2026-10-22 to: "ArenaHub uses your location to show how far arenas are and sort results by
  distance. Your location is never stored or shared." (previously a shorter line that didn't
  carry the privacy assurance the rest of this feature already promises).

**States:** prompt, denied, unavailable/outside — all already implemented.

No build work remains for this item.

---

## Summary: what to draw

Frames still needed, in priority order matching how often a player/owner would hit the gap:
**B** (view pass), **E** (get directions block), **D** (force-refund dialog, admin-only, rare),
**A** (blocked-dates list, owner-only, rare), and **C** (owner photo upload, plus the optional
"use my current location" button on the arena form). **F** (near-me) needed no frame — it was
already fully built; see the correction in its section above.
