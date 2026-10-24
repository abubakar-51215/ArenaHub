// Owner single-slot management, the complaint status steps and the admin booking history, in a
// browser: 360/768/1024/1440, light and dark (no sideways scroll, 44 px taps on a phone), the real
// actions through the screens (block with a reason, unblock, edit price, delete, View booking; the
// complaint steps; the history pager for a player and an owner), and the phone's complaint screen.
// Makes ONE contact sheet of the new screens. Scratch database, fake @example.com accounts only.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_slots_complaints_history.mjs

import fs from "node:fs";
import path from "node:path";
import {
  MOBILE, OUT, PASSWORD, WEB, allResults, api, chromium, dismissNearMe, finish, fixture, freeSlots, lastOtpFor, layout, mobileLogin,
  newPage, record, registerAndVerify, sleep, sql, webLogin,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "scm1";
const SHOTS = path.join(OUT, "slots-complaints-history");
fs.mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [360, 768, 1024, 1440];
const cells = [];
const PAUSE = 8000; // the API allows 100 requests a minute; a dashboard page makes many

const fail = (m) => {
  throw new Error(m);
};

async function sideways(page) {
  return page.evaluate(() => {
    const d = document.querySelector("[role=dialog]");
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dlg: d ? d.scrollWidth - d.clientWidth : 0,
    };
  });
}

async function adminWebLogin(page, email) {
  await page.goto(WEB + "/admin/login", { waitUntil: "load", timeout: 40000 });
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByLabel("Digit 1 of 6").waitFor({ timeout: 20000 });
  await sleep(500);
  await page.getByLabel("Digit 1 of 6").fill(lastOtpFor(email) ?? "000000");
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
}

async function main() {
  const f = await fixture(TAG);
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  // six bookings by the player: the first is held (awaiting payment), the second is made "booked"
  const booked = [];
  for (let i = 0; i < 6; i++) {
    const made = await api("/bookings", f.playerTok, {
      method: "POST",
      body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[i].id], payment_type: "full" }),
    });
    booked.push(made);
  }
  sql(`UPDATE time_slots SET status='booked' WHERE id='${slots[1].id}'`);
  // slot 6 blocked through the real route; 7 is blocked and unblocked on screen, 8 re-priced, 9 deleted
  await api(`/owner/courts/${f.courtId}/slots/${slots[6].id}`, f.ownerTok, { method: "PATCH", body: JSON.stringify({ status: "maintenance" }) });
  // cancel the booking on slots[5] -> a free slot WITH booking history
  const hist = booked[5];
  await api(`/bookings/group/${hist.booking_group_id}/cancel`, f.playerTok, { method: "POST", body: JSON.stringify({}) });
  const complaint = await api("/complaints", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ category: "other", description: "The floodlights were off during my game." }),
  });
  const dateInput = f.date;
  const quiet = `${TAG}-quiet@example.com`;
  await registerAndVerify(quiet, "player", "Quiet");

  await sleep(65000); // sign-in routes allow 20 a minute; the set-up used most of them
  const browser = await chromium.launch();
  const ownerLogin = await newPage(browser, { width: 1024, height: 900 }, "owner-login");
  await webLogin(ownerLogin.page, f.owner);
  const ownerState = await ownerLogin.ctx.storageState();
  await ownerLogin.ctx.close();
  const adminLogin = await newPage(browser, { width: 1024, height: 900 }, "admin-login");
  await adminWebLogin(adminLogin.page, f.admin);
  const adminState = await adminLogin.ctx.storageState();
  await adminLogin.ctx.close();

  const open = async (width, scheme, state, label) => {
    await sleep(PAUSE);
    const made = await newPage(browser, { width, height: 1000, colorScheme: scheme, storageState: state }, label);
    await made.ctx.addInitScript((v) => localStorage.setItem("ah-admin-theme", v), scheme);
    return made;
  };

  // ============ 1. owner: the day's slots, every status, at every width, light and dark ============
  for (const scheme of ["light", "dark"]) {
    for (const width of WIDTHS) {
      const { page, ctx } = await open(width, scheme, ownerState, `slots ${scheme}`);
      let err = null;
      try {
        await page.goto(WEB + "/owner/courts", { waitUntil: "load" });
        await page.getByRole("button", { name: "Slots", exact: true }).first().click();
        const dlg = page.getByRole("dialog");
        await dlg.getByLabel("Day to view").fill(dateInput);
        await dlg.getByText("Free", { exact: true }).first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(900);
        for (const chip of ["Free", "Held", "Booked", "Blocked"]) {
          if ((await dlg.getByText(chip, { exact: true }).count()) < 1) fail(`no ${chip} chip`);
        }
        const rows = dlg.locator("li");
        const n = await rows.count();
        if (n < 8) fail(`expected the whole day, got ${n} rows`);
        const sw = await sideways(page);
        if (sw.doc > 1 || sw.dlg > 1) fail(`sideways scroll doc ${sw.doc} dialog ${sw.dlg}`);
        // every row action is a button of at least 44 px tall on a phone
        const heights = await rows.evaluateAll((els) =>
          els.flatMap((el) => Array.from(el.querySelectorAll("button, a")).map((b) => Math.round(b.getBoundingClientRect().height))),
        );
        if (width <= 430 && Math.min(...heights) < 44) fail(`a row button is ${Math.min(...heights)} px tall`);
        // the rows stack on a phone: time/price/chip first, buttons under them
        if (width === 360) {
          const stacked = await rows.first().evaluate((li) => getComputedStyle(li).flexDirection === "column");
          if (!stacked) fail("rows do not stack at 360 px");
        }
        // the right buttons for each status
        const rowFor = (chip) => rows.filter({ has: page.getByText(chip, { exact: true }) }).first();
        const names = async (r) => (await r.locator("button, a").allInnerTexts()).map((t) => t.trim());
        const free = await names(rowFor("Free"));
        if (JSON.stringify(free) !== JSON.stringify(["Block", "Edit price", "Delete"])) fail("Free row buttons: " + free);
        const blk = await names(rowFor("Blocked"));
        if (JSON.stringify(blk) !== JSON.stringify(["Unblock"])) fail("Blocked row buttons: " + blk);
        const held = await names(rowFor("Held"));
        if (held.length !== 0) fail("Held row has actions: " + held);
        const bk = await names(rowFor("Booked"));
        if (JSON.stringify(bk) !== JSON.stringify(["View booking"])) fail("Booked row buttons: " + bk);
        if (scheme === "light" && (width === 360 || width === 1024)) {
          const file = path.join(SHOTS, `slots-${width}.png`);
          await dlg.screenshot({ path: file });
          cells.push({ file, caption: `Owner: the day's slots, ${width} px` });
          await rowFor("Free").getByRole("button", { name: "Block" }).click();
          await page.getByRole("heading", { name: "Block this slot?" }).waitFor();
          await page.waitForTimeout(700);
          const file2 = path.join(SHOTS, `block-${width}.png`);
          await page.getByRole("dialog").last().screenshot({ path: file2 });
          cells.push({ file: file2, caption: `Owner: block a slot, ${width} px` });
          const sw2 = await sideways(page);
          if (sw2.doc > 1) fail("sideways scroll with the block dialog open");
        }
      } catch (e) {
        err = e.message.split("\n")[0];
        await page.screenshot({ path: path.join(OUT, `FAIL-slots-${scheme}-${width}.png`) }).catch(() => {});
      }
      record(`Owner slots ${scheme} ${width}`, err ? "FAIL" : "PASS", "N/A", err ?? "all four statuses, right buttons, no sideways scroll");
      await ctx.close();
    }
  }

  // ============ 2. owner: the real actions through the screen ============
  {
    const { page, ctx } = await open(1024, "light", ownerState, "slot-actions");
    let err = null;
    const get = () => api(`/owner/courts/${f.courtId}/slots?date=${dateInput}`, f.ownerTok);
    try {
      await page.goto(WEB + "/owner/courts", { waitUntil: "load" });
      await page.getByRole("button", { name: "Slots", exact: true }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("Day to view").fill(dateInput);
      await dlg.getByText("Free", { exact: true }).first().waitFor({ timeout: 30000 });
      const rowOf = (startsWith) =>
        dlg.locator("li").filter({ hasText: new RegExp("(?:^|\\s)" + startsWith) }).first();
      const startText = (s) => {
        const [h, m] = s.start_time.split(":").map(Number);
        return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} –`;
      };
      // block slot 3 with a reason
      await rowOf(startText(slots[7])).getByRole("button", { name: "Block" }).click();
      await page.getByLabel("Reason (optional)").fill("Pitch repair");
      await page.getByRole("button", { name: "Block slot" }).click();
      await page.getByRole("heading", { name: "Block this slot?" }).waitFor({ state: "hidden", timeout: 15000 });
      let now = (await get()).find((s) => s.id === slots[7].id);
      if (now.status !== "maintenance") fail("block did not stick: " + now.status);
      // the player's own list no longer has it, and a booking is refused
      const pub = await api(`/courts/${f.courtId}/slots?date=${dateInput}`, f.playerTok);
      if (pub.some((s) => s.id === slots[7].id)) fail("a blocked slot is still listed for players");
      const tryBook = await api("/bookings", f.playerTok, {
        method: "POST", raw: true,
        body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[7].id], payment_type: "full" }),
      });
      if (tryBook.status < 400) fail("a blocked slot could be booked");
      // unblock it from the screen
      await rowOf(startText(slots[7])).getByRole("button", { name: "Unblock" }).click();
      await page.waitForFunction(() => !document.body.innerText.includes("Pitch repair"), null, { timeout: 5000 }).catch(() => {});
      await sleep(1200);
      now = (await get()).find((s) => s.id === slots[7].id);
      if (now.status !== "available") fail("unblock did not stick: " + now.status);
      // edit the price of slot 4
      await rowOf(startText(slots[8])).getByRole("button", { name: "Edit price" }).click();
      await page.getByLabel("New price (Rs.)").fill("2750");
      await page.getByRole("button", { name: "Save price" }).click();
      await page.getByRole("heading", { name: "Edit the price" }).waitFor({ state: "hidden", timeout: 15000 });
      const after = await get();
      if (after.find((s) => s.id === slots[8].id).price !== "2750.00") fail("price not saved");
      if (after.find((s) => s.id === slots[10].id).price !== "2000.00") fail("another slot's price moved");
      const bookingRow = await api(`/bookings/${booked[0].id ?? ""}`, f.playerTok, { raw: true }).catch(() => ({ status: 0 }));
      void bookingRow;
      // delete slot 7
      await rowOf(startText(slots[9])).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Delete slot" }).click();
      await page.getByRole("heading", { name: "Delete this slot?" }).waitFor({ state: "hidden", timeout: 15000 });
      if ((await get()).some((s) => s.id === slots[9].id)) fail("delete did not remove the slot");
      // a free slot that has booking history cannot be deleted: the server's words show in the dialog
      await rowOf(startText(slots[5])).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Delete slot" }).click();
      await page.getByText("Only a free slot that never had a booking can be deleted.").waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Cancel" }).click();
      // View booking goes to that day's bookings
      await dlg.getByRole("link", { name: "View booking" }).first().click();
      await page.waitForURL(new RegExp(`/owner/bookings\\?from=${dateInput}&to=${dateInput}`), { timeout: 20000 });
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-slot-actions.png") }).catch(() => {});
    }
    record("Owner slot actions through the screen", err ? "FAIL" : "PASS", "N/A", err ?? "block+reason, unblock, edit price, delete, refused delete, View booking");
    await ctx.close();
  }

  // ============ 3. admin: complaint steps ============
  for (const scheme of ["light", "dark"]) {
    for (const width of WIDTHS) {
      const { page, ctx } = await open(width, scheme, adminState, `complaint ${scheme}`);
      let err = null;
      try {
        await page.goto(WEB + "/admin/complaints", { waitUntil: "load" });
        await page.getByRole("button", { name: "Open", exact: true }).first().click();
        const dlg = page.getByRole("dialog");
        const group = dlg.getByRole("group", { name: "Status" });
        await group.waitFor({ timeout: 30000 });
        await page.waitForTimeout(800);
        const sw = await sideways(page);
        if (sw.doc > 1 || sw.dlg > 1) fail(`sideways scroll doc ${sw.doc} dialog ${sw.dlg}`);
        const labels = (await group.getByRole("button").allInnerTexts()).map((t) => t.trim());
        if (JSON.stringify(labels) !== JSON.stringify(["Open", "Under review", "Resolved"])) fail("steps: " + labels);
        if (width <= 430) {
          const h = await group.getByRole("button").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
          if (Math.min(...h) < 44) fail(`a step button is ${Math.min(...h)} px tall`);
        }
        if (scheme === "light" && (width === 360 || width === 1024)) {
          const file = path.join(SHOTS, `complaint-${width}.png`);
          await dlg.screenshot({ path: file });
          cells.push({ file, caption: `Admin: complaint steps (Open), ${width} px` });
        }
      } catch (e) {
        err = e.message.split("\n")[0];
        await page.screenshot({ path: path.join(OUT, `FAIL-complaint-${scheme}-${width}.png`) }).catch(() => {});
      }
      record(`Admin complaint steps ${scheme} ${width}`, err ? "FAIL" : "PASS", "N/A", err ?? "three steps, no sideways scroll");
      await ctx.close();
    }
  }
  {
    // the real moves through the screen, then the player's side by the API
    const { page, ctx } = await open(1024, "light", adminState, "complaint-moves");
    let err = null;
    try {
      await page.goto(WEB + "/admin/complaints", { waitUntil: "load" });
      await page.getByRole("button", { name: "Open", exact: true }).first().click();
      const group = page.getByRole("dialog").getByRole("group", { name: "Status" });
      await group.waitFor({ timeout: 30000 });
      const state = async () => ({
        open: await group.getByRole("button", { name: "Open", exact: true }).isDisabled(),
        review: await group.getByRole("button", { name: "Under review" }).isDisabled(),
        done: await group.getByRole("button", { name: "Resolved" }).isDisabled(),
      });
      await group.getByRole("button", { name: "Under review" }).click();
      await page.waitForFunction(() => document.querySelector('[role=dialog] [aria-pressed=true]')?.textContent === "Under review", null, { timeout: 15000 });
      let st = await state();
      if (!(st.review && !st.open && !st.done)) fail("after Under review: " + JSON.stringify(st));
      const mine = await api(`/complaints/${complaint.id}`, f.playerTok);
      if (mine.status !== "under_review") fail("the player does not see Under review: " + mine.status);
      await group.getByRole("button", { name: "Open", exact: true }).click(); // back
      await page.waitForFunction(() => document.querySelector('[role=dialog] [aria-pressed=true]')?.textContent === "Open", null, { timeout: 15000 });
      await group.getByRole("button", { name: "Under review" }).click();
      await page.waitForFunction(() => document.querySelector('[role=dialog] [aria-pressed=true]')?.textContent === "Under review", null, { timeout: 15000 });
      await group.getByRole("button", { name: "Resolved" }).click();
      await page.waitForFunction(() => document.querySelector('[role=dialog] [aria-pressed=true]')?.textContent === "Resolved", null, { timeout: 15000 });
      st = await state();
      if (!(st.open && st.review && st.done)) fail("a resolved complaint still offers a move: " + JSON.stringify(st));
      const notices = (await api("/notifications", f.playerTok)).items.filter((n) => n.event === "complaint_status");
      if (notices.length !== 4) fail(`expected 4 status notices, got ${notices.length}`);
      await page.keyboard.press("Escape");
      await page.locator(".ah-badge", { hasText: "Resolved" }).first().waitFor({ timeout: 10000 });
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-complaint-moves.png") }).catch(() => {});
    }
    record("Admin complaint moves through the screen", err ? "FAIL" : "PASS", "N/A", err ?? "Under review, back to Open, Under review, Resolved; 4 notices; resolved is final");
    await ctx.close();
  }

  // ============ 4. admin: booking history for a player and an owner ============
  for (const [who, route, email] of [["player", "/admin/users", f.player], ["owner", "/admin/owners", f.owner]]) {
    for (const scheme of ["light", "dark"]) {
      for (const width of WIDTHS) {
        const { page, ctx } = await open(width, scheme, adminState, `history ${who} ${scheme}`);
        let err = null;
        try {
          await page.goto(WEB + route + "?search=" + encodeURIComponent(email), { waitUntil: "load" });
          await page.getByRole("button", { name: "View", exact: true }).first().click();
          const dlg = page.getByRole("dialog");
          await dlg.getByRole("heading", { name: who === "owner" ? "Bookings received" : "Booking history" }).waitFor({ timeout: 30000 });
          await dlg.locator("li").first().waitFor({ timeout: 20000 });
          await page.waitForTimeout(800);
          const rows = await dlg.locator("section li").count();
          if (rows !== 5) fail(`expected a page of 5 rows, got ${rows}`);
          const text = await dlg.innerText();
          if (who === "owner" && (!text.includes("Arenas:") || !text.includes("Verify Arena"))) fail("the owner's arenas are not shown");
          if (who === "owner" && !/· Verify\b/.test(text)) fail("the booker's first name is not shown");
          if (who === "owner" && text.includes(f.player)) fail("the booker's email is shown");
          const sw = await sideways(page);
          if (sw.doc > 1 || sw.dlg > 1) fail(`sideways scroll doc ${sw.doc} dialog ${sw.dlg}`);
          if (scheme === "light" && (width === 360 || width === 1024) && who === "player") {
            const file = path.join(SHOTS, `history-${width}.png`);
            await dlg.screenshot({ path: file });
            cells.push({ file, caption: `Admin: player booking history, ${width} px` });
          }
          // the pager: the next page has the last booking
          const next = dlg.getByRole("button", { name: "Next page" });
          if (width <= 430) {
            const h = await dlg.locator("[data-pager] button").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
            if (h.length && Math.min(...h) < 44) fail(`a pager button is ${Math.min(...h)} px tall`);
          }
          if (scheme === "light" && width === 1024) {
            await next.click();
            await page.waitForFunction(() => document.querySelectorAll("[role=dialog] section li").length === 1, null, { timeout: 15000 });
          }
        } catch (e) {
          err = e.message.split("\n")[0];
          await page.screenshot({ path: path.join(OUT, `FAIL-history-${who}-${scheme}-${width}.png`) }).catch(() => {});
        }
        record(`Admin ${who} booking history ${scheme} ${width}`, err ? "FAIL" : "PASS", "N/A", err ?? "5 rows, pager, no sideways scroll");
        await ctx.close();
      }
    }
  }
  // empty state: a player with no bookings
  {
    const { page, ctx } = await open(360, "light", adminState, "history-empty");
    let err = null;
    try {
      await page.goto(WEB + "/admin/users?search=" + encodeURIComponent(quiet), { waitUntil: "load" });
      await page.getByRole("button", { name: "View", exact: true }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.getByText("No bookings yet.").waitFor({ timeout: 30000 });
      const sw = await sideways(page);
      if (sw.doc > 1 || sw.dlg > 1) fail("sideways scroll");
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-history-empty.png") }).catch(() => {});
    }
    record("Admin booking history: empty state", err ? "FAIL" : "PASS", "N/A", err ?? "No bookings yet.");
    await ctx.close();
  }
  await browser.close();

  // ============ 5. the phone's complaint screen ============
  try {
    const b2 = await chromium.launch();
    const { page, ctx } = await newPage(b2, { width: 390, height: 900, mobile: true }, "mobile-complaint");
    let err = null;
    try {
      await mobileLogin(page, f.player);
      await page.goto(MOBILE + "/support/" + complaint.id, { waitUntil: "load" });
      await page.getByText("Resolved", { exact: true }).first().waitFor({ timeout: 40000 });
      const lay = await layout(page);
      if (lay.sideways) fail("sideways scroll on the phone");
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-mobile-complaint.png") }).catch(() => {});
    }
    record("Phone: the complaint shows its status", "N/A", err ? "FAIL" : "PASS", err ?? "Resolved chip");
    await ctx.close();
    await b2.close();
  } catch (e) {
    record("Phone: the complaint shows its status", "N/A", "FAIL", e.message.split("\n")[0]);
  }

  // ============ the one contact sheet ============
  const order = ["slots-360", "slots-1024", "block-360", "block-1024", "complaint-360", "complaint-1024", "history-360", "history-1024"];
  cells.sort((a, b) => order.findIndex((o) => a.file.includes(o)) - order.findIndex((o) => b.file.includes(o)));
  const html = `<html><body style="margin:0;background:#f4f5f3;font:12px Arial,sans-serif;width:900px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px;align-items:start">
  ${cells.map((c) => `<div><img src="file:///${c.file.replace(/\\/g, "/")}" style="width:100%;border:1px solid #bbb;border-radius:6px"><div style="padding:3px 2px">${c.caption}</div></div>`).join("")}
  </div></body></html>`;
  const sheet = path.join(SHOTS, "sheet.html");
  fs.writeFileSync(sheet, html);
  const b3 = await chromium.launch();
  const p = await b3.newPage({ viewport: { width: 900, height: 500 } });
  await p.goto("file:///" + sheet.replace(/\\/g, "/"));
  await p.waitForTimeout(800);
  const out = path.join(OUT, "contact-sheet-slots-complaints-history.png");
  await p.screenshot({ path: out, fullPage: true });
  await b3.close();
  console.log("CONTACT SHEET:", out, `(${cells.length} pieces)`);
  finish({ name: "slots-complaints-history" });
  process.exit(allResults().some((r) => r.web === "FAIL" || r.mobile === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
