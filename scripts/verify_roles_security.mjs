// Roles and privacy spot-checks against the running scratch backend (plain HTTP, no browser):
// each role is refused on the other roles' routes, a second player/owner cannot read or touch the
// first one's booking/arena/payment, receipts and the QR are not on a public address, a code works once,
// the near-me position never reaches the log, and the rate limit still answers 429.
// The full per-route matrix is the backend test tests/modules/test_authorization_matrix.py; this checks
// the same rules on the real running stack. Scratch database, fake @example.com accounts only.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_roles_security.mjs

import fs from "node:fs";
import {
  API, LOG, PASSWORD, adminToken, api, fixture, freeSlots, lastOtpFor, registerAndVerify, sleep,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "sec1";
const rows = [];
const check = (item, ok, note = "") => {
  rows.push({ item, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${item}${note ? " -- " + note : ""}`);
};
const status = async (method, p, token, body) => {
  const r = await api(p, token, { method, raw: true, ...(body ? { body: JSON.stringify(body) } : {}) });
  return r.status;
};

const f = await fixture(TAG);
const WEBAPI = API.replace("/api/v1", "");
const otherOwnerTok = await registerAndVerify(`${TAG}-owner2@example.com`, "owner", "Owner2");
const otherPlayerTok = await registerAndVerify(`${TAG}-player2@example.com`, "player", "Player2");
const slots = await freeSlots(f.courtId, f.date, f.playerTok);
const made = await api("/bookings", f.playerTok, {
  method: "POST",
  body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[0].id], payment_type: "advance" }),
});
const group = made.booking_group_id;
const bookingId = made.bookings[0].id;
const pay = await api("/payments/initiate", f.playerTok, { method: "POST", body: JSON.stringify({ booking_group_id: group, payment_method: "card" }) });
await api(`/payments/${pay.payment.id}/simulate-confirm?success=true`, f.playerTok, { method: "POST", body: "{}" });
const bank = await api("/payments/initiate", f.playerTok, {
  method: "POST",
  body: JSON.stringify({ booking_group_id: (await api("/bookings", f.playerTok, { method: "POST", body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[1].id], payment_type: "advance" }) })).booking_group_id, payment_method: "bank_transfer" }),
}).catch(() => null);

// ---- no token: refused everywhere that needs a person ----
for (const [m, p] of [["GET", "/users/me"], ["GET", "/bookings/mine"], ["GET", "/owner/arenas"], ["GET", "/admin/users"], ["GET", `/bookings/${bookingId}/pass`], ["POST", "/payments/initiate-balance"]]) {
  const s = await status(m, p, null, m === "POST" ? {} : undefined);
  check(`No token: ${m} ${p} is refused`, s === 401, `status ${s}`);
}

// ---- wrong role ----
const adminRoutes = [["GET", "/admin/users"], ["GET", "/admin/payments"], ["GET", "/admin/arenas"], ["GET", "/admin/bookings"], ["GET", "/admin/complaints"], ["POST", `/admin/arenas/${f.arenaId}/approve`], ["POST", `/admin/bookings/${bookingId}/force-refund`]];
for (const [who, tok] of [["player", f.playerTok], ["owner", f.ownerTok]]) {
  for (const [m, p] of adminRoutes) {
    const s = await status(m, p, tok, m === "POST" ? { reason: "x" } : undefined);
    check(`${who} on admin route ${m} ${p.replace(/[0-9a-f-]{36}/g, ":id")} is refused`, s === 403, `status ${s}`);
  }
}
for (const [who, tok] of [["player", f.playerTok], ["admin", f.adminTok]]) {
  for (const p of ["/owner/arenas", "/owner/dashboard/summary", `/owner/arenas/${f.arenaId}/bank-details`, "/owner/refunds"]) {
    const s = await status("GET", p, tok);
    check(`${who} on owner route ${p.replace(/[0-9a-f-]{36}/g, ":id")} is refused`, s === 403, `status ${s}`);
  }
}
for (const [who, tok] of [["owner", f.ownerTok], ["admin", f.adminTok]]) {
  const s = await status("POST", "/bookings", tok, { court_id: f.courtId, slot_ids: [slots[2].id], payment_type: "advance" });
  check(`${who} cannot make a player booking`, s === 403, `status ${s}`);
}

// ---- another person's booking, payment, arena ----
for (const [m, p, body] of [
  ["GET", `/bookings/group/${group}`], ["GET", `/bookings/${bookingId}/pass`], ["POST", `/bookings/group/${group}/cancel`, {}],
  ["POST", "/payments/initiate-balance", { booking_group_id: group, payment_method: "bank_transfer" }],
  ["POST", "/payments/initiate", { booking_group_id: group, payment_method: "card" }],
  ["POST", `/payments/${pay.payment.id}/receipt`, { receipt_proof_url: "/uploads/receipts/x.jpg" }],
]) {
  const s = await status(m, p, otherPlayerTok, body);
  check(`Another player: ${m} ${p.replace(/[0-9a-f-]{36}/g, ":id")} gets the same answer as a missing one`, s === 404, `status ${s}`);
}
const ownerOnly = [["GET", `/owner/arenas/${f.arenaId}`], ["GET", `/owner/arenas/${f.arenaId}/bookings`], ["GET", `/owner/arenas/${f.arenaId}/bank-details`], ["GET", `/owner/arenas/${f.arenaId}/courts`], ["POST", `/owner/payments/${pay.payment.id}/approve`], ["GET", `/owner/courts/${f.courtId}`]];
for (const [m, p] of ownerOnly) {
  const s = await status(m, p, otherOwnerTok, m === "POST" ? {} : undefined);
  check(`Another owner: ${m} ${p.replace(/[0-9a-f-]{36}/g, ":id")} is refused as a missing one`, s === 404, `status ${s}`);
}
const theirs = await api("/owner/arenas", otherOwnerTok);
check("An owner's arena list holds none of another owner's arenas", !(theirs.items || theirs).some((a) => a.id === f.arenaId));
const dash = await api("/owner/dashboard/bookings", otherOwnerTok).catch(() => ({ items: [] }));
check("An owner's bookings table holds none of another owner's bookings", !JSON.stringify(dash).includes(group));

// ---- the owner can read, the booking's own player can read ----
check("The booking's own player can read it", (await status("GET", `/bookings/group/${group}`, f.playerTok)) === 200);
check("The arena's own owner can read the arena", (await status("GET", `/owner/arenas/${f.arenaId}`, f.ownerTok)) === 200);

// ---- receipts and QR are not on a public address ----
const receiptUpload = await (async () => {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "r.png");
  const r = await fetch(API + "/uploads/image?folder=receipts", { method: "POST", headers: { Authorization: `Bearer ${f.playerTok}` }, body: form });
  return (await r.json()).data?.url;
})();
const direct = receiptUpload ? await fetch(WEBAPI + (receiptUpload.startsWith("http") ? new URL(receiptUpload).pathname : receiptUpload)) : { status: 0 };
check("A receipt photo cannot be opened from the public uploads address", direct.status === 404 || direct.status === 401 || direct.status === 403, `status ${direct.status}`);
const passAnon = await fetch(`${API}/bookings/${bookingId}/pass`);
check("The booking pass (QR) cannot be read without signing in", passAnon.status === 401, `status ${passAnon.status}`);
const pass = await api(`/bookings/${bookingId}/pass`, f.playerTok);
check("The QR comes back inside the pass, not as a file address", String(pass.qr_code_url || "").startsWith("data:image/png;base64,"));
for (const dir of ["qr", "qrs", "passes"]) {
  const r = await fetch(`${WEBAPI}/uploads/${dir}/${bookingId}.png`);
  check(`No public /uploads/${dir}/ file for the QR`, r.status === 404, `status ${r.status}`);
}

// ---- a code works once ----
const email = `${TAG}-resetme@example.com`;
await registerAndVerify(email, "player", "ResetMe");
await sleep(61000);
await api("/auth/forgot-password", null, { method: "POST", body: JSON.stringify({ email }) });
await sleep(500);
const code = lastOtpFor(email);
const first = await api("/auth/reset-password", null, { method: "POST", raw: true, body: JSON.stringify({ email, otp: code, new_password: "Verify@54321" }) });
const second = await api("/auth/reset-password", null, { method: "POST", raw: true, body: JSON.stringify({ email, otp: code, new_password: "Verify@99999" }) });
check("A reset code works once", first.status === 200 && second.status >= 400, `first ${first.status}, second ${second.status}`);
check("The same code is refused when used a second time with a clear message", second.status === 400 || second.status === 422 || second.status === 429, JSON.stringify(second.body).slice(0, 100));

// ---- the near-me position never reaches the log ----
const marks = ["31.987654", "74.123987"];
await api(`/arenas?sort=near&lat=${marks[0]}&lon=${marks[1]}&radius_km=10`, f.playerTok);
await api(`/arenas?sort=near&lat=${marks[0]}&lon=${marks[1]}&radius_km=9999`, f.playerTok, { raw: true });
await api(`/arenas?lat=${marks[0]}&lon=notanumber`, f.playerTok, { raw: true });
await sleep(800);
const log = fs.readFileSync(LOG, "utf-8");
check("The near-me latitude and longitude do not appear in the backend log", !marks.some((m) => log.includes(m)), `searched ${log.length} bytes`);

// ---- the rate limit still answers 429 (last: it uses up the sign-in budget) ----
let limited = 0;
for (let i = 0; i < 30; i++) {
  const s = await status("POST", "/auth/login", null, { email: `${TAG}-nobody@example.com`, password: "Wrong@12345" });
  if (s === 429) {
    limited++;
    break;
  }
}
check("The sign-in rate limit still answers 429 when pushed", limited > 0);
await sleep(65000);

const failed = rows.filter((r) => !r.ok);
console.log(`\nchecks: ${rows.length}, failed: ${failed.length}`);
fs.writeFileSync("scripts/.ui_verify/_roles_security_results.json", JSON.stringify(rows, null, 2));
process.exit(failed.length ? 1 : 0);
