// One contact sheet (about 900 px wide) of the screens that are brand new in this round and nothing
// else: balance pay states, the Filters sheet with its three new rows (empty, selected, location
// off) and the photo options sheet. Scratch database, fake accounts.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/contact_sheet_new_screens.mjs

import fs from "node:fs";
import path from "node:path";
import {
  MOBILE, OUT, api, chromium, dismissNearMe, fixture, freeSlots, lastOtpFor, mobileLogin, newPage, sleep, sql,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "ctsv1";
const SHOTS = path.join(OUT, "contact");
fs.mkdirSync(SHOTS, { recursive: true });
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const shots = [];

async function shot(page, name, caption) {
  await page.waitForTimeout(1800);
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push({ file, caption });
}

async function advanceBooking(f, slot) {
  const made = await api("/bookings", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ court_id: f.courtId, slot_ids: [slot.id], payment_type: "advance" }),
  });
  const paid = await api("/payments/initiate", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_group_id: made.booking_group_id, payment_method: "card" }),
  });
  await api(`/payments/${paid.payment.id}/simulate-confirm?success=true`, f.playerTok, { method: "POST", body: "{}" });
  return made.booking_group_id;
}

async function main() {
  const f = await fixture(TAG);
  await api(`/owner/arenas/${f.arenaId}/bank-details`, f.ownerTok, {
    method: "POST",
    body: JSON.stringify({ account_title: "Verify Owner", account_number: "PK36SCBL0000001123456702", bank_name: "Standard Chartered" }),
  });
  await sleep(400);
  await api(`/owner/arenas/${f.arenaId}/bank-details/verify`, f.ownerTok, { method: "POST", body: JSON.stringify({ code: lastOtpFor(f.owner) }) });
  sql("INSERT INTO amenities (id, name) VALUES (gen_random_uuid(), 'Parking'), (gen_random_uuid(), 'Floodlights'), (gen_random_uuid(), 'Changing room') ON CONFLICT (name) DO NOTHING");
  sql(`INSERT INTO arena_amenities (arena_id, amenity_id) SELECT '${f.arenaId}', id FROM amenities ON CONFLICT DO NOTHING`);
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  const owing = await advanceBooking(f, slots[0]); // balance 1000 owed
  const toPay = await advanceBooking(f, slots[2]); // paid during the run
  const waiting = await advanceBooking(f, slots[4]); // bank receipt sent, waiting for the owner

  const browser = await chromium.launch();
  const open = async (opts = {}) => {
    const made = await newPage(browser, { width: 390, height: 844, mobile: true, ...opts }, "contact");
    await mobileLogin(made.page, f.player);
    return made;
  };

  // ---- balance states ----
  {
    const { page, ctx } = await open();
    await page.goto(`${MOBILE}/booking/detail/${owing}`, { waitUntil: "load", timeout: 30000 });
    await dismissNearMe(page);
    await page.getByText("Pay balance", { exact: true }).waitFor({ timeout: 15000 });
    await shot(page, "01-balance-due", "Booking: balance due, Pay balance");
    await page.getByText("Pay balance", { exact: true }).click();
    await page.getByText("How you will pay", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await page.getByText("Bank transfer", { exact: true }).first().click();
    await shot(page, "02-balance-pay", "Pay balance: amount fixed");
    await page.getByText("Pay ₨ 1,000", { exact: true }).click();
    await page.getByText("Your receipt", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
    await shot(page, "03-balance-bank", "Balance by bank transfer");
    await page.getByText("Upload a photo", { exact: true }).click();
    await page.getByText("Add a photo", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 10000 });
    await shot(page, "09-photo-options", "Photo options (receipt, profile)");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose from gallery", exact: true }).filter({ visible: true }).first().click(),
    ]);
    await chooser.setFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await page.getByText("Send receipt", { exact: true }).click();
    await page.getByText("Awaiting approval", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 25000 });
    await shot(page, "04-balance-waiting", "Balance: waiting for owner approval");
    await ctx.close();
  }
  {
    const { page, ctx } = await open();
    await page.goto(`${MOBILE}/booking/detail/${toPay}`, { waitUntil: "load", timeout: 30000 });
    await dismissNearMe(page);
    await page.getByText("Pay balance", { exact: true }).click();
    await page.getByText("JazzCash", { exact: true }).first().click();
    await page.getByText("Pay ₨ 1,000", { exact: true }).click();
    await page.getByText("Approve (development only)", { exact: true }).waitFor({ timeout: 20000 });
    await page.getByText("Approve (development only)", { exact: true }).click();
    await page.getByText("Balance paid", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 25000 });
    await shot(page, "05-balance-paid", "Balance paid, button gone");
    await ctx.close();
  }
  void waiting;

  // ---- filters: empty (location on), selected, location off ----
  {
    const { page, ctx } = await open({ permissions: ["geolocation"], geolocation: { latitude: 31.5204, longitude: 74.3587 } });
    await page.goto(`${MOBILE}/results`, { waitUntil: "load", timeout: 30000 });
    await dismissNearMe(page);
    await page.getByRole("button", { name: "Filters", exact: true }).first().click();
    await page.getByText("Must have", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Near me", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="2 km"]')?.getAttribute("aria-disabled") !== "true", null, { timeout: 20000 });
    await page.getByText("Time of day", { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
    await shot(page, "06-filters-empty", "Filters: new rows, nothing chosen");
    await page.getByRole("button", { name: "5 km", exact: true }).click();
    await page.getByRole("button", { name: "Evening", exact: true }).click();
    await page.getByRole("button", { name: "Parking", exact: true }).click();
    await page.getByRole("button", { name: "Floodlights", exact: true }).click();
    await shot(page, "07-filters-selected", "Filters: 5 km, Evening, two must-haves");
    await ctx.close();
  }
  {
    const { page, ctx } = await open();
    await page.goto(`${MOBILE}/results`, { waitUntil: "load", timeout: 30000 });
    await dismissNearMe(page);
    await page.getByRole("button", { name: "Filters", exact: true }).first().click();
    await page.getByText("Must have", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await shot(page, "08-filters-location-off", "Filters: How far greyed out, location off");
    await ctx.close();
  }
  await browser.close();

  // ---- the sheet ----
  const cols = 4;
  const cell = 214;
  const html = `<html><body style="margin:0;background:#f4f5f3;font:12px Arial,sans-serif;width:900px">
  <div style="display:grid;grid-template-columns:repeat(${cols},${cell}px);gap:10px;padding:10px">
  ${shots
    .map(
      (s) => `<div><img src="file:///${s.file.replace(/\\/g, "/")}" style="width:${cell}px;border:1px solid #bbb;border-radius:6px"><div style="padding:4px 2px;color:#222">${s.caption}</div></div>`,
    )
    .join("")}
  </div></body></html>`;
  const sheetPage = path.join(SHOTS, "sheet.html");
  fs.writeFileSync(sheetPage, html);
  const b2 = await chromium.launch();
  const p = await b2.newPage({ viewport: { width: 900, height: 600 } });
  await p.goto("file:///" + sheetPage.replace(/\\/g, "/"));
  await p.waitForTimeout(800);
  const out = path.join(OUT, "contact-sheet-new-screens.png");
  await p.screenshot({ path: out, fullPage: true });
  await b2.close();
  console.log("CONTACT SHEET:", out, `(${shots.length} screens)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
