// Captures the 23 player-app screens at 390x844 @2x against a running
// `expo start --web` + dev backend, as the restyle's before/after reference.
// See scripts/README.md for the exact commands to start both first.
//
// Conventions (unchanged from the script that produced the original
// design/baselines/mobile/*.png, recovered from a prior session's scratchpad
// — see docs/RESTYLE_LOG.md "Harness"): real UI login as sara.khan (not a
// token injected into localStorage, so the login screen itself gets
// captured honestly), CORS headers injected via Playwright route
// interception rather than touching backend code (the dev backend only
// allows :3000 by default), and fixed fixture IDs that must already exist
// in the dev DB — run seed-fixtures.mjs first if they don't.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WEB = process.env.WEB || "http://localhost:8081";
const API = process.env.API || "http://127.0.0.1:8000/api/v1";
const OUT = process.argv[2] || path.resolve("../../design/baselines/mobile");
fs.mkdirSync(OUT, { recursive: true });

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
  return (await r.json()).data;
}

(async () => {
  const tok = (
    await api("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email: "sara.khan@example.com", password: "Player@1234" }),
    })
  ).access_token;

  // Fixed fixtures seeded via the real API (see scripts/seed-fixtures.mjs).
  // Re-run that script and update these IDs if the dev DB has been reset.
  const arena = { id: "3b7996ba-857c-43a6-9e03-af46fe498e8a" };
  const court = { id: "df172f75-88fe-4740-a8a4-fc799304c19c" };
  const slotDate = "2026-10-05";
  const slotsRaw = await api(`/courts/${court.id}/slots?date=${slotDate}`, tok);
  const pending = {
    booking_group_id: "f4215c85-7224-4504-a539-6d51c1b9197b",
    id: "07aa244f-6779-4682-9757-3c3c7e313bb4",
    total_amount: "2750.00",
    arena_id: arena.id,
  };
  const confirmed = { id: "c83f7417-9f2e-48aa-9d31-a893ef0107cc" };
  const matches = [{ id: "29ddcc8f-3424-4550-8767-469dc8d7116f" }];

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: false });
  // Dev backend only allows :3000 for CORS; native apps ignore CORS, so add
  // the headers in the harness instead of touching backend code.
  const CORS = {
    "access-control-allow-origin": WEB,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  await ctx.route(/localhost:8000/, async (route) => {
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
    if (r.status() === 404) failed.push(`404 ${r.url().slice(0, 140)}`);
    if (r.status() >= 400 && r.url().includes("8000")) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));

  async function shot(name, url, { wait = 1800, full = false } = {}) {
    try {
      if (url) await page.goto(WEB + url, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(wait);
      await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: full });
      log("shot", `${name} ${page.url().replace(WEB, "")}`);
    } catch (e) {
      log("FAIL", `${name}: ${e.message.split("\n")[0]}`);
    }
  }

  // --- unauthenticated ---
  await shot("01-login", "/login", { wait: 3000 });
  await shot("02-register", "/register");
  await shot("03-forgot-password", "/forgot-password");

  // --- real UI login ---
  await page.goto(WEB + "/login", { waitUntil: "networkidle", timeout: 90000 });
  await page.getByPlaceholder("you@example.com").fill("sara.khan@example.com");
  await page.getByPlaceholder("••••••••").fill("Player@1234");
  await page.getByText("Log In", { exact: true }).last().click();
  try {
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
    log("login", "UI login succeeded -> " + page.url().replace(WEB, ""));
  } catch {
    log("FAIL", "UI login did not leave /login");
  }
  await page.waitForTimeout(3000);

  await shot("04-home", null, { wait: 2500 });
  await shot("05-search", "/search");
  await shot("06-bookings", "/bookings");
  await shot("07-play", "/play");
  await shot("08-profile", "/profile");
  await shot("09-notifications", "/notifications");
  await shot("10-arena-details", `/arena/${arena.id}`, { wait: 2500 });
  await shot("11-reviews", `/arena/${arena.id}/reviews`);
  await shot("12-slots", `/court/${court.id}/slots?arenaId=${arena.id}`, { wait: 2500 });

  const avail = (slotsRaw || []).filter((x) => x.status === "available").slice(0, 1).map((x) => ({
    id: x.id,
    date: slotDate,
    start_time: x.start_time,
    end_time: x.end_time,
    price: x.price ?? x.effective_price ?? "1000",
  }));
  if (avail.length) {
    await shot("13-booking-summary", `/booking/${court.id}?arenaId=${arena.id}&slots=${encodeURIComponent(JSON.stringify(avail))}`, { wait: 2500 });
  }
  await shot("14-payment", `/payment/${pending.booking_group_id}?amount=${pending.total_amount}&arenaId=${pending.arena_id}&bookingId=${pending.id}`, { wait: 2500 });
  await shot("15-confirmation", `/booking/confirmation/${confirmed.id}`, { wait: 2500 });
  await shot("16-reschedule", `/booking/reschedule/${confirmed.id}`, { wait: 2500 });
  if (matches[0]) await shot("17-match-detail", `/play/${matches[0].id}`);
  await shot("18-play-create", "/play/create");
  await shot("19-profile-edit", "/profile/edit");
  await shot("20-profile-liked", "/profile/liked");
  await shot("21-profile-payments", "/profile/payments");
  await shot("22-profile-settings", "/profile/settings");
  await shot("23-profile-change-password", "/profile/change-password");

  fs.writeFileSync(path.join(OUT, "_console.json"), JSON.stringify({ errors, failed }, null, 2));
  log("console-errors", String(errors.length));
  log("failed-requests", String(failed.length));
  errors.slice(0, 8).forEach((e) => console.log("  ERR:", e));
  failed.slice(0, 8).forEach((e) => console.log("  NET:", e));
  await browser.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
