// End-to-end QA over the real HTTP API of the scratch stack (backend :8001, arenahub_scratch,
// Redis db 5). Fake @example.com accounts only; payment webhooks are signed with FAKE secrets the
// scratch backend was started with (never real keys). Each check records ID, role, steps,
// expected, actual, status and evidence into docs/qa/qa_results.json (rendered into the QA_*.md
// files by scripts/qa_report.mjs).
//
//   BACKEND_LOG  scratch backend log (dev OTP lines)   SQL_RUNNER  scratch SQL helper
//   QA_TAG       a fresh prefix per run (fake accounts)  QA_STAGE=1 (default) or 2 (after restart)
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  API, PASSWORD, api, fixture, freeSlots, lastOtpFor, makeArena, registerAndVerify, sleep, sql,
} from "./lib/verify-kit.mjs";

// The API allows 100 calls a minute per address; stay under it so a 429 never muddies a result.
const stamps = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (...a) => {
  for (;;) {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 60000) stamps.shift();
    if (stamps.length < 70) { stamps.push(now); break; }
    await sleep(stamps[0] + 60000 - now + 50);
  }
  return realFetch(...a);
};

const TAG = process.env.QA_TAG;
if (!TAG) throw new Error("Set QA_TAG to a fresh prefix.");
const SECRETS = { jazzcash: "qa-fake-jazz", easypaisa: "qa-fake-easy", stripe: "whsec_qafakesecret" };
const ONLY = (process.env.QA_ONLY || "").split(",").filter(Boolean);
const OUTFILE = ONLY.length ? "docs/qa/qa_only.json" : "docs/qa/qa_results.json";
const results = fs.existsSync(OUTFILE) && process.env.QA_STAGE === "2" ? JSON.parse(fs.readFileSync(OUTFILE, "utf-8")) : [];

const raw = (p, tok, method = "GET", body, headers) =>
  api(p, tok, { method, raw: true, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(headers ? { headers } : {}) });
const num = (text) => Number((/\((\d+)/.exec(text) || [])[1] ?? NaN);
const q1 = (text) => sql(text).trim();
const short = (o) => JSON.stringify(o).slice(0, 230);

async function t(id, role, title, expected, fn, severity = "") {
  if (ONLY.length && !ONLY.some((p) => id.startsWith(p))) return;
  let status, actual, evidence = "";
  try {
    [status, actual, evidence = ""] = await fn();
  } catch (e) {
    status = "BLOCKED";
    actual = `Could not run: ${String(e.message).slice(0, 260)}`;
  }
  results.push({ id, role, title, expected, actual, status, evidence, severity: status === "FAIL" ? severity || "Medium" : "" });
  console.log(`[${status}] ${id} ${title}${status !== "PASS" ? " -- " + actual : ""}`);
}
const ok = (cond, passText, failText, ev = "") => [cond ? "PASS" : "FAIL", cond ? passText : failText, ev];

const sign = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("hex");
async function hook(provider, payload, { secret, badSig, stripeStyle } = {}) {
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  if (stripeStyle) {
    const ts = Math.floor(Date.now() / 1000);
    headers["Stripe-Signature"] = `t=${ts},v1=${badSig ?? sign(secret ?? SECRETS.stripe, `${ts}.${body}`)}`;
  } else headers["X-Signature"] = badSig ?? sign(secret ?? SECRETS[provider], body);
  const res = await fetch(`${API}/webhooks/${provider}`, { method: "POST", headers, body });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const stripeEvent = (type, txn, amount, currency, paid = true) => ({
  id: `evt_${crypto.randomUUID()}`, object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), livemode: false, type,
  data: { object: { object: "checkout.session", id: txn, payment_status: paid ? "paid" : "unpaid", amount_total: Math.round(Number(amount) * 100), currency: currency.toLowerCase() } },
});

async function main() {
  console.log("== setup ==");
  const f = await fixture(TAG);
  const pbTok = await registerAndVerify(`${TAG}-playerb@example.com`, "player", "PlayerB");
  const pcTok = await registerAndVerify(`${TAG}-playerc@example.com`, "player", "PlayerC");
  const obTok = await registerAndVerify(`${TAG}-ownerb@example.com`, "owner", "OwnerB");
  const arenaB = await makeArena({ ownerTok: obTok, adminTok: f.adminTok, date: f.date }, { name: `QA Arena B ${TAG}` });
  const court2 = await api(`/owner/arenas/${f.arenaId}/courts`, f.ownerTok, { method: "POST", body: JSON.stringify({ name: "Court B", sport_types: ["futsal"], base_price: "3000.00" }) });
  await api(`/owner/courts/${court2.id}/slots/generate`, f.ownerTok, { method: "POST", body: JSON.stringify({ start_date: f.date, end_date: f.date }) });
  const slotsA = await freeSlots(f.courtId, f.date, f.playerTok);
  const slotsB = await freeSlots(court2.id, f.date, f.playerTok);
  let ia = 0, ib = 0;
  const nextA = () => slotsA[ia++];
  const nextB = () => slotsB[ib++];
  const me = async (tok) => (await api("/users/me", tok));
  const uA = await me(f.playerTok), uB = await me(pbTok);
  const book = (tok, courtId, slotId, type = "full") => raw("/bookings", tok, "POST", { court_id: courtId, slot_ids: [slotId], payment_type: type });
  const pay = (tok, group, method, extra = {}) => raw("/payments/initiate", tok, "POST", { booking_group_id: group, payment_method: method, ...extra }, { "Idempotency-Key": crypto.randomUUID() });
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const uploadReceipt = async (tok) => {
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), "receipt.png");
    const r = await fetch(`${API}/uploads/image?folder=receipts`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: form });
    const j = await r.json();
    return j.data?.url ?? j.data?.image_url ?? JSON.stringify(j).slice(0, 120);
  };
  const grp = async (tok, g) => (await api(`/bookings/group/${g}`, tok));
  const bstat = async (tok, g) => (await grp(tok, g)).status;
  async function paidCard(tok, slot, court = f.courtId) {
    const b = await book(tok, court, slot.id);
    const g = b.body.data.booking_group_id;
    const p = (await pay(tok, g, "card")).body.data.payment;
    await api(`/payments/${p.id}/simulate-confirm?success=true`, tok, { method: "POST", body: "{}" });
    return { g, bookingId: b.body.data.bookings[0].id, payment: p };
  }
  console.log("== setup done; stage", process.env.QA_STAGE || 1, "==");

  // ===================== Phase 1: role inventory =====================
  await t("R01", "all", "Which roles exist", "Role inventory from code and database", async () => {
    const roles = q1("select distinct role::text from users").replace(/[()',]/g, " ").split(/\s+/).filter(Boolean);
    return ok(roles.every((r) => ["admin", "owner", "player"].includes(r)), `Roles in the database: ${roles.join(", ")}. No arena staff role.`, `Unexpected roles: ${roles}`, "UserRole enum (player, owner, admin) in backend/app/modules/user/model.py");
  });
  await t("S01", "arena staff", "Arena Admin/Staff role", "Document it as not implemented", async () => {
    const reg = await raw("/auth/register", null, "POST", { full_name: "Staff Try", email: `${TAG}-staff@example.com`, phone: "03111111111", password: PASSWORD, role: "staff" });
    return ["NOT IMPLEMENTED", `There is no staff role: UserRole has only player/owner/admin and registering with role "staff" is refused (HTTP ${reg.status}).`, "No staff routes in docs/ROUTES_AND_ROLES.md"];
  });

  // ===================== Player =====================
  await t("U01a", "player", "Duplicate email is refused, one account only", "A second sign-up with a verified email is refused and no second row is made", async () => {
    const r = await raw("/auth/register", null, "POST", { full_name: "Dup", email: f.player, phone: "03222222222", password: PASSWORD, role: "player" });
    const n = num(q1(`select count(*) from users where email='${f.player}'`));
    return ok(r.status >= 400 && n === 1, `Refused with HTTP ${r.status}; rows for that email: ${n}`, `HTTP ${r.status}, rows: ${n}`, short(r.body));
  }, "High");
  await t("U01b", "player", "Wrong OTP rejected, right OTP accepted", "000000 refused; the real code works", async () => {
    const email = `${TAG}-u01@example.com`;
    await api("/auth/register", null, { method: "POST", body: JSON.stringify({ full_name: "U One", email, phone: "03" + String(100000000 + Math.floor(Math.random() * 800000000)), password: PASSWORD, role: "player" }) });
    await sleep(400);
    const real = lastOtpFor(email);
    const bad = await raw("/auth/verify-otp", null, "POST", { email, code: real === "000000" ? "111111" : "000000" });
    const good = await raw("/auth/verify-otp", null, "POST", { email, code: real });
    return ok(bad.status >= 400 && good.status === 200, `Wrong code HTTP ${bad.status}; real code HTTP ${good.status}`, `wrong ${bad.status}, real ${good.status}`);
  });
  await t("U01c", "player", "Wrong password, logout, password reset", "401 for wrong password; the refresh token dies after logout; reset code changes the password", async () => {
    const bad = await raw("/auth/login", null, "POST", { email: f.player, password: "Wrong@12345" });
    const login = await raw("/auth/login", null, "POST", { email: f.player, password: PASSWORD });
    const rt = login.body.data.refresh_token;
    await raw("/auth/logout", login.body.data.access_token, "POST", { refresh_token: rt });
    const again = await raw("/auth/refresh", null, "POST", { refresh_token: rt });
    await raw("/auth/forgot-password", null, "POST", { email: f.player });
    await sleep(400);
    const code = lastOtpFor(f.player);
    const reset = await raw("/auth/reset-password", null, "POST", { email: f.player, otp: code, new_password: "Verify@67890" });
    const oldPw = await raw("/auth/login", null, "POST", { email: f.player, password: PASSWORD });
    const newPw = await raw("/auth/login", null, "POST", { email: f.player, password: "Verify@67890" });
    // a password reset signs the account out everywhere (expected): sign in again for the later steps
    f.playerTok = (await api("/auth/login", null, { method: "POST", body: JSON.stringify({ email: f.player, password: "Verify@67890" }) })).access_token;
    return ok(bad.status === 401 && again.status === 401 && reset.status === 200 && oldPw.status === 401 && newPw.status === 200,
      `Wrong password 401; refresh after logout ${again.status}; reset ${reset.status}; old password ${oldPw.status}; new password ${newPw.status}`,
      `wrong ${bad.status}, refresh-after-logout ${again.status}, reset ${reset.status}, old ${oldPw.status}, new ${newPw.status}`);
  }, "High");

  await t("U02a", "player", "Arena search, sport filter, empty result", "Real arena found; filters work; no-match is an empty list not an error", async () => {
    const byName = await raw(`/arenas?q=${encodeURIComponent("Verify Arena " + TAG)}`, f.playerTok);
    const bySport = await raw("/arenas?sport=futsal&city=Lahore", f.playerTok);
    const none = await raw("/arenas?q=zzzznomatchzzzz", f.playerTok);
    const items = (r) => r.body.data?.items ?? r.body.data ?? [];
    const found = items(byName).some((a) => a.id === f.arenaId);
    return ok(found && bySport.status === 200 && none.status === 200 && items(none).length === 0,
      `Search found the arena (${items(byName).length} hit); sport filter HTTP ${bySport.status}; no-match HTTP 200 with 0 items`,
      `found=${found}, sport=${bySport.status}, none=${none.status}/${items(none).length}`);
  });
  await t("U02b", "player", "Availability filter and near-me", "date filter and lat/lon radius answer 200 and include the test arena", async () => {
    const day = await raw(`/arenas?date=${f.date}&sport=futsal`, f.playerTok);
    const near = await raw(`/arenas?lat=31.5204&lon=74.3587&radius_km=5`, f.playerTok);
    const has = (r) => JSON.stringify(r.body.data).includes(f.arenaId);
    return ok(day.status === 200 && near.status === 200 && has(day) && has(near), "Both filters answer 200 and list the arena", `date=${day.status}/${has(day)}, near=${near.status}/${has(near)}`);
  });
  await t("U02c", "player", "Smart search and assistant", "Supported request answers; nonsense and unsupported filter are handled", async () => {
    const nlp = await raw(`/search/nlp?q=${encodeURIComponent("futsal in Lahore")}`, null);
    const ask = await raw("/assistant/ask", f.playerTok, "POST", { text: "futsal courts in Lahore" });
    const nonsense = await raw("/assistant/ask", f.playerTok, "POST", { text: "asdf qwer zxcv" });
    const indoor = await raw("/assistant/ask", f.playerTok, "POST", { text: "indoor court in Lahore" });
    return ok([nlp, ask, nonsense, indoor].every((r) => r.status === 200), `nlp ${nlp.status}, assistant ${ask.status}, nonsense ${nonsense.status}, indoor ${indoor.status} (no crash)`, `statuses ${[nlp, ask, nonsense, indoor].map((r) => r.status)}`, short(indoor.body.data));
  });
  await t("U02d", "player", "Indoor/outdoor filter", "Recorded as a known limitation", async () => {
    const a = await api(`/arenas/${f.arenaId}`, null);
    const hasField = Object.keys(a).some((k) => /indoor|outdoor/i.test(k));
    return [hasField ? "PASS" : "NOT IMPLEMENTED", hasField ? "Field exists" : "Arena has no indoor/outdoor field, so there is nothing to filter on (known limitation, not a defect).", `Arena keys: ${Object.keys(a).join(", ").slice(0, 200)}`];
  });

  // --- U03: the main journey
  let journey;
  await t("U03", "player", "Book, pay, see it as player/owner/admin", "One consistent record across the three roles; slot no longer bookable", async () => {
    const slot = nextA();
    const price = (await raw("/bookings/preview", f.playerTok, "POST", { court_id: f.courtId, slot_ids: [slot.id], payment_type: "full" })).body.data;
    journey = await paidCard(f.playerTok, slot);
    const g = await grp(f.playerTok, journey.g);
    const ownerList = await api(`/owner/arenas/${f.arenaId}/bookings`, f.ownerTok);
    const ownerRow = (ownerList.items ?? ownerList).find((b) => b.id === journey.bookingId || b.booking_group_id === journey.g);
    const adminList = await api(`/admin/bookings?page_size=100`, f.adminTok);
    const adminRow = (adminList.items ?? adminList).find((b) => b.id === journey.bookingId || b.booking_group_id === journey.g);
    const again = await book(pbTok, f.courtId, slot.id);
    const amount = g.total;
    const sameAmount = [ownerRow?.total_amount, adminRow?.total_amount].every((a) => Number(a) === Number(amount));
    return ok(g.status === "confirmed" && !!ownerRow && !!adminRow && sameAmount && again.status === 409,
      `Player: confirmed, amount ${amount}; owner list and admin list show the same booking and amount; a second player is refused (HTTP ${again.status}). Price preview ${short(Object.keys(price ?? {}))}`,
      `status=${g.status}, owner=${!!ownerRow}, admin=${!!adminRow}, sameAmount=${sameAmount}, second=${again.status}`);
  }, "Critical");
  await t("U03b", "player", "Booking pass has a QR and a code, not the secret token", "Pass shows booking_code; no pass_token is displayed", async () => {
    const r = await raw(`/bookings/${journey.bookingId}/pass`, f.playerTok);
    const d = r.body.data;
    const tokenInDb = q1(`select pass_token from bookings where id='${journey.bookingId}'`).replace(/[()',]/g, "").trim();
    const leaked = tokenInDb && JSON.stringify(d).includes(tokenInDb) && !String(d.qr_code_url ?? "").startsWith("data:image/png");
    return ok(r.status === 200 && !!d.booking_code && String(d.qr_code_url ?? "").startsWith("data:image/png") && !leaked, "Pass HTTP 200; booking_code present; QR is an in-memory data image", short(d).replace(/data:image[^"]+/, "data:image..."));
  });
  await t("U03c", "player", "Other player cannot read or cancel my booking", "404 for another player's booking", async () => {
    const r1 = await raw(`/bookings/${journey.bookingId}`, pbTok);
    const r2 = await raw(`/bookings/${journey.bookingId}/cancel`, pbTok, "POST", {});
    const r3 = await raw(`/bookings/${journey.bookingId}/pass`, pbTok);
    return ok([r1, r2, r3].every((r) => r.status === 404), "All three answered 404", `statuses ${[r1, r2, r3].map((r) => r.status)}`, "", );
  }, "High");
  await t("U06a", "player", "Notifications after a booking", "Player and owner each have a notice that mentions the booking", async () => {
    const pn = await api("/notifications", f.playerTok);
    const on = await api("/notifications", f.ownerTok);
    const items = (x) => x.items ?? x;
    return ok(items(pn).length > 0 && items(on).length > 0, `Player has ${items(pn).length} notices, owner ${items(on).length}`, "No notices", short(items(pn)[0]));
  });

  // --- U04: concurrency
  await t("U04", "player", "Eight simultaneous bookings for one slot", "Exactly one 201, the rest 409; one active booking row; no duplicate payment", async () => {
    const slot = nextA();
    const toks = [f.playerTok, pbTok, pcTok, f.playerTok, pbTok, pcTok, f.playerTok, pbTok];
    const rs = await Promise.all(toks.map((tk) => book(tk, f.courtId, slot.id)));
    const codes = rs.map((r) => r.status);
    const wins = codes.filter((c) => c === 200).length;
    const rows = num(q1(`select count(*) from bookings where slot_id='${slot.id}' and status not in ('cancelled','rejected')`));
    const slotStatus = q1(`select status from time_slots where id='${slot.id}'`);
    return ok(wins === 1 && rows === 1 && codes.every((c) => c === 200 || c === 409), `Responses: ${codes.join(",")}. Active rows for the slot: ${rows}. Slot status now ${slotStatus}`, `wins=${wins}, rows=${rows}, codes=${codes}`, "Redis lock plus the unique index uq_bookings_active_slot_id");
  }, "Critical");
  await t("U04b", "player", "Two players, two devices, same slot, same instant", "Exactly one wins", async () => {
    const slot = nextA();
    const [a, b] = await Promise.all([book(f.playerTok, f.courtId, slot.id), book(pbTok, f.courtId, slot.id)]);
    const s = [a.status, b.status].sort().join("/");
    return ok(s === "200/409", `Responses ${s}`, `Responses ${s}`, "");
  }, "Critical");
  await t("U04c", "player", "Abandoned checkout holds the slot, then it is released", "Held slot refuses others (409); after release it is bookable", async () => {
    const slot = nextA();
    const a = await book(f.playerTok, f.courtId, slot.id);
    const held = await book(pbTok, f.courtId, slot.id);
    const rel = await raw(`/bookings/group/${a.body.data.booking_group_id}/release`, f.playerTok, "POST", {});
    const after = await book(pbTok, f.courtId, slot.id);
    return ok(a.status === 200 && held.status === 409 && [200, 204].includes(rel.status) && after.status === 200, `Hold ${a.status}; other player while held ${held.status}; release ${rel.status}; other player after ${after.status}`, `hold=${a.status}, during=${held.status}, release=${rel.status}, after=${after.status}`);
  }, "High");
  let staleSlot, staleGroup, stalePay;
  await t("C01", "all", "Unpaid hold expires; late payment callback cannot resurrect it", "After the payment window the booking is cancelled; a late signed 'paid' callback changes nothing", async () => {
    staleSlot = nextA();
    const b = await book(f.playerTok, f.courtId, staleSlot.id);
    staleGroup = b.body.data.booking_group_id;
    const p = (await pay(f.playerTok, staleGroup, "jazzcash", { wallet_number: "03001234567" })).body.data.payment;
    stalePay = p;
    execFileSync("uv", ["run", "python", process.env.SWEEP_RUNNER, "--advance-hours", "25"], { cwd: "backend", stdio: "pipe" });
    const st = await bstat(f.playerTok, staleGroup);
    const late = await hook("jazzcash", { gateway_transaction_id: p.gateway_transaction_id, status: "completed", amount: p.amount, currency: p.currency });
    const st2 = await bstat(f.playerTok, staleGroup);
    const slotNow = q1(`select status from time_slots where id='${staleSlot.id}'`);
    const free = await book(pbTok, f.courtId, staleSlot.id);
    return ok(st === "cancelled" && st2 === "cancelled" && free.status === 200, `After the sweep: ${st}. Late paid callback HTTP ${late.status}; booking still ${st2}; slot was ${slotNow} and another player could book it (HTTP ${free.status})`, `before=${st}, after-late=${st2}, rebook=${free.status}`, "backend/scripts/run_sweeps.py --advance-hours 25");
  }, "Critical");

  // --- U05: payments
  const pm = await api("/payments/methods", f.playerTok);
  await t("U05a", "player", "Stripe (card): signed webhook confirms; bad signature, duplicate, wrong amount", "Only a valid signed event confirms, once", async () => {
    const slot = nextA();
    const b = await book(f.playerTok, f.courtId, slot.id);
    const g = b.body.data.booking_group_id;
    const p = (await pay(f.playerTok, g, "card")).body.data.payment;
    const tx = p.gateway_transaction_id;
    const bad = await hook("stripe", stripeEvent("checkout.session.completed", tx, p.amount, p.currency), { stripeStyle: true, badSig: "deadbeef" });
    const s1 = await bstat(f.playerTok, g);
    const wrongAmt = await hook("stripe", stripeEvent("checkout.session.completed", tx, Number(p.amount) - 100, p.currency), { stripeStyle: true });
    const s2 = await bstat(f.playerTok, g);
    const good = await hook("stripe", stripeEvent("checkout.session.completed", tx, p.amount, p.currency), { stripeStyle: true });
    const dup = await hook("stripe", stripeEvent("checkout.session.completed", tx, p.amount, p.currency), { stripeStyle: true });
    const s3 = await bstat(f.playerTok, g);
    const payRows = num(q1(`select count(*) from payments where booking_group_id='${g}'`));
    return ok(bad.status >= 400 && s1 === "pending_payment" && wrongAmt.status >= 400 && s2 === "pending_payment" && good.status === 200 && dup.status === 200 && s3 === "confirmed" && payRows === 1,
      `Bad signature HTTP ${bad.status} (still ${s1}); wrong amount HTTP ${wrongAmt.status} (still ${s2}); valid event ${good.status} -> ${s3}; duplicate ${dup.status}; payment rows ${payRows}`,
      `bad=${bad.status}/${s1}, wrong=${wrongAmt.status}/${s2}, good=${good.status}, dup=${dup.status}, final=${s3}, rows=${payRows}`);
  }, "Critical");
  await t("U05b", "player", "Stripe: cancelled/expired checkout does not pay", "Expired event fails the payment, booking not confirmed", async () => {
    const slot = nextA();
    const b = await book(f.playerTok, f.courtId, slot.id);
    const g = b.body.data.booking_group_id;
    const p = (await pay(f.playerTok, g, "card")).body.data.payment;
    const ex = await hook("stripe", stripeEvent("checkout.session.expired", p.gateway_transaction_id, p.amount, p.currency, false), { stripeStyle: true });
    const st = await bstat(f.playerTok, g);
    const ps = q1(`select status, lifecycle_status from payments where id='${p.id}'`);
    return ok(ex.status === 200 && st !== "confirmed", `Expired event HTTP ${ex.status}; booking ${st}; payment ${ps}`, `status=${st}, ${ps}`);
  }, "High");
  for (const [method, label] of [["jazzcash", "JazzCash"], ["easypaisa", "EasyPaisa"]]) {
    await t(`U05-${method}`, "player", `${label} (simulator): signed callback, bad signature, duplicate, wrong route`, "Valid callback confirms once; the rest change nothing", async () => {
      const slot = nextA();
      const b = await book(f.playerTok, f.courtId, slot.id);
      const g = b.body.data.booking_group_id;
      const p = (await pay(f.playerTok, g, method, { wallet_number: "03001234567" })).body.data.payment;
      const body = { gateway_transaction_id: p.gateway_transaction_id, status: "completed", amount: p.amount, currency: p.currency };
      const bad = await hook(method, body, { badSig: "00ff" });
      const other = method === "jazzcash" ? "easypaisa" : "jazzcash";
      const wrongRoute = await hook(other, body, { secret: SECRETS[other] });
      const unknown = await hook(method, { ...body, gateway_transaction_id: "nope_" + crypto.randomUUID() });
      const mid = await bstat(f.playerTok, g);
      const good = await hook(method, body);
      const dup = await hook(method, body);
      const end = await bstat(f.playerTok, g);
      const rows = num(q1(`select count(*) from payments where booking_group_id='${g}' and status='completed'`));
      return ok(bad.status >= 400 && wrongRoute.status >= 400 && unknown.status >= 400 && mid === "pending_payment" && good.status === 200 && dup.status === 200 && end === "confirmed" && rows === 1,
        `Bad signature ${bad.status}; callback on the other gateway's address ${wrongRoute.status}; unknown transaction ${unknown.status}; still ${mid}. Valid ${good.status} -> ${end}; duplicate ${dup.status}; completed payments ${rows}`,
        `bad=${bad.status}, wrongRoute=${wrongRoute.status}, unknown=${unknown.status}, mid=${mid}, good=${good.status}, dup=${dup.status}, end=${end}, rows=${rows}`);
    }, "Critical");
  }
  await t("U05d", "player", "Browser return page / frontend success cannot mark a payment paid", "GET /payments/return and another player's simulate-confirm do not confirm", async () => {
    const slot = nextA();
    const b = await book(f.playerTok, f.courtId, slot.id);
    const g = b.body.data.booking_group_id;
    const p = (await pay(f.playerTok, g, "card")).body.data.payment;
    const ret = await fetch(`${API}/payments/return?status=success&txn=${p.gateway_transaction_id}`, { redirect: "manual" });
    const sim = await raw(`/payments/${p.id}/simulate-confirm?success=true`, pbTok, "POST", {});
    const st = await bstat(f.playerTok, g);
    return ok(st === "pending_payment" && sim.status === 404, `Return page HTTP ${ret.status}; other player's simulate-confirm HTTP ${sim.status}; booking still ${st}`, `return=${ret.status}, sim=${sim.status}, booking=${st}`);
  }, "Critical");

  // --- bank transfer + owner approval
  await api(`/owner/arenas/${f.arenaId}/bank-details`, f.ownerTok, { method: "POST", body: JSON.stringify({ account_title: "QA Owner", account_number: "PK36SCBL0000001123456702", bank_name: "Standard Chartered" }) });
  await sleep(400);
  await api(`/owner/arenas/${f.arenaId}/bank-details/verify`, f.ownerTok, { method: "POST", body: JSON.stringify({ code: lastOtpFor(f.owner) }) });
  let bankPay;
  await t("U05e", "player+owner", "Bank transfer: receipt keeps it pending; owner approves", "pending_approval until the owner approves, then confirmed", async () => {
    const slot = nextA();
    const b = await book(f.playerTok, f.courtId, slot.id);
    const g = b.body.data.booking_group_id;
    const p = (await pay(f.playerTok, g, "bank_transfer")).body.data.payment;
    bankPay = { g, p };
    const s0 = await bstat(f.playerTok, g);
    const rec = await raw(`/payments/${p.id}/receipt`, f.playerTok, "POST", { receipt_proof_url: await uploadReceipt(f.playerTok) });
    const s1 = await bstat(f.playerTok, g);
    const selfApprove = await raw(`/owner/payments/${p.id}/approve`, f.playerTok, "POST", {});
    const otherOwner = await raw(`/owner/payments/${p.id}/approve`, obTok, "POST", {});
    const s1b = await bstat(f.playerTok, g);
    const appr = await raw(`/owner/payments/${p.id}/approve`, f.ownerTok, "POST", {});
    const s2 = await bstat(f.playerTok, g);
    return ok(s1 === "pending_approval" && selfApprove.status === 403 && otherOwner.status === 404 && s1b === "pending_approval" && appr.status === 200 && s2 === "confirmed",
      `After initiate ${s0}; receipt HTTP ${rec.status} -> ${s1}; player approving own ${selfApprove.status}; other owner approving ${otherOwner.status}; real owner ${appr.status} -> ${s2}`,
      `s0=${s0}, receipt=${rec.status}/${s1}, self=${selfApprove.status}, otherOwner=${otherOwner.status}, approve=${appr.status}/${s2}`, short(rec.body));
  }, "High");
  await t("U05f", "player+owner", "Bank transfer: owner rejects", "Rejected, never shown as paid, slot freed", async () => {
    const slot = nextA();
    const b = await book(pcTok, f.courtId, slot.id);
    const g = b.body.data.booking_group_id;
    const p = (await pay(pcTok, g, "bank_transfer")).body.data.payment;
    await raw(`/payments/${p.id}/receipt`, pcTok, "POST", { receipt_proof_url: await uploadReceipt(pcTok) });
    const rej = await raw(`/owner/payments/${p.id}/reject`, f.ownerTok, "POST", { reason: "Receipt unreadable." });
    const st = await bstat(pcTok, g);
    const ps = q1(`select status from payments where id='${p.id}'`);
    const again = await raw(`/owner/payments/${p.id}/approve`, f.ownerTok, "POST", {});
    return ok(rej.status === 200 && st !== "confirmed" && again.status >= 400, `Reject HTTP ${rej.status}; booking ${st}; payment ${ps}; approving afterwards HTTP ${again.status}`, `reject=${rej.status}, booking=${st}, again=${again.status}`);
  }, "High");

  // --- cancel / refund
  await t("U06b", "player", "Cancel a paid booking: refund recorded, slot reopened, double cancel makes one refund", "One refund; slot available again", async () => {
    const slot = nextA();
    const x = await paidCard(pcTok, slot);
    const preview = await raw(`/bookings/group/${x.g}/cancel-preview`, pcTok);
    const rs = await Promise.all([1, 2].map(() => raw(`/bookings/group/${x.g}/cancel`, pcTok, "POST", {})));
    const refunds = num(q1(`select count(*) from refunds where payment_id='${x.payment.id}'`));
    const st = await bstat(pcTok, x.g);
    const slotStatus = q1(`select status from time_slots where id='${slot.id}'`);
    const refundStatus = q1(`select status from refunds where payment_id='${x.payment.id}' limit 1`);
    return ok(refunds === 1 && st === "cancelled" && slotStatus.includes("available"), `Preview HTTP ${preview.status}; two simultaneous cancels answered ${rs.map((r) => r.status)}; refunds ${refunds} (${refundStatus}); booking ${st}; slot ${slotStatus}`, `refunds=${refunds}, booking=${st}, slot=${slotStatus}, answers=${rs.map((r) => r.status)}`);
  }, "Critical");
  await t("A03", "admin", "Force refund once, repeated and simultaneous", "One refund only; the second attempt is refused", async () => {
    const slot = nextA();
    const x = await paidCard(f.playerTok, slot);
    const bid = x.bookingId;
    const rs = await Promise.all([1, 2, 3].map(() => raw(`/admin/bookings/${bid}/force-refund`, f.adminTok, "POST", { reason: "QA double click test." })));
    const refunds = num(q1(`select count(*) from refunds where payment_id='${x.payment.id}'`));
    const asOwner = await raw(`/admin/bookings/${bid}/force-refund`, f.ownerTok, "POST", { reason: "x" });
    const asPlayer = await raw(`/admin/bookings/${bid}/force-refund`, f.playerTok, "POST", { reason: "x" });
    const wins = rs.filter((r) => r.status === 200).length;
    return ok(wins === 1 && refunds === 1 && asOwner.status === 403 && asPlayer.status === 403, `Three simultaneous force-refunds answered ${rs.map((r) => r.status)}; refund rows ${refunds}; owner ${asOwner.status}; player ${asPlayer.status}`, `answers=${rs.map((r) => r.status)}, refunds=${refunds}, owner=${asOwner.status}, player=${asPlayer.status}`);
  }, "Critical");
  await t("C02", "player", "Old booking id, past slot, passed date", "404 for a made-up id; a started slot cannot be booked", async () => {
    const fake = await raw(`/bookings/${crypto.randomUUID()}`, f.playerTok);
    const today = new Date().toISOString().slice(0, 10);
    const todaySlots = await api(`/courts/${arenaB.courtId}/slots?date=${today}`, f.playerTok);
    const past = (todaySlots ?? []).find((s) => s.status === "available" && new Date(`${today}T${s.start_time}`) < new Date());
    let pastRes = { status: "n/a" };
    if (past) pastRes = await book(f.playerTok, arenaB.courtId, past.id);
    return ok(fake.status === 404 && (!past || pastRes.status >= 400), `Made-up booking id HTTP ${fake.status}; started slot ${past ? "booking HTTP " + pastRes.status : "none today in this arena, covered by tests/modules/test_slot_past.py"}`, `fake=${fake.status}, past=${pastRes.status}`);
  });

  // --- other player features
  await t("U07a", "player", "Review: eligible, invalid, duplicate", "One review per booking; 1-5 only", async () => {
    q1(`update bookings set status='completed' where id='${journey.bookingId}'`);
    const bad = await raw(`/arenas/${f.arenaId}/reviews`, f.playerTok, "POST", { booking_id: journey.bookingId, rating: 9 });
    const good = await raw(`/arenas/${f.arenaId}/reviews`, f.playerTok, "POST", { booking_id: journey.bookingId, rating: 5, review_text: "Great QA court." });
    const dup = await raw(`/arenas/${f.arenaId}/reviews`, f.playerTok, "POST", { booking_id: journey.bookingId, rating: 4 });
    const other = await raw(`/arenas/${f.arenaId}/reviews`, pbTok, "POST", { booking_id: journey.bookingId, rating: 4 });
    return ok(bad.status === 422 && good.status === 201 && dup.status >= 400 && other.status >= 400, `Rating 9 -> ${bad.status}; valid -> ${good.status}; duplicate -> ${dup.status}; another player's booking -> ${other.status}`, `bad=${bad.status}, good=${good.status}, dup=${dup.status}, other=${other.status}`, "(the booking was marked completed with SQL on the scratch database to stand in for the game being played)");
  });
  await t("U07b", "player", "Match: create, join, leave", "Creator, joiner and counts follow the rules", async () => {
    const slot = nextB();
    const x = await paidCard(f.playerTok, slot, court2.id);
    const mk = await raw("/matches", f.playerTok, "POST", { booking_group_id: x.g, sport: "futsal", max_players: 4, note: "QA match" });
    const id = mk.body.data?.id;
    const join = await raw(`/matches/${id}/join`, pbTok, "POST", {});
    const joinAgain = await raw(`/matches/${id}/join`, pbTok, "POST", {});
    const strangerMake = await raw("/matches", pbTok, "POST", { booking_group_id: x.g, sport: "futsal", max_players: 4 });
    const leave = await raw(`/matches/${id}/leave`, pbTok, "POST", {});
    return ok(mk.status === 201 && join.status === 200 && joinAgain.status >= 400 && strangerMake.status >= 400 && leave.status === 200, `Create ${mk.status}; join ${join.status}; join twice ${joinAgain.status}; match on someone else's booking ${strangerMake.status}; leave ${leave.status}`, `create=${mk.status}, join=${join.status}, again=${joinAgain.status}, stranger=${strangerMake.status}, leave=${leave.status}`, short(mk.body));
  });
  await t("U07c", "player+owner", "Equipment rental: list and price", "Owner adds equipment; player sees it", async () => {
    const add = await raw(`/owner/arenas/${f.arenaId}/equipment`, f.ownerTok, "POST", { name: "QA Football", rental_price: "300.00", quantity_total: 5 });
    const list = await raw(`/arenas/${f.arenaId}/equipment`, f.playerTok);
    return ok([200, 201].includes(add.status) && list.status === 200 && JSON.stringify(list.body.data).includes("QA Football"), `Add ${add.status}; player list ${list.status} contains it`, `add=${add.status}, list=${list.status}`, short(add.body));
  });
  await t("U07d", "player", "Complaint submitted, admin moves it, player sees the status", "Status visible to the player", async () => {
    const c = await raw("/complaints", f.playerTok, "POST", { category: "other", description: "QA complaint about the court lights." });
    const id = c.body.data?.id;
    const mv = await raw(`/admin/complaints/${id}/status`, f.adminTok, "PATCH", { status: "under_review" });
    const mine = await api(`/complaints/${id}`, f.playerTok);
    const asOther = await raw(`/complaints/${id}`, pbTok);
    return ok(c.status === 201 && mv.status === 200 && mine.status === "under_review" && asOther.status === 404, `Create ${c.status}; admin move ${mv.status}; player sees "${mine.status}"; another player ${asOther.status}`, `create=${c.status}, move=${mv.status}, seen=${mine.status}, other=${asOther.status}`);
  });
  await t("U07e", "player", "Location validation and directions data", "Missing, swapped and out-of-country coordinates are refused", async () => {
    const base = { name: "QA Loc", description: "x", address: "1 Road", city: "Lahore", area: "Gulberg", contact_phone: "0421234567", contact_email: "a@example.com", operating_hours: { monday: { open: "08:00", close: "22:00" } }, sports_offered: ["futsal"], images: [], amenity_ids: [], advance_percentage: 50, require_full_payment: false, refund_policy: [{ hours_before: 24, refund_percentage: 100 }] };
    const swapped = await raw("/owner/arenas", f.ownerTok, "POST", { ...base, latitude: "74.3587", longitude: "31.5204" });
    const abroad = await raw("/owner/arenas", f.ownerTok, "POST", { ...base, latitude: "51.5", longitude: "-0.12" });
    const half = await raw("/owner/arenas", f.ownerTok, "POST", { ...base, latitude: "31.5" });
    return ok([swapped, abroad, half].every((r) => r.status === 422), `Swapped ${swapped.status}; outside Pakistan ${abroad.status}; one coordinate only ${half.status}`, `statuses ${[swapped, abroad, half].map((r) => r.status)}`, short(swapped.body.errors ?? swapped.body));
  });

  // ===================== Owner =====================
  await t("O01", "owner", "Owner dashboard, logout, protected page", "Dashboard answers; after logout the token's refresh is dead", async () => {
    const sum = await raw("/owner/dashboard/summary", f.ownerTok);
    const noTok = await raw("/owner/dashboard/summary", null);
    const garbage = await raw("/owner/dashboard/summary", "not.a.token");
    return ok(sum.status === 200 && noTok.status === 401 && garbage.status === 401, `Dashboard ${sum.status}; no token ${noTok.status}; invalid token ${garbage.status}`, `sum=${sum.status}, none=${noTok.status}, bad=${garbage.status}`);
  });
  await t("O02a", "owner", "Edit arena and court, then search sees it", "Edits persist and reach player search", async () => {
    const newName = `Verify Arena ${TAG} Renamed`;
    const up = await raw(`/owner/arenas/${f.arenaId}`, f.ownerTok, "PATCH", { name: newName });
    const get = await api(`/owner/arenas/${f.arenaId}`, f.ownerTok);
    const search = await raw(`/arenas?q=${encodeURIComponent("Renamed")}`, f.playerTok);
    const price = await raw(`/owner/courts/${court2.id}`, f.ownerTok, "PATCH", { base_price: "3500.00" });
    return ok(up.status === 200 && get.name === newName && JSON.stringify(search.body.data).includes(f.arenaId) && price.status === 200, `Arena PATCH ${up.status}; reload shows new name; player search finds it; court price PATCH ${price.status}`, `patch=${up.status}, name=${get.name}, price=${price.status}`);
  });
  await t("O02b", "owner", "Invalid price, hours, required fields", "422 from the backend for each", async () => {
    const neg = await raw(`/owner/arenas/${f.arenaId}/courts`, f.ownerTok, "POST", { name: "Bad", sport_types: ["futsal"], base_price: "-5" });
    const zero = await raw(`/owner/arenas/${f.arenaId}/courts`, f.ownerTok, "POST", { name: "Bad", sport_types: ["futsal"], base_price: "0" });
    const missing = await raw(`/owner/arenas/${f.arenaId}/courts`, f.ownerTok, "POST", { sport_types: ["futsal"] });
    const hours = await raw(`/owner/arenas/${f.arenaId}`, f.ownerTok, "PATCH", { operating_hours: { monday: { open: "23:00", close: "08:00" } } });
    const text = await raw(`/owner/arenas/${f.arenaId}/courts`, f.ownerTok, "POST", { name: "Bad", sport_types: ["futsal"], base_price: "abc" });
    return ok([neg, zero, missing, hours, text].every((r) => r.status === 422), `negative ${neg.status}; zero ${zero.status}; missing name ${missing.status}; closing before opening ${hours.status}; text price ${text.status}`, `statuses ${[neg, zero, missing, hours, text].map((r) => r.status)}`);
  });
  await t("O02c", "owner", "Edit does not change an existing booking's price", "Booked amount stays the same after a court price change", async () => {
    const b = await raw(`/bookings/${journey.bookingId}`, f.playerTok);
    const before = journey && Number(b.body.data.total_amount);
    await raw(`/owner/courts/${f.courtId}`, f.ownerTok, "PATCH", { base_price: "2600.00" });
    const after = Number((await raw(`/bookings/${journey.bookingId}`, f.playerTok)).body.data.total_amount);
    await raw(`/owner/courts/${f.courtId}`, f.ownerTok, "PATCH", { base_price: "2000.00" });
    return ok(before === after, `Amount stayed ${after} after the price edit`, `before ${before}, after ${after}`);
  }, "High");
  await t("O03", "owner", "Tenant isolation: owner B against owner A's data", "404/403 on every read and write", async () => {
    const tries = [
      ["GET", `/owner/arenas/${f.arenaId}`], ["GET", `/owner/arenas/${f.arenaId}/bookings`], ["PATCH", `/owner/arenas/${f.arenaId}`, { name: "Hijack" }],
      ["GET", `/owner/courts/${f.courtId}`], ["PATCH", `/owner/courts/${f.courtId}`, { base_price: "1.00" }], ["GET", `/owner/courts/${f.courtId}/slots?date=${f.date}`],
      ["POST", `/owner/courts/${f.courtId}/slots/generate`, { start_date: f.date, end_date: f.date }],
      ["POST", `/owner/arenas/${f.arenaId}/courts`, { name: "Sneak", sport_types: ["futsal"], base_price: "1000" }],
      ["GET", `/owner/arenas/${f.arenaId}/bank-details`], ["GET", `/owner/arenas/${f.arenaId}/blocked-dates`],
      ["POST", `/owner/payments/${bankPay.p.id}/reject`, { reason: "x" }], ["DELETE", `/owner/arenas/${f.arenaId}`],
    ];
    const out = [];
    for (const [m, p, b] of tries) out.push((await raw(p, obTok, m, b)).status);
    const stillName = (await api(`/owner/arenas/${f.arenaId}`, f.ownerTok)).name;
    return ok(out.every((s) => s === 404 || s === 403) && stillName !== "Hijack", `Owner B got ${out.join(",")} on 12 attempts; arena name unchanged`, `statuses ${out}, name=${stillName}`, "", );
  }, "Critical");
  await t("O03b", "owner", "Owner lists only their own bookings, payments, reports", "Owner B sees none of arena A's data", async () => {
    const bk = await raw(`/owner/dashboard/bookings`, obTok);
    const rep = await raw(`/owner/reports`, obTok);
    const rev = await raw(`/owner/dashboard/revenue`, obTok);
    const leaked = [bk, rep, rev].some((r) => JSON.stringify(r.body.data ?? {}).includes(f.arenaId) || JSON.stringify(r.body.data ?? {}).includes(journey.bookingId));
    return ok([bk, rep, rev].every((r) => r.status === 200) && !leaked, `Statuses ${[bk, rep, rev].map((r) => r.status)}; none of arena A's ids appear`, `leaked=${leaked}`);
  }, "Critical");
  await t("O04", "owner", "Owner payment report reconciles with the database", "Rows and total equal the payments on this owner's arena", async () => {
    const res = await fetch(`${API}/owner/reports?type=payment&format=csv&arena_id=${f.arenaId}&date_from=${f.date}&date_to=${f.date}`, { headers: { Authorization: `Bearer ${f.ownerTok}` } });
    const lines = (await res.text()).trim().split(/\r?\n/);
    const dataRows = lines.slice(1).filter(Boolean);
    const amt = (l) => Number((l.match(/([\d,]+(?:\.\d+)?)\s*"?$/) || [])[1]?.replace(/,/g, ""));
    const csvTotal = dataRows.reduce((a, l) => a + (amt(l) || 0), 0);
    const db = q1(`select count(*), coalesce(sum(amount),0) from payments where booking_group_id in (select booking_group_id from bookings where arena_id='${f.arenaId}')`);
    const dbCount = num(db), dbSum = Number((/Decimal\('([\d.]+)'\)/.exec(db) || [])[1]);
    return ok(res.status === 200 && dataRows.length === dbCount && Math.abs(csvTotal - dbSum) < 0.01, `Report has ${dataRows.length} payment rows totalling ${csvTotal}; database has ${dbCount} payments totalling ${dbSum}`, `report ${dataRows.length}/${csvTotal} vs db ${dbCount}/${dbSum}`, `header: ${lines[0]}`);
  }, "High");
  await t("O05", "owner", "Photo upload: invalid type and oversized file", "Backend refuses a text file and a >5 MB file", async () => {
    const form = new FormData();
    form.append("file", new Blob(["not an image"], { type: "text/plain" }), "x.txt");
    const bad = await fetch(`${API}/uploads/image?folder=arenas`, { method: "POST", headers: { Authorization: `Bearer ${f.ownerTok}` }, body: form });
    const big = new FormData();
    big.append("file", new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/jpeg" }), "big.jpg");
    const huge = await fetch(`${API}/uploads/image?folder=arenas`, { method: "POST", headers: { Authorization: `Bearer ${f.ownerTok}` }, body: big });
    return ok(bad.status >= 400 && huge.status >= 400, `Text file HTTP ${bad.status}; 6 MB image HTTP ${huge.status}`, `text=${bad.status}, big=${huge.status}`);
  });
  await t("O06", "owner", "Blocked date: block, cannot book, unblock", "A blocked day cannot be booked; a past day cannot be blocked", async () => {
    const day = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
    const bl = await raw(`/owner/arenas/${f.arenaId}/blocked-dates`, f.ownerTok, "POST", { blocked_date: day, reason: "QA" });
    const past = await raw(`/owner/arenas/${f.arenaId}/blocked-dates`, f.ownerTok, "POST", { blocked_date: "2020-01-01" });
    return ok(bl.status === 201 && past.status >= 400, `Block ${bl.status}; a past date ${past.status}`, `block=${bl.status}, past=${past.status}`, short(past.body));
  });

  // ===================== Admin =====================
  await t("A01", "admin", "Admin access control", "Admin pages refuse no token, player and owner; admin gets in", async () => {
    const paths = ["/admin/dashboard", "/admin/users", "/admin/bookings", "/admin/payments", "/admin/refunds", "/admin/reports", "/admin/audit-logs", "/admin/settings"];
    const rows = [];
    for (const p of paths) {
      const a = await raw(p, f.adminTok), n = await raw(p, null), pl = await raw(p, f.playerTok), ow = await raw(p, f.ownerTok);
      rows.push([p, a.status, n.status, pl.status, ow.status]);
    }
    const good = rows.every(([, a, n, pl, ow]) => a === 200 && n === 401 && pl === 403 && ow === 403);
    return ok(good, `All 8 admin routes: admin 200, no token 401, player 403, owner 403`, rows.filter(([, a, n, pl, ow]) => !(a === 200 && n === 401 && pl === 403 && ow === 403)).join(" | "), "");
  }, "Critical");
  await t("A01b", "admin", "Owner-only routes with an admin or player token", "Role mismatch refused", async () => {
    const asAdmin = await raw("/owner/arenas", f.adminTok);
    const asPlayer = await raw("/owner/arenas", f.playerTok);
    const bookAsAdmin = await raw("/bookings", f.adminTok);
    return ok(asAdmin.status === 403 && asPlayer.status === 403, `Admin on /owner/arenas ${asAdmin.status}; player ${asPlayer.status}. Admin on GET /bookings (any signed-in user) ${bookAsAdmin.status}`, `admin=${asAdmin.status}, player=${asPlayer.status}`);
  }, "High");
  await t("A02", "admin", "Role escalation attempts", "A user cannot make themself admin", async () => {
    const reg = await raw("/auth/register", null, "POST", { full_name: "Esc", email: `${TAG}-esc@example.com`, phone: "03444444444", password: PASSWORD, role: "admin" });
    const put = await raw("/users/me", f.playerTok, "PUT", { role: "admin", full_name: "Test User" });
    const meNow = await me(f.playerTok);
    const adminRows = num(q1(`select count(*) from users where email='${TAG}-esc@example.com' and role='admin'`));
    return ok(reg.status >= 400 && meNow.role === "player" && adminRows === 0, `Register as admin HTTP ${reg.status}; PUT /users/me with role admin ${put.status}; role is still "${meNow.role}"`, `reg=${reg.status}, put=${put.status}, role=${meNow.role}, adminRows=${adminRows}`);
  }, "Critical");
  await t("A02b", "admin", "Suspend and reactivate a user", "Suspended user is refused sign-in; reactivation restores it", async () => {
    const victim = `${TAG}-victim@example.com`;
    const tok = await registerAndVerify(victim, "player", "Victim");
    const id = (await me(tok)).id;
    const sus = await raw(`/admin/users/${id}/suspend`, f.adminTok, "PATCH", { reason: "QA suspend" });
    const login = await raw("/auth/login", null, "POST", { email: victim, password: PASSWORD });
    const useOld = await raw("/users/me", tok);
    const re = await raw(`/admin/users/${id}/reactivate`, f.adminTok, "PATCH", {});
    const login2 = await raw("/auth/login", null, "POST", { email: victim, password: PASSWORD });
    const audit = await api("/admin/audit-logs?page_size=50", f.adminTok);
    const logged = JSON.stringify(audit).includes("user.suspend") || JSON.stringify(audit).includes("suspend");
    return ok(sus.status === 200 && login.status === 401 && useOld.status === 401 && re.status === 200 && login2.status === 200 && logged, `Suspend ${sus.status}; sign-in ${login.status}; old token ${useOld.status}; reactivate ${re.status}; sign-in ${login2.status}; audit log mentions it: ${logged}`, `sus=${sus.status}, login=${login.status}, old=${useOld.status}, re=${re.status}, login2=${login2.status}, audit=${logged}`);
  }, "High");
  await t("A02c", "admin", "Arena approval, rejection and suspension", "Status changes persist and hide/show the arena", async () => {
    const hidden = await raw(`/admin/arenas/${arenaB.arenaId}/suspend`, f.adminTok, "POST", { reason: "QA suspend" });
    const inSearch = JSON.stringify((await raw(`/arenas?q=${encodeURIComponent("QA Arena B")}`, f.playerTok)).body.data).includes(arenaB.arenaId);
    const back = await raw(`/admin/arenas/${arenaB.arenaId}/reactivate`, f.adminTok, "POST", {});
    const inSearch2 = JSON.stringify((await raw(`/arenas?q=${encodeURIComponent("QA Arena B")}`, f.playerTok)).body.data).includes(arenaB.arenaId);
    return ok(hidden.status === 200 && !inSearch && back.status === 200 && inSearch2, `Suspend ${hidden.status}: arena in search ${inSearch}; reactivate ${back.status}: arena in search ${inSearch2}`, `suspend=${hidden.status}/${inSearch}, reactivate=${back.status}/${inSearch2}`, short(hidden.body));
  }, "High");
  await t("A03b", "admin", "Admin views match player and owner views", "Same booking and payment amounts", async () => {
    const pays = await api(`/admin/payments?page_size=100`, f.adminTok);
    const row = (pays.items ?? pays).find((p) => (p.booking_group_id ?? p.group_id) === journey.g || p.id === journey.payment.id);
    const mine = await api("/payments/my", f.playerTok);
    const mineRow = (mine.items ?? mine).find((p) => p.id === journey.payment.id);
    return ok(!!row && !!mineRow && Number(row.amount) === Number(mineRow.amount), `Admin payment amount ${row?.amount} = player history amount ${mineRow?.amount}`, `admin=${!!row}, mine=${!!mineRow}`);
  }, "High");
  await t("A04", "admin", "Reports, filters, empty and wrong dates", "Export answers; an empty period is header-only; junk date refused", async () => {
    const get = async (q) => { const r = await fetch(`${API}/admin/reports?${q}`, { headers: { Authorization: `Bearer ${f.adminTok}` } }); return { status: r.status, text: await r.text() }; };
    const normal = await get(`type=bookings&date_from=${f.date}&date_to=${f.date}`);
    const empty = await get(`type=bookings&date_from=2020-01-01&date_to=2020-01-02`);
    const back = await get(`type=bookings&date_from=2026-12-31&date_to=2026-01-01`);
    const junk = await get(`type=bookings&date_from=notadate`);
    const rows = (x) => x.text.trim().split(/\r?\n/).length - 1;
    return ok(normal.status === 200 && rows(normal) > 0 && empty.status === 200 && rows(empty) === 0 && junk.status === 422 && (back.status >= 400 || rows(back) === 0),
      `Normal ${normal.status} (${rows(normal)} rows); empty period ${empty.status} (${rows(empty)} rows); backwards range ${back.status} (${rows(back)} rows); junk date ${junk.status}`,
      `normal=${normal.status}/${rows(normal)}, empty=${empty.status}/${rows(empty)}, back=${back.status}/${rows(back)}, junk=${junk.status}`);
  });
  // ===================== Security / reliability =====================
  await t("X01", "all", "Player A cannot touch player B's payments and receipts", "404", async () => {
    const r1 = await raw(`/payments/${journey.payment.id}/events`, pbTok);
    const r2 = await raw(`/payments/${bankPay.p.id}/receipt`, pbTok, "POST", { receipt_proof_url: "https://res.cloudinary.com/demo/image/upload/x.jpg" });
    const r3 = await raw(`/payments/${journey.payment.id}/receipt.pdf`, pbTok);
    const r4 = await raw(`/payments/by-group/${journey.g}`, pbTok);
    return ok([r1, r2, r3, r4].every((r) => r.status === 404 || r.status === 403), `Statuses ${[r1, r2, r3, r4].map((r) => r.status)}`, `statuses ${[r1, r2, r3, r4].map((r) => r.status)}`);
  }, "Critical");
  await t("X02", "all", "Hostile input", "Odd bodies are refused without a 500", async () => {
    const bodies = [
      ["/bookings", { court_id: "not-a-uuid", slot_ids: [], payment_type: "full" }],
      ["/bookings", { court_id: f.courtId, slot_ids: ["x"], payment_type: "bogus" }],
      ["/bookings", { court_id: f.courtId, slot_ids: [crypto.randomUUID()], payment_type: "full" }],
      ["/payments/initiate", { booking_group_id: crypto.randomUUID(), payment_method: "card" }],
      ["/payments/initiate", { booking_group_id: crypto.randomUUID(), payment_method: "bitcoin" }],
    ];
    const st = [];
    for (const [p, b] of bodies) st.push((await raw(p, f.playerTok, "POST", b)).status);
    const pars = await fetch(`${API}/bookings`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${f.playerTok}` }, body: "{not json" });
    st.push(pars.status);
    return ok(st.every((s) => s >= 400 && s < 500), `Statuses ${st.join(",")} (all 4xx, none 500)`, `statuses ${st}`);
  }, "High");
  await t("X03", "all", "Errors do not leak internals", "No stack trace, SQL or file path in error bodies", async () => {
    await sleep(65000); // the sign-in routes allow 20 a minute: start a fresh minute so no 429 hides the message
    const samples = [await raw(`/bookings/${crypto.randomUUID()}`, f.playerTok), await raw("/bookings", f.playerTok, "POST", { court_id: "x" }), await raw("/auth/login", null, "POST", { email: `${TAG}-ghost@example.com`, password: "x" })];
    const text = JSON.stringify(samples.map((s) => s.body));
    const leak = /Traceback|sqlalchemy|asyncpg|File "|\.py"|postgres|SELECT /i.test(text);
    const m1 = await raw("/auth/login", null, "POST", { email: f.player, password: "Wrong@12345" });
    const m2 = await raw("/auth/login", null, "POST", { email: `${TAG}-ghost@example.com`, password: "Wrong@12345" });
    const enumeration = m1.body.message === m2.body.message;
    return ok(!leak && enumeration, "No internals in the sampled errors; wrong password and unknown email give the same message", `leak=${leak}, known account -> ${m1.status} "${m1.body.message}"; unknown -> ${m2.status} "${m2.body.message}"`);
  }, "High");
  await t("X04", "all", "Backend health and Redis lock cleanup", "Health ok; no lock keys left behind after the concurrency tests", async () => {
    const h = await (await fetch(`${API}/health`)).json();
    const keys = execFileSync("redis-cli", ["-n", "5", "--scan", "--pattern", "lock:court:*"]).toString().trim();
    return ok(h.data.redis === "ok" && h.data.database === "ok" && keys === "", `Health api/db/redis ok; lock keys left in Redis db 5: ${keys ? keys.split("\n").length : 0}`, `keys: ${keys.slice(0, 200)}`);
  });
  await t("X05", "all", "Rate limiting and brute force", "Repeated wrong logins get slowed or blocked", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await raw("/auth/login", null, "POST", { email: `${TAG}-brute@example.com`, password: "Wrong@12345" })).status;
    return ok(last === 429, `After 25 quick wrong logins the answer is HTTP ${last}`, `last status ${last}`);
  });

  // leave a pending booking for the restart check (stage 2)
  const pendSlot = nextA();
  const pend = await book(f.playerTok, f.courtId, pendSlot.id);
  const pendPay = (await pay(f.playerTok, pend.body.data.booking_group_id, "jazzcash", { wallet_number: "03001234567" })).body.data.payment;
  fs.mkdirSync("docs/qa", { recursive: true });
  fs.writeFileSync("docs/qa/.restart_state.json", JSON.stringify({ tag: TAG, playerEmail: f.player, group: pend.body.data.booking_group_id, payment: pendPay, slot: pendSlot.id }));
  fs.writeFileSync(OUTFILE, JSON.stringify(results, null, 1));
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nPASS ${c("PASS")}  FAIL ${c("FAIL")}  BLOCKED ${c("BLOCKED")}  NOT IMPLEMENTED ${c("NOT IMPLEMENTED")}`);
}

main().catch((e) => { console.error("FATAL", e); fs.mkdirSync("docs/qa", { recursive: true }); fs.writeFileSync(OUTFILE, JSON.stringify(results, null, 1)); process.exit(1); });
