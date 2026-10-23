// Item 1 in a real browser: paying the balance of a confirmed booking on the mobile web build
// (JazzCash simulator and bank transfer with a receipt), the owner approving the receipt on the
// web, and the same screens at 360, 375, 390 and 430 px wide. Scratch database, fake accounts.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_balance.mjs

import fs from "node:fs";
import {
  MOBILE, WEB, api, chromium, dismissNearMe, finish, fixture, freeSlots, lastOtpFor, layout, mobileLogin,
  newPage, record, sleep, webLogin,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "balv1";
const WIDTHS = [360, 375, 390, 430];

async function confirmedAdvanceBooking(f, slot) {
  const made = await api("/bookings", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ court_id: f.courtId, slot_ids: [slot.id], payment_type: "advance" }),
  });
  const gid = made.booking_group_id;
  const paid = await api("/payments/initiate", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_group_id: gid, payment_method: "card" }),
  });
  await api(`/payments/${paid.payment.id}/simulate-confirm?success=true`, f.playerTok, { method: "POST", body: "{}" });
  return gid;
}

async function addBankAccount(f) {
  await api(`/owner/arenas/${f.arenaId}/bank-details`, f.ownerTok, {
    method: "POST",
    body: JSON.stringify({ account_title: "Verify Owner", account_number: "PK36SCBL0000001123456702", bank_name: "Standard Chartered" }),
  });
  await sleep(400);
  const code = lastOtpFor(f.owner);
  await api(`/owner/arenas/${f.arenaId}/bank-details/verify`, f.ownerTok, { method: "POST", body: JSON.stringify({ code }) });
}

async function see(page, text, timeout = 20000) {
  try {
    await page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor({ timeout });
  } catch {
    throw new Error(`never saw "${text}"`);
  }
}

async function step(name, fn, page) {
  try {
    await fn();
    return null;
  } catch (e) {
    if (page) {
      await page.screenshot({ path: `scripts/.ui_verify/FAIL-${name}.png` }).catch(() => {});
      const text = await page.locator("body").innerText().catch(() => "");
      console.log(`  [${name}] url=${page.url()} text=${text.replace(/\s+/g, " ").slice(0, 500)}`);
    }
    return `${name}: ${e.message.split("\n")[0]}`;
  }
}

async function main() {
  const f = await fixture(TAG);
  await addBankAccount(f);
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  const walletGroup = await confirmedAdvanceBooking(f, slots[0]);
  const bankGroup = await confirmedAdvanceBooking(f, slots[2]);
  const browser = await chromium.launch();

  // ---- the detail screen offers the button, at every phone width ----
  for (const width of process.env.SKIP_DETAIL ? [] : WIDTHS) {
    const { page, ctx } = await newPage(browser, { width, height: 844, mobile: true }, "balance-detail");
    const err = await step("detail", async () => {
      await mobileLogin(page, f.player);
      await page.goto(`${MOBILE}/booking/detail/${walletGroup}`, { waitUntil: "load", timeout: 30000 });
      await dismissNearMe(page);
      await see(page, "Pay balance", 15000);
      await see(page, "Balance to pay", 5000);
      const body = await page.locator("body").innerText();
      if (!body.includes("₨ 1,000")) throw new Error("the balance amount ₨ 1,000 is not shown");
      const lay = await layout(page);
      if (lay.sideways) throw new Error(`sideways scroll ${lay.scrollWidth}>${lay.clientWidth}`);
      if (lay.leak) throw new Error(`header shows a route name: ${lay.leak}`);
      if (lay.small.length) throw new Error(`tap targets under 44px: ${lay.small.slice(0, 4).join(", ")}`);
    });
    record(`Balance: detail screen @${width}`, "N/A", err ? "FAIL" : "PASS", err ?? "button, amount, no sideways scroll, no route name, taps >= 44px");
    await ctx.close();
  }

  // ---- pay with the JazzCash simulator ----
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "balance-wallet");
    const err = await step("wallet", async () => {
      await mobileLogin(page, f.player);
      await page.goto(`${MOBILE}/booking/detail/${walletGroup}`, { waitUntil: "load", timeout: 30000 });
      await dismissNearMe(page);
      await page.getByText("Pay balance", { exact: true }).click();
      await see(page, "How you will pay", 15000);
      const body = await page.locator("body").innerText();
      if (!body.includes("Balance to pay") || !body.includes("₨ 1,000")) throw new Error("fixed balance not shown");
      if (body.includes("Promo code")) throw new Error("promo code must not appear when paying a balance");
      const lay = await layout(page);
      if (lay.sideways || lay.leak) throw new Error(`layout ${JSON.stringify(lay).slice(0, 160)}`);
      await page.getByText("JazzCash", { exact: true }).first().click();
      await page.getByText("Pay ₨ 1,000", { exact: true }).click();
      await see(page, "Approve (development only)", 20000);
      await page.getByText("Approve (development only)", { exact: true }).click();
      await see(page, "Balance paid", 25000);
      if (await page.getByText("Pay balance", { exact: true }).count()) throw new Error("the button is still there after paying");
    }, page);
    record("Balance: pay by JazzCash simulator", "N/A", err ? "FAIL" : "PASS", err ?? "paid, 'Balance paid' shown, button gone");
    await ctx.close();
  }

  // ---- pay by bank transfer, the owner approves ----
  let receiptSent = false;
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "balance-bank");
    const err = await step("bank", async () => {
      await mobileLogin(page, f.player);
      await page.goto(`${MOBILE}/booking/detail/${bankGroup}`, { waitUntil: "load", timeout: 30000 });
      await dismissNearMe(page);
      await page.getByText("Pay balance", { exact: true }).click();
      await see(page, "How you will pay", 15000);
      await page.getByText("Bank transfer", { exact: true }).first().click();
      await page.getByText("Pay ₨ 1,000", { exact: true }).click();
      await see(page, "Your receipt", 20000);
      const body = await page.locator("body").innerText();
      if (!body.includes("Your balance is paid once the arena confirms your receipt")) throw new Error("balance note missing");
      if (!body.includes("₨ 1,000")) throw new Error("amount missing on the bank screen");
      const lay = await layout(page);
      if (lay.sideways || lay.leak) throw new Error(`layout ${JSON.stringify(lay).slice(0, 160)}`);
      // choose the receipt photo through the real file chooser
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Upload a photo", { exact: true }).click()]);
      await chooser.setFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
      await page.getByText("Send receipt", { exact: true }).click();
      await see(page, "Awaiting approval", 25000);
      const after = await page.locator("body").innerText();
      if (!after.includes("The arena is checking your balance payment")) throw new Error("waiting note missing");
      if (await page.getByText("Pay balance", { exact: true }).count()) throw new Error("button still offered while waiting");
      receiptSent = true;
    }, page);
    record("Balance: bank transfer receipt, waiting state", "N/A", err ? "FAIL" : "PASS", err ?? "receipt sent through the file chooser, 'Awaiting approval' shown, no button");
    await ctx.close();
  }

  // ---- the owner sees it on the web and approves ----
  if (receiptSent) {
    for (const width of [360, 768, 1024, 1440]) {
      const { page, ctx } = await newPage(browser, { width, height: 900 }, "balance-owner");
      const err = await step("owner", async () => {
        await webLogin(page, f.owner);
        await page.goto(WEB + "/owner/bookings", { waitUntil: "load", timeout: 30000 });
        await see(page, "Balance receipt", 20000);
        const lay = await layout(page, { minTap: 0 });
        if (lay.sideways) throw new Error(`sideways scroll ${lay.scrollWidth}>${lay.clientWidth}`);
        if (width === 1440) {
          await page.getByRole("button", { name: "Approve" }).first().click();
          await page.waitForTimeout(1500);
          const detail = await api(`/bookings/group/${bankGroup}`, f.playerTok);
          if (Number(detail.balance_due) !== 0) throw new Error(`balance still due: ${detail.balance_due}`);
        }
      });
      record(`Balance: owner bookings page @${width}`, err ? "FAIL" : "PASS", "N/A", err ?? "balance receipt row, buttons" + (width === 1440 ? ", approved, balance settled" : ""));
      await ctx.close();
    }
  }
  await browser.close();
  finish({ name: "balance" });
  const failed = (await import("./lib/verify-kit.mjs")).allResults().filter((r) => r.web === "FAIL" || r.mobile === "FAIL");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
