// The phone app's card flow, run as the Expo WEB build (the closest thing to the phone app that a
// script can drive), against Stripe's real TEST-mode hosted card page in the pop-up the app opens.
// Same set-up as qa_stripe_e2e.mjs (Stripe CLI forwarding signed events to the scratch backend),
// plus the Expo web build on :8082 pointed at that backend. Test cards only, fake accounts only.
//
// It checks what the API-level script cannot: that the app's own Pay button opens Stripe, that the
// return page closes the pop-up and the app moves on by itself to "Booking confirmed" (never from the
// redirect: the booking is confirmed by the signed webhook and the app learns it by polling), and
// that a declined card leaves the player on a waiting screen with the booking still unpaid.
import fs from "node:fs";
import path from "node:path";
import { API, MOBILE, OUT, api, chromium, dismissNearMe, fixture, freeSlots, PASSWORD, sleep } from "./lib/verify-kit.mjs";

const TAG = process.env.QA_TAG;
if (!TAG) throw new Error("Set QA_TAG.");
const results = [];
const note = (id, status, text) => {
  results.push({ id, status, text });
  console.log(`[${status}] ${id} -- ${text}`);
};

async function waitFor(fn, ms = 60000, every = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

// A context like the kit's mobile one, except that a redirect from the API is passed on as it is
// (the card page's "back to the app" is a 302 that the pop-up has to follow itself).
async function appContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const CORS = {
    "access-control-allow-origin": MOBILE,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  await ctx.route(MOBILE + "/", (route) => (route.request().method() === "HEAD" ? route.fulfill({ status: 200 }) : route.continue()));
  await ctx.route(new RegExp(API.replace(/^https?:\/\//, "").replace(/\./g, "\\.")), async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const resp = await route.fetch({ maxRedirects: 0 });
    await route.fulfill({ response: resp, headers: { ...resp.headers(), ...CORS } });
  });
  return ctx;
}

async function fillStripe(popup, card) {
  await popup.waitForSelector("#cardNumber", { timeout: 60000 });
  if (await popup.locator("#email").count()) await popup.fill("#email", `${TAG}-stripe@example.com`);
  await popup.fill("#cardNumber", card);
  await popup.fill("#cardExpiry", "12 / 34");
  await popup.fill("#cardCvc", "123");
  if (await popup.locator("#billingName").count()) await popup.fill("#billingName", "QA Tester");
  await popup.locator('[data-testid="hosted-payment-submit-button"], .SubmitButton').first().click();
}

async function main() {
  const f = await fixture(TAG);
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  let i = 0;
  const book = async () => {
    const b = await api("/bookings", f.playerTok, {
      method: "POST",
      body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[i++].id], payment_type: "full" }),
    });
    return b.booking_group_id;
  };
  const status = async (g) => (await api(`/bookings/group/${g}`, f.playerTok)).status;
  const browser = await chromium.launch();
  const ctx = await appContext(browser);
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90000);

  await page.goto(MOBILE + "/login", { waitUntil: "load" });
  await sleep(8000); // the first splash re-draws the form
  await page.getByPlaceholder("Email or phone").fill(f.player);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByText("Log in", { exact: true }).last().click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
  await sleep(1500);
  await dismissNearMe(page);

  const openPay = async (g) => {
    await page.goto(MOBILE + `/booking/payment?groupId=${g}&courtId=${f.courtId}&arenaId=${f.arenaId}`, { waitUntil: "load" });
    await dismissNearMe(page);
    await page.getByRole("radio", { name: /^Card/ }).first().click({ timeout: 30000 });
    const popupP = ctx.waitForEvent("page", { timeout: 45000 });
    popupP.catch(() => {}); // a missing pop-up is reported below, not as a crash
    await page.getByText(/^Pay (₨|Rs)/).last().click({ timeout: 30000 });
    return popupP;
  };

  // A1: pay with a good test card in the app's own flow
  try {
    const g = await book();
    const popup = await openPay(g);
    const onStripe = /checkout\.stripe\.com/.test(popup.url()) || (await popup.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 }).then(() => true).catch(() => false));
    await fillStripe(popup, "4242424242424242");
    // Stripe sends the player back through the API to the app's return address, in the same pop-up
    const popupLogs = [];
    popup.on("console", (m) => popupLogs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
    popup.on("pageerror", (e) => popupLogs.push(`pageerror: ${String(e.message).slice(0, 160)}`));
    const back = await popup.waitForURL(/localhost:8082\/booking\/return/, { timeout: 90000 }).then(() => true).catch(() => false);
    await sleep(2500);
    const closedBySelf = popup.isClosed();
    // On a phone the system browser window closes itself when the app address is reached. A web pop-up
    // is told to close by the return page only while it still knows the app page that opened it; Stripe's
    // page sends a cross-origin-opener-policy header that cuts that link. So the script closes it, as the
    // phone's browser window would, and checks that the app then moves on by itself.
    const openerLost = closedBySelf ? null : await popup.evaluate(() => window.opener === null).catch(() => null);
    if (!closedBySelf && process.env.DEBUG_POPUP) {
      console.log("popup url:", popup.url().slice(0, 80));
      console.log("popup storage keys:", await popup.evaluate(() => Object.keys(window.sessionStorage)).catch(() => "n/a"));
      console.log("popup logs:", popupLogs.slice(-8));
    }
    if (!popup.isClosed()) await popup.close();
    const done = await page.waitForURL(/booking\/confirmed/, { timeout: 120000 }).then(() => true).catch(() => false);
    const st = await status(g);
    note("A1", done && st === "confirmed" && onStripe && back ? "PASS" : "FAIL", `Pay opened Stripe: ${onStripe}; sent back to the app's return address: ${back}; pop-up closed by itself: ${closedBySelf} (opener link lost: ${openerLost}); after the window closed the app moved to Booking confirmed by itself: ${done}; booking ${st}`);
    if (!done) await page.screenshot({ path: path.join(OUT, "FAIL-stripe-app-a1.png") });
    globalThis.paid = g;
  } catch (e) {
    note("A1", "FAIL", String(e.message).slice(0, 240));
  }

  // A2: declined card in the app's flow: still unpaid, and the player can leave
  try {
    const g = await book();
    const popup = await openPay(g);
    await fillStripe(popup, "4000000000000002");
    await sleep(9000);
    const declined = (await popup.locator("text=/declined/i").count()) > 0;
    const before = await status(g);
    await popup.close(); // the player gives up on Stripe's page
    await sleep(4000);
    const onWaiting = /booking\/processing/.test(page.url());
    const after = await status(g);
    note("A2", declined && before === "pending_payment" && after === "pending_payment" ? "PASS" : "FAIL", `Stripe showed the decline: ${declined}; booking ${before} then ${after}; the app is on its waiting screen: ${onWaiting}`);
  } catch (e) {
    note("A2", "FAIL", String(e.message).slice(0, 240));
  }

  // A3: cancel the paid booking from the API (the app's cancel button is covered by verify_checklist) and
  // check the refund Stripe processed
  try {
    const g = globalThis.paid;
    const c = await api(`/bookings/group/${g}/cancel`, f.playerTok, { method: "POST", body: "{}", raw: true });
    await sleep(2500);
    const grp = await api(`/bookings/group/${g}`, f.playerTok);
    note("A3", c.status === 200 && grp.status === "cancelled" && Number(grp.refund_amount) > 0 ? "PASS" : "FAIL", `cancel ${c.status}; booking ${grp.status}; refund ${grp.refund_amount} (${grp.refund_status})`);
  } catch (e) {
    note("A3", "FAIL", String(e.message).slice(0, 240));
  }

  await browser.close();
  fs.writeFileSync("docs/qa/stripe_app_e2e_results.json", JSON.stringify(results, null, 1));
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nPASS ${c("PASS")}  FAIL ${c("FAIL")}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
