// Stripe TEST-mode end to end: ArenaHub's real card flow against Stripe's real hosted card page.
// Needs: scratch backend on :8001 started with the Stripe CLI's webhook secret (the CLI forwards
// the signed events to /api/v1/webhooks/stripe), the Stripe key in backend/.env being a TEST key.
// No real money: test mode only, Stripe's published test cards. Fake @example.com accounts only.
//
//   BACKEND_LOG  scratch backend log (dev OTP lines)   SQL_RUNNER  scratch SQL helper
//   STRIPE_EXPIRE  python file that expires one test Checkout Session (run with uv in backend/)
//   QA_TAG  a fresh prefix per run
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { API, OUT, api, chromium, fixture, freeSlots, sleep, sql } from "./lib/verify-kit.mjs";

const TAG = process.env.QA_TAG;
if (!TAG) throw new Error("Set QA_TAG.");
const results = [];
const note = (id, status, text) => {
  results.push({ id, status, text });
  console.log(`[${status}] ${id} -- ${text}`);
};
const raw = (p, tok, method = "GET", body) =>
  api(p, tok, { method, raw: true, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function waitFor(fn, ms = 60000, every = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

async function payOnStripe(page, url, card) {
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("#cardNumber", { timeout: 45000 });
  if (await page.locator("#email").count()) await page.fill("#email", `${TAG}-stripe@example.com`);
  await page.fill("#cardNumber", card);
  await page.fill("#cardExpiry", "12 / 34");
  await page.fill("#cardCvc", "123");
  if (await page.locator("#billingName").count()) await page.fill("#billingName", "QA Tester");
  const btn = page.locator('[data-testid="hosted-payment-submit-button"], .SubmitButton').first();
  await btn.click();
}

async function main() {
  const f = await fixture(TAG);
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  let i = 0;
  const book = async () => {
    const b = await raw("/bookings", f.playerTok, "POST", { court_id: f.courtId, slot_ids: [slots[i++].id], payment_type: "full" });
    return b.body.data.booking_group_id;
  };
  const start = async (g) => {
    const r = await raw("/payments/initiate", f.playerTok, "POST", { booking_group_id: g, payment_method: "card", return_url: "http://localhost:8082/booking/return" });
    return r;
  };
  const group = async (g) => api(`/bookings/group/${g}`, f.playerTok);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });

  // E1: a successful payment on Stripe's real page, confirmed by Stripe's signed webhook
  try {
    const g = await book();
    const r = await start(g);
    const p = r.body.data.payment;
    const url = r.body.data.redirect_url;
    if (r.status !== 200 || !/^https:\/\/checkout\.stripe\.com\//.test(url || "")) throw new Error(`initiate -> ${r.status}, page ${String(url).slice(0, 40)}`);
    const before = (await group(g)).status;
    const page = await ctx.newPage();
    await payOnStripe(page, url, "4242424242424242");
    const confirmed = await waitFor(async () => (await group(g)).status === "confirmed");
    const rows = sql(`select count(*), min(status::text), min(lifecycle_status::text) from payments where booking_group_id='${g}'`).trim();
    note("E1", confirmed && before === "pending_payment" ? "PASS" : "FAIL", `before ${before}; after the payment and Stripe's webhook: ${(await group(g)).status}; payment rows ${rows}; amount ${p.amount} ${p.currency}`);
    if (!confirmed) await page.screenshot({ path: path.join(OUT, "FAIL-stripe-e1.png") });
    await page.close();
    globalThis.paid = { g, p };
  } catch (e) {
    note("E1", "FAIL", String(e.message).slice(0, 240));
  }

  // E2: a declined card: the booking is NOT confirmed
  try {
    const g = await book();
    const r = await start(g);
    const page = await ctx.newPage();
    await payOnStripe(page, r.body.data.redirect_url, "4000000000000002");
    await sleep(9000);
    const st = (await group(g)).status;
    const shown = await page.locator("text=/declined|card was declined/i").count();
    note("E2", st === "pending_payment" ? "PASS" : "FAIL", `declined card: booking stays ${st}; Stripe's page shows a decline message: ${shown > 0}`);
    await page.close();
    globalThis.declined = { g, p: r.body.data.payment };
  } catch (e) {
    note("E2", "FAIL", String(e.message).slice(0, 240));
  }

  // E3: the player gives up on the card page; the slot is released when they leave checkout
  try {
    const g = await book();
    await start(g);
    const rel = await raw(`/bookings/group/${g}/release`, f.playerTok, "POST", {});
    const st = (await group(g)).status;
    note("E3", [200, 204].includes(rel.status) && st === "cancelled" ? "PASS" : "FAIL", `release ${rel.status}; booking ${st}`);
  } catch (e) {
    note("E3", "FAIL", String(e.message).slice(0, 240));
  }

  // E4: Stripe expires the session (the player never paid): the booking is cancelled by the webhook
  try {
    const g = await book();
    const r = await start(g);
    const txn = r.body.data.payment.gateway_transaction_id;
    const out = execFileSync("uv", ["run", "python", process.env.STRIPE_EXPIRE, txn], { cwd: "backend", stdio: "pipe" }).toString().trim();
    const cancelled = await waitFor(async () => (await group(g)).status === "cancelled");
    note("E4", cancelled ? "PASS" : "FAIL", `Stripe ${out}; booking ${(await group(g)).status} (webhook checkout.session.expired)`);
  } catch (e) {
    note("E4", "FAIL", String(e.message).slice(0, 240));
  }

  // E5: cancel the paid booking: a real Stripe test refund
  try {
    const { g, p } = globalThis.paid;
    const c = await raw(`/bookings/group/${g}/cancel`, f.playerTok, "POST", {});
    await sleep(2500);
    const row = sql(`select r.status::text, r.amount, r.gateway_attempts, coalesce(r.last_error,'') from refunds r where r.payment_id='${p.id}'`).trim();
    const done = /processed/.test(row);
    note("E5", c.status === 200 && done ? "PASS" : "FAIL", `cancel ${c.status}; refund row: ${row.slice(0, 160)}`);
  } catch (e) {
    note("E5", "FAIL", String(e.message).slice(0, 240));
  }

  await browser.close();
  fs.writeFileSync("docs/qa/stripe_e2e_results.json", JSON.stringify(results, null, 1));
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nPASS ${c("PASS")}  FAIL ${c("FAIL")}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
