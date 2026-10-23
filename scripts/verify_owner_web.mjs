// The owner web screens changed in this round (the dashboard's "Needs your attention" list and the
// Bookings table, which now show a balance receipt) at 360, 768, 1024 and 1440 px, light and dark:
// no sideways scroll, no cut-off text, no console errors, no failed requests. Scratch database.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_owner_web.mjs

import {
  WEB, allResults, api, chromium, finish, fixture, freeSlots, lastOtpFor, newPage, record, sleep, webLogin,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "ownv1";
const WIDTHS = [360, 768, 1024, 1440];
const RECEIPT = "/uploads/receipts/c898309f41b1f46378fc698549e1c592.jpg";

async function cutOffText(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const clips = ["hidden", "clip"].includes(style.overflowX);
      if (clips && el.scrollWidth > el.clientWidth + 2 && style.textOverflow !== "ellipsis" && el.children.length === 0 && (el.textContent || "").trim()) {
        bad.push(`${(el.textContent || "").trim().slice(0, 30)} (${el.scrollWidth}>${el.clientWidth})`);
      }
    }
    return bad.slice(0, 5);
  });
}

async function main() {
  const f = await fixture(TAG);
  await api(`/owner/arenas/${f.arenaId}/bank-details`, f.ownerTok, {
    method: "POST",
    body: JSON.stringify({ account_title: "Verify Owner", account_number: "PK36SCBL0000001123456702", bank_name: "Standard Chartered" }),
  });
  await sleep(400);
  await api(`/owner/arenas/${f.arenaId}/bank-details/verify`, f.ownerTok, { method: "POST", body: JSON.stringify({ code: lastOtpFor(f.owner) }) });
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  const made = await api("/bookings", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[0].id], payment_type: "advance" }),
  });
  const paid = await api("/payments/initiate", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_group_id: made.booking_group_id, payment_method: "card" }),
  });
  await api(`/payments/${paid.payment.id}/simulate-confirm?success=true`, f.playerTok, { method: "POST", body: "{}" });
  const balance = await api("/payments/initiate-balance", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_group_id: made.booking_group_id, payment_method: "bank_transfer" }),
  });
  await api(`/payments/${balance.payment.id}/receipt`, f.playerTok, { method: "POST", body: JSON.stringify({ receipt_proof_url: RECEIPT }) });

  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    // sign in once per theme and reuse that session, and pause between page loads: the API allows
    // 100 requests a minute from one address and a dashboard page makes many (the limit is not changed)
    const first = await newPage(browser, { width: 1024, height: 900 }, "owner-login");
    await webLogin(first.page, f.owner);
    const state = await first.ctx.storageState();
    await first.ctx.close();
    for (const width of WIDTHS) {
      for (const [name, route, text] of [
        ["dashboard", "/owner", "Balance receipt to review"],
        ["bookings", "/owner/bookings", "Balance receipt"],
      ]) {
        const { page, ctx } = await newPage(browser, { width, height: 900, storageState: state }, `owner-${name}-${scheme}`);
        await ctx.addInitScript((value) => {
          try {
            localStorage.setItem("ah-admin-theme", value);
          } catch {
            /* ignore */
          }
        }, scheme);
        let err = null;
        try {
          await page.goto(WEB + route, { waitUntil: "load", timeout: 30000 });
          await page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
          const themed = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
          if (scheme === "dark" && themed !== "dark") throw new Error("dark mode was not applied");
          const lay = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
          if (lay.s > lay.c + 1) throw new Error(`sideways scroll ${lay.s}>${lay.c}`);
          const cut = await cutOffText(page);
          if (cut.length) throw new Error(`cut-off text: ${cut.join("; ")}`);
        } catch (e) {
          err = e.message.split("\n")[0];
          await page.screenshot({ path: `scripts/.ui_verify/FAIL-owner-${name}-${scheme}-${width}.png` }).catch(() => {});
        }
        record(`Owner ${name} @${width} ${scheme}`, err ? "FAIL" : "PASS", "N/A", err ?? "balance receipt shown, no sideways scroll, no cut-off text");
        await ctx.close();
        await sleep(9000);
      }
    }
  }
  await browser.close();
  finish({ name: "owner-web" });
  process.exit(allResults().some((r) => r.web === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
