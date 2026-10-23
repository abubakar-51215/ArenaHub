// The standard amenity list in a browser: the owner form's tick-box grid (web, 360/768/1024/1440, light and
// dark: no sideways scroll, every row at least 44 px on a phone, saved and read back), older typed text kept
// and removable, the phone's Filters "Must have" row (360/375/390/430: all 14, no sideways scroll, 44 px taps,
// several chosen at once give the server's own answer), and the arena page. Makes ONE small contact sheet of the
// owner grid and the filter row only. Scratch database, fake @example.com accounts only.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_amenities.mjs

import fs from "node:fs";
import path from "node:path";
import {
  MOBILE, OUT, WEB, allResults, api, chromium, dismissNearMe, finish, fixture, mobileLogin, newPage, record, sleep, sql, webLogin,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "amn1";
const SHOTS = path.join(OUT, "amenities");
fs.mkdirSync(SHOTS, { recursive: true });
const WANTED = [
  "Parking", "Floodlights", "Washrooms", "Changing room", "Drinking water", "Cafeteria", "Wi-Fi",
  "First aid", "Seating", "Shower", "Air conditioning", "Equipment rental", "CCTV", "Prayer area",
];
const cells = [];

async function sideways(page) {
  return page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
}

async function main() {
  const f = await fixture(TAG);
  // the fixture arena starts with Parking + CCTV, and one older typed word that is on no list
  await api(`/owner/arenas/${f.arenaId}`, f.ownerTok, { method: "PATCH", body: JSON.stringify({ amenities: ["parking", "cctv"] }) });
  sql(`UPDATE arenas SET extra_amenities = '["Sauna"]'::jsonb WHERE id = '${f.arenaId}'`);

  await sleep(65000); // the sign-in routes allow 20 a minute; the set-up above used most of them
  const browser = await chromium.launch();
  const login = await newPage(browser, { width: 1024, height: 900 }, "owner-login");
  await webLogin(login.page, f.owner);
  const state = await login.ctx.storageState();
  await login.ctx.close();

  // ---------------- owner form, web ----------------
  for (const scheme of ["light", "dark"]) {
    for (const width of [360, 768, 1024, 1440]) {
      await sleep(8000);
      const { page, ctx } = await newPage(browser, { width, height: 900, colorScheme: scheme, storageState: state }, `owner-form ${scheme}`);
      await ctx.addInitScript((v) => localStorage.setItem("ah-admin-theme", v), scheme);
      let err = null;
      try {
        await page.goto(WEB + "/owner/arenas", { waitUntil: "load" });
        await page.getByRole("button", { name: "Edit", exact: true }).first().click();
        const grid = page.getByRole("group", { name: "Amenities" });
        await grid.waitFor({ timeout: 30000 });
        await page.waitForTimeout(900); // the dialog zooms in; measure once it has settled
        const boxes = grid.locator("label");
        const n = await boxes.count();
        if (n !== 15) throw new Error(`expected 14 standard + 1 older box, got ${n}`);
        const names = (await boxes.allInnerTexts()).map((t) => t.trim());
        if (JSON.stringify(names.slice(0, 14)) !== JSON.stringify(WANTED)) throw new Error("the grid is not the standard list in order: " + names.join(","));
        if (names[14] !== "Sauna") throw new Error("the older word is not shown as a box");
        const ticked = await grid.locator("input:checked").count();
        if (ticked !== 3) throw new Error(`expected Parking, CCTV and Sauna ticked, got ${ticked}`);
        // sizes
        const small = await boxes.evaluateAll((els, min) => els.map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < min).length, width <= 430 ? 44 : 30);
        if (small) throw new Error(`${small} rows too short`);
        const lay = await sideways(page);
        const dialog = page.getByRole("dialog");
        const dw = await dialog.evaluate((el) => ({ s: el.scrollWidth, c: el.clientWidth }));
        if (lay.s > lay.c + 1 || dw.s > dw.c + 1) throw new Error(`sideways scroll page ${lay.s}>${lay.c}, dialog ${dw.s}>${dw.c}`);
        await grid.scrollIntoViewIfNeeded();
        if ((scheme === "light" && width === 360) || (scheme === "dark" && width === 1024)) {
          const file = path.join(SHOTS, `owner-grid-${scheme}-${width}.png`);
          await grid.screenshot({ path: file });
          cells.push({ file, caption: `Owner form, amenities @${width} ${scheme}` });
        }
      } catch (e) {
        err = e.message.split("\n")[0];
        await page.screenshot({ path: path.join(OUT, `FAIL-amenities-owner-${scheme}-${width}.png`) }).catch(() => {});
      }
      record(`Owner form amenity grid @${width} ${scheme}`, err ? "FAIL" : "PASS", "N/A", err ?? "14 standard in order + 1 older word, ticks right, no sideways scroll, rows tall enough");
      await ctx.close();
    }
  }

  // ---------------- owner form: tick, untick the older word, save, read back ----------------
  {
    await sleep(8000);
    const { page, ctx } = await newPage(browser, { width: 1024, height: 900, storageState: state }, "owner-save");
    let err = null;
    try {
      await page.goto(WEB + "/owner/arenas", { waitUntil: "load" });
      await page.getByRole("button", { name: "Edit", exact: true }).first().click();
      const grid = page.getByRole("group", { name: "Amenities" });
      await grid.waitFor({ timeout: 30000 });
      await grid.getByLabel("Floodlights", { exact: true }).check();
      await grid.getByLabel("Parking", { exact: true }).uncheck();
      await grid.getByLabel("Sauna", { exact: true }).click(); // the older word leaves the list once taken off
      await page.getByRole("button", { name: /save|update/i }).last().click();
      await page.waitForTimeout(3500);
      const got = await api(`/owner/arenas/${f.arenaId}`, f.ownerTok);
      const keys = got.amenities.map((a) => a.key).join(",");
      if (keys !== "floodlights,cctv") throw new Error("saved amenities are " + keys);
      if (got.extra_amenities.length) throw new Error("older word was not removed: " + got.extra_amenities);
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-amenities-save.png") }).catch(() => {});
    }
    record("Owner form: tick, untick, remove older word, save", err ? "FAIL" : "PASS", "N/A", err ?? "server kept floodlights + cctv, older word gone");
    await ctx.close();
  }
  // the server refuses a key that is not on the list
  {
    const bad = await api(`/owner/arenas/${f.arenaId}`, f.ownerTok, { method: "PATCH", raw: true, body: JSON.stringify({ amenities: ["jacuzzi"] }) });
    record("Server refuses a key that is not on the list", bad.status === 422 ? "PASS" : "FAIL", "N/A", `status ${bad.status}: ${bad.body.message}`);
  }
  // restore three for the phone checks
  await api(`/owner/arenas/${f.arenaId}`, f.ownerTok, { method: "PATCH", body: JSON.stringify({ amenities: ["parking", "floodlights", "cctv"], extra_amenities: [] }) });
  sql(`UPDATE arenas SET extra_amenities = '["Sauna"]'::jsonb WHERE id = '${f.arenaId}'`);

  // ---------------- the phone: filter row and arena page ----------------
  for (const scheme of ["light", "dark"]) {
    for (const width of [360, 375, 390, 430]) {
      await sleep(5000);
      const { page, ctx } = await newPage(browser, { width, height: 844, mobile: true, colorScheme: scheme }, `filters ${scheme}`);
      let err = null;
      try {
        await mobileLogin(page, f.player);
        await page.goto(MOBILE + "/filters", { waitUntil: "load" });
        await dismissNearMe(page);
        await page.getByText("Must have", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 25000 });
        const tags = WANTED.map((n) => page.getByRole("button", { name: n, exact: true }));
        for (const [i, t] of tags.entries()) if ((await t.count()) < 1) throw new Error(`no chip for ${WANTED[i]}`);
        const sizes = await Promise.all(tags.map((t) => t.first().boundingBox()));
        const tooSmall = sizes.map((b, i) => (b && b.height < 44 ? `${WANTED[i]} ${Math.round(b.width)}x${Math.round(b.height)}` : null)).filter(Boolean);
        if (tooSmall.length) throw new Error("tap target <44: " + tooSmall.slice(0, 3).join("; "));
        const lay = await sideways(page);
        if (lay.s > lay.c + 1) throw new Error(`sideways scroll ${lay.s}>${lay.c}`);
        if ((scheme === "light" && width === 390) || (scheme === "dark" && width === 360)) {
          await page.setViewportSize({ width, height: 1500 }); // tall, so the Show button does not sit on the chips
          await page.waitForTimeout(800);
          await page.getByText("Must have", { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(2500); // the splash has gone by now
          const head = await page.getByText("Must have", { exact: true }).filter({ visible: true }).first().boundingBox();
          const last = await tags[WANTED.length - 1].first().boundingBox();
          const file = path.join(SHOTS, `filter-row-${scheme}-${width}.png`);
          await page.screenshot({ path: file, clip: { x: 0, y: Math.max(0, head.y - 8), width, height: last.y + last.height - head.y + 16 } });
          cells.push({ file, caption: `Phone filter row @${width} ${scheme}` });
        }
      } catch (e) {
        err = e.message.split("\n")[0];
        await page.screenshot({ path: path.join(OUT, `FAIL-amenities-filter-${scheme}-${width}.png`) }).catch(() => {});
      }
      record(`Filters amenity row @${width} ${scheme}`, "N/A", err ? "FAIL" : "PASS", err ?? "all 14 chips, 44 px taps, no sideways scroll");
      await ctx.close();
    }
  }

  // several chosen: the screen's count equals the server's answer (Parking AND Floodlights)
  {
    await sleep(5000);
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "filters-several");
    let err = null;
    try {
      await mobileLogin(page, f.player);
      await page.goto(MOBILE + "/filters", { waitUntil: "load" });
      await dismissNearMe(page);
      await page.getByText("Must have", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 25000 });
      await page.getByRole("button", { name: "Parking", exact: true }).first().click();
      await page.getByRole("button", { name: "Floodlights", exact: true }).first().click();
      const serverCount = (await api(`/arenas?amenities=parking&amenities=floodlights&page_size=100`, f.playerTok)).total;
      const showing = page.getByRole("button", { name: /^Show \d+/ }).first();
      await showing.waitFor({ timeout: 20000 });
      const shown = Number(((await showing.innerText()).match(/\d+/) || [])[0]);
      if (shown !== serverCount) throw new Error(`screen says ${shown}, server says ${serverCount}`);
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-amenities-several.png") }).catch(() => {});
    }
    record("Filters: two amenities chosen together", "N/A", err ? "FAIL" : "PASS", err ?? "the count on the screen equals the server's (needs ALL)");
    await ctx.close();
  }

  // the arena page shows the standard ones with the older word as plain text
  {
    await sleep(5000);
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "arena-page");
    let err = null;
    try {
      await mobileLogin(page, f.player);
      await page.goto(MOBILE + `/arena/${f.arenaId}`, { waitUntil: "load" });
      await dismissNearMe(page);
      for (const t of ["What you get", "Parking", "Floodlights", "CCTV", "Sauna"]) {
        await page.getByText(t, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 25000 });
      }
      const lay = await sideways(page);
      if (lay.s > lay.c + 1) throw new Error(`sideways scroll ${lay.s}>${lay.c}`);
    } catch (e) {
      err = e.message.split("\n")[0];
      await page.screenshot({ path: path.join(OUT, "FAIL-amenities-arena.png") }).catch(() => {});
    }
    record("Arena page: standard amenities and older text", "N/A", err ? "FAIL" : "PASS", err ?? "Parking, Floodlights, CCTV and the older word Sauna shown");
    await ctx.close();
  }
  await browser.close();

  // ---------------- one small contact sheet ----------------
  const html = `<html><body style="margin:0;background:#f4f5f3;font:12px Arial,sans-serif;width:900px"><div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px;align-items:flex-start">
  ${cells.map((c) => `<div style="max-width:${c.file.includes("1024") ? 430 : 200}px"><img src="file:///${c.file.replace(/\\/g, "/")}" style="width:100%;border:1px solid #bbb;border-radius:6px"><div style="padding:3px 2px">${c.caption}</div></div>`).join("")}
  </div></body></html>`;
  const sheet = path.join(SHOTS, "sheet.html");
  fs.writeFileSync(sheet, html);
  const b2 = await chromium.launch();
  const p = await b2.newPage({ viewport: { width: 900, height: 500 } });
  await p.goto("file:///" + sheet.replace(/\\/g, "/"));
  await p.waitForTimeout(800);
  const out = path.join(OUT, "contact-sheet-amenities.png");
  await p.screenshot({ path: out, fullPage: true });
  await b2.close();
  console.log("CONTACT SHEET:", out, `(${cells.length} pieces)`);
  finish({ name: "amenities" });
  process.exit(allResults().some((r) => r.web === "FAIL" || r.mobile === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
