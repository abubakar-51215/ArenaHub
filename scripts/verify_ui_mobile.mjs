// Playwright verification for this pass's mobile features (View Pass, Get
// Directions, near-me) against a running `expo start --web` build and the
// backend on arenahub_scratch. Real UI login, same CORS-interception trick
// as frontend/mobile/scripts/capture-baselines.mjs (the dev backend only
// allows :3000 by default; native apps ignore CORS, so it's added in the
// harness rather than touching backend code).
//
// Run from the repo root:
//   SCRATCH_DB_URL="postgresql://<user>:<password>@localhost:5432/arenahub_scratch" \
//   BACKEND_LOG="<path to the running backend's stdout log>" \
//   WEB=http://localhost:8082 API=http://localhost:8001/api/v1 \
//   node scripts/verify_ui_mobile.mjs

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WEB = process.env.WEB || "http://localhost:8082";
const API = process.env.API || "http://localhost:8001/api/v1";
const OUT = path.resolve("scripts/.ui_verify");
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [360, 375, 390, 430];
const report = [];
const log = (k, v) => {
  report.push([k, v]);
  console.log(`[${k}] ${v}`);
};

async function api(p, token, opts = {}) {
  const r = await fetch(API + p, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await r.json();
  if (!r.ok || body.success === false) throw new Error(`${opts.method || "GET"} ${p} -> ${r.status}: ${JSON.stringify(body)}`);
  return body.data;
}

async function main() {
  const playerTok = (
    await api("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email: "ui-verify-player@example.com", password: "Verify@12345" }),
    })
  ).access_token;

  const bookings = await api("/bookings?status=confirmed&page_size=10", playerTok);
  const booking = bookings.items.find((b) => b.arena_id);
  if (!booking) throw new Error("No confirmed booking found for ui-verify-player@example.com.");
  log("setup", `using confirmed booking ${booking.id} (group ${booking.booking_group_id})`);

  const arenas = await api("/arenas?page_size=50", playerTok);
  const arena = arenas.items.find((a) => a.name === "UI Verify Arena");
  if (!arena) throw new Error('Arena "UI Verify Arena" not found via /arenas.');
  log("setup", `using arena ${arena.id}`);

  const allErrors = [];
  const allFailed = [];

  const CORS = {
    "access-control-allow-origin": WEB,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };

  // A fresh browser per page: the RN-web bundle is heavy enough that reusing
  // one browser across ~12 contexts in a row crashed the renderer partway
  // through a prior run. A clean process per check costs a little startup
  // time but is far more reliable.
  async function withPage(width, fn, label, contextOpts = {}) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, ...contextOpts });
    await ctx.route(new RegExp(API.replace(/^https?:\/\//, "").replace(".", "\\.")), async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const resp = await route.fetch();
      await route.fulfill({ response: resp, headers: { ...resp.headers(), ...CORS } });
    });
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes(API.replace(/^https?:\/\//, "").split("/")[0])) {
        failed.push(`${r.status()} ${r.url()}`);
      }
    });
    page.on("requestfailed", (r) => {
      const failure = r.failure()?.errorText ?? "";
      if (failure.includes("ERR_ABORTED")) return;
      failed.push(`${r.method()} ${r.url()} ${failure}`);
    });
    try {
      await fn(page);
    } catch (e) {
      log("FAIL", `${label} @${width}: ${e.message.split("\n")[0]}`);
    }
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    if (scrollW > clientW + 1) log("FAIL", `${label} @${width}: sideways scroll (${scrollW} > ${clientW})`);
    if (errors.length) allErrors.push(...errors.map((e) => `${label}@${width}: ${e}`));
    if (failed.length) allFailed.push(...failed.map((e) => `${label}@${width}: ${e}`));
    await ctx.close();
    await browser.close();
  }

  async function loginAsPlayer(page) {
    await page.goto(WEB + "/login", { waitUntil: "load", timeout: 60000 });
    await page.getByPlaceholder("Email or phone").fill("ui-verify-player@example.com");
    await page.getByPlaceholder("Password").fill("Verify@12345");
    await page.getByText("Log in", { exact: true }).last().click();
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissNearMePrompt(page);
  }

  // A fresh session (no saved "not now" for today) shows a modal "Find
  // arenas near you" prompt that blocks the whole screen until dismissed —
  // pre-existing app behavior, unrelated to this pass's features.
  async function dismissNearMePrompt(page) {
    const notNow = page.getByText("Not now", { exact: true });
    try {
      await notNow.waitFor({ timeout: 3000 });
      await notNow.click();
      await page.waitForTimeout(500);
    } catch {
      /* not shown this time */
    }
  }

  for (const width of WIDTHS) {
    // View Pass: booking detail -> View Pass button -> pass screen.
    await withPage(width, async (page) => {
      await loginAsPlayer(page);
      await page.goto(WEB + `/booking/detail/${booking.booking_group_id}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1500);
      await dismissNearMePrompt(page);
      const viewPass = page.getByText("View Pass", { exact: true });
      await viewPass.waitFor({ timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `mobile-booking-detail.${width}.png`) });
      await viewPass.scrollIntoViewIfNeeded();
      await viewPass.click({ timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `mobile-pass-screen.${width}.png`), fullPage: true });
    }, "view-pass");

    // Get Directions: arena page.
    await withPage(width, async (page) => {
      await loginAsPlayer(page);
      await page.goto(WEB + `/arena/${arena.id}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1500);
      await dismissNearMePrompt(page);
      const directions = page.getByText("Get Directions", { exact: true });
      await directions.waitFor({ timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `mobile-get-directions.${width}.png`) });
    }, "get-directions");

    // Near me: results screen, actually taking the "Use my location" path
    // with a granted fake location (Lahore, where the fixture arena is).
    await withPage(
      width,
      async (page) => {
        await loginAsPlayer(page);
        await page.goto(WEB + "/filters", { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(1500);
        const useLocation = page.getByText("Use my location", { exact: true });
        if (await useLocation.count()) {
          await useLocation.click();
          await page.waitForTimeout(2000);
        }
        const nearMeChip = page.getByText("Near me", { exact: true });
        await nearMeChip.waitFor({ timeout: 10000 });
        await nearMeChip.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `mobile-near-me-filters.${width}.png`) });
        await page.goto(WEB + "/results", { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(OUT, `mobile-near-me.${width}.png`) });
      },
      "near-me",
      { permissions: ["geolocation"], geolocation: { latitude: 31.5204, longitude: 74.3587 } },
    );
  }

  fs.writeFileSync(path.join(OUT, "_mobile_console.json"), JSON.stringify({ errors: allErrors, failed: allFailed }, null, 2));
  log("console-errors", String(allErrors.length));
  log("failed-requests", String(allFailed.length));
  allErrors.slice(0, 10).forEach((e) => console.log("  ERR:", e));
  allFailed.slice(0, 10).forEach((e) => console.log("  NET:", e));

  fs.writeFileSync(path.join(OUT, "_mobile_report.json"), JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
