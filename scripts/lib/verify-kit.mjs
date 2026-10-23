// Shared helpers for the browser verification scripts: fake @example.com accounts on the
// scratch database, real OTPs read from the backend's dev log, a scratch arena with slots, and
// browser pages that count console errors, failed requests, sideways scroll and raw route names
// in headers. Nothing here talks to a real service or a real mailbox.
//
// Needed in the environment:
//   BACKEND_LOG  the scratch backend's log file (the dev OTP lines are read from it)
//   SQL_RUNNER   a python file that runs the SQL given as its argument on arenahub_scratch
//   API / WEB / MOBILE  the three dev servers (defaults below)

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const WEB = process.env.WEB || "http://localhost:3000";
export const MOBILE = process.env.MOBILE || "http://localhost:8082";
export const API = process.env.API || "http://localhost:8001/api/v1";
export const LOG = process.env.BACKEND_LOG;
export const OUT = path.resolve("scripts/.ui_verify");
fs.mkdirSync(OUT, { recursive: true });
export const PASSWORD = "Verify@12345";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sql(text) {
  if (!process.env.SQL_RUNNER) throw new Error("Set SQL_RUNNER to the scratch SQL helper.");
  return execFileSync("uv", ["run", "python", process.env.SQL_RUNNER, text], {
    cwd: path.resolve("backend"),
    stdio: "pipe",
  }).toString();
}

export function lastOtpFor(email) {
  const lines = fs.readFileSync(LOG, "utf-8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("code_dev_delivery") && lines[i].includes(`destination=${email}`)) {
      const m = /code=(\d+)/.exec(lines[i]);
      if (m) return m[1];
    }
  }
  return null;
}

// /auth/* has a tight request budget (20 a minute); every call to it paces itself.
export async function api(p, token, opts = {}) {
  const r = await fetch(API + p, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body;
  try {
    body = await r.json();
  } catch {
    body = {};
  }
  if (p.startsWith("/auth/")) await sleep(3200);
  if (opts.raw) return { status: r.status, body };
  if (!r.ok || body.success === false) {
    throw new Error(`${opts.method || "GET"} ${p} -> ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.data;
}

export async function registerAndVerify(email, role, tag) {
  const existing = await api("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
    raw: true,
  });
  if (existing.status === 200 && existing.body.data?.access_token) return existing.body.data.access_token;
  const phone = "03" + String(100000000 + Math.floor(Math.random() * 800000000));
  await api("/auth/register", null, {
    method: "POST",
    body: JSON.stringify({
      full_name: `Verify ${tag}`,
      email,
      phone,
      password: PASSWORD,
      role: role === "admin" ? "owner" : role,
    }),
  });
  await sleep(400);
  const code = lastOtpFor(email);
  if (!code) throw new Error(`No dev OTP found for ${email}`);
  const verified = await api("/auth/verify-otp", null, { method: "POST", body: JSON.stringify({ email, code }) });
  return verified.access_token;
}

export async function adminToken(email) {
  await registerAndVerify(email, "admin", "Admin");
  sql(`UPDATE users SET role='admin' WHERE email='${email}'`);
  const challenge = await api("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  await sleep(400);
  const code = lastOtpFor(email);
  const done = await api("/auth/admin/verify-code", null, {
    method: "POST",
    body: JSON.stringify({ challenge_token: challenge.challenge_token, code }),
  });
  return done.access_token;
}

/** An owner, a player, an admin, an approved arena with one court and slots on a day a few days ahead. */
export async function fixture(tag, { advance = 50, policy = [{ hours_before: 24, refund_percentage: 100 }] } = {}) {
  const owner = `${tag}-owner@example.com`;
  const player = `${tag}-player@example.com`;
  const admin = `${tag}-admin@example.com`;
  const ownerTok = await registerAndVerify(owner, "owner", "Owner");
  const playerTok = await registerAndVerify(player, "player", "Player");
  const adminTok = await adminToken(admin);
  const allWeek = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "08:00", close: "23:59" }]),
  );
  const arena = await api("/owner/arenas", ownerTok, {
    method: "POST",
    body: JSON.stringify({
      name: `Verify Arena ${tag}`,
      description: "Verification fixture",
      address: "1 Verify Road",
      city: "Lahore",
      area: "Gulberg",
      latitude: "31.5204",
      longitude: "74.3587",
      contact_phone: "0421234567",
      contact_email: "arena@example.com",
      operating_hours: allWeek,
      sports_offered: ["futsal"],
      images: [],
      amenity_ids: [],
      advance_percentage: advance,
      require_full_payment: advance >= 100,
      refund_policy: policy,
    }),
  });
  await api(`/admin/arenas/${arena.id}/approve`, adminTok, { method: "POST" });
  const court = await api(`/owner/arenas/${arena.id}/courts`, ownerTok, {
    method: "POST",
    body: JSON.stringify({ name: "Court A", sport_types: ["futsal"], base_price: "2000.00" }),
  });
  const d = new Date(Date.now() + 4 * 86400000);
  const date = d.toISOString().slice(0, 10);
  await api(`/owner/courts/${court.id}/slots/generate`, ownerTok, {
    method: "POST",
    body: JSON.stringify({ start_date: date, end_date: date }),
  });
  return { owner, player, admin, ownerTok, playerTok, adminTok, arenaId: arena.id, courtId: court.id, date };
}

/** One more approved arena (one court, slots on the fixture's day) for the fixture's owner. */
export async function makeArena(f, { name, hours, advance = 50, lat = "31.5204", lon = "74.3587" }) {
  const allWeek = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, hours || { open: "08:00", close: "23:59" }]),
  );
  const arena = await api("/owner/arenas", f.ownerTok, {
    method: "POST",
    body: JSON.stringify({
      name,
      description: "Verification fixture",
      address: "2 Verify Road",
      city: "Lahore",
      area: "Gulberg",
      latitude: lat,
      longitude: lon,
      contact_phone: "0421234567",
      contact_email: "arena@example.com",
      operating_hours: allWeek,
      sports_offered: ["futsal"],
      images: [],
      amenity_ids: [],
      advance_percentage: advance,
      require_full_payment: advance >= 100,
      refund_policy: [{ hours_before: 24, refund_percentage: 100 }],
    }),
  });
  await api(`/admin/arenas/${arena.id}/approve`, f.adminTok, { method: "POST" });
  const court = await api(`/owner/arenas/${arena.id}/courts`, f.ownerTok, {
    method: "POST",
    body: JSON.stringify({ name: "Court A", sport_types: ["futsal"], base_price: "2000.00" }),
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const day of [today, f.date]) {
    await api(`/owner/courts/${court.id}/slots/generate`, f.ownerTok, {
      method: "POST",
      body: JSON.stringify({ start_date: day, end_date: day }),
    }).catch(() => {});
  }
  return { arenaId: arena.id, courtId: court.id };
}

export async function freeSlots(courtId, date, token) {
  const slots = await api(`/courts/${courtId}/slots?date=${date}`, token);
  return slots.filter((s) => s.status === "available");
}

// ---- browser pages --------------------------------------------------------------------------

const results = [];
export function record(item, web, mobile, note = "") {
  results.push({ item, web, mobile, note });
  console.log(`[${web ?? "-"}/${mobile ?? "-"}] ${item}${note ? " -- " + note : ""}`);
}
export const allResults = () => results;
export const consoleErrors = [];
export const failedRequests = [];

/** A new page. Mobile pages get the CORS answer the Expo web dev server needs for the API. */
export async function newPage(browser, { width, height = 900, mobile = false, ...ctxOpts }, label) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...ctxOpts });
  if (mobile) {
    const CORS = {
      "access-control-allow-origin": MOBILE,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    // On the web the app decides it is online by sending HEAD / to its own server and wanting a
    // 200; the Expo dev server answers that with an error, which shows "You are offline" and
    // pauses every refetch. A real phone (or a hosted build) does not have this problem.
    await ctx.route(MOBILE + "/", (route) =>
      route.request().method() === "HEAD" ? route.fulfill({ status: 200 }) : route.continue(),
    );
    await ctx.route(new RegExp(API.replace(/^https?:\/\//, "").replace(/\./g, "\\.")), async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const resp = await route.fetch();
      await route.fulfill({ response: resp, headers: { ...resp.headers(), ...CORS } });
    });
  }
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // a 4xx the test itself provoked is reported by the test, not as a page error
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    consoleErrors.push(`${label}@${width}: ${text.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`${label}@${width}: pageerror ${e.message.slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    const failure = r.failure()?.errorText ?? "";
    if (failure.includes("ERR_ABORTED")) return;
    failedRequests.push(`${label}@${width}: ${r.method()} ${r.url()} ${failure}`);
  });
  return { page, ctx };
}

/** Sideways scroll, a raw route name in a header, and tap targets under 44 px, as plain numbers/text. */
export async function layout(page, { minTap = 44 } = {}) {
  return page.evaluate((minTapSize) => {
    const doc = document.documentElement;
    const heads = Array.from(document.querySelectorAll("h1,h2,header,[role=heading]"));
    const leak = heads.map((h) => h.textContent || "").find((t) => t.includes("[") || t.includes("/")) || null;
    const small = [];
    for (const el of document.querySelectorAll("button,a[href],[role=button],input,select,textarea")) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
      if (r.bottom < 0 || r.top > window.innerHeight * 6) continue;
      if (r.width < minTapSize || r.height < minTapSize) {
        small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return { sideways: doc.scrollWidth > doc.clientWidth + 1, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, leak, small };
  }, minTap);
}

export async function dismissNearMe(page) {
  try {
    const notNow = page.getByText("Not now", { exact: true });
    await notNow.waitFor({ timeout: 2500 });
    await notNow.click();
    await page.waitForTimeout(300);
  } catch {
    /* not shown */
  }
}

export async function mobileLogin(page, email, password = PASSWORD) {
  await page.goto(MOBILE + "/login", { waitUntil: "load", timeout: 40000 });
  await page.getByPlaceholder("Email or phone").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByText("Log in", { exact: true }).last().click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 25000 });
  await page.waitForTimeout(1200);
  await dismissNearMe(page);
}

export async function webLogin(page, email, password = PASSWORD) {
  await page.goto(WEB + "/login", { waitUntil: "load", timeout: 40000 });
  await page.getByLabel("Email or phone").fill(email);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
}

export function finish(extra = {}) {
  fs.writeFileSync(path.join(OUT, `_${extra.name || "run"}_results.json`), JSON.stringify(results, null, 2));
  fs.writeFileSync(
    path.join(OUT, `_${extra.name || "run"}_console.json`),
    JSON.stringify({ errors: consoleErrors, failed: failedRequests }, null, 2),
  );
  console.log("\n=== RESULTS ===");
  for (const r of results) console.log(`${r.item.padEnd(46)} | web: ${String(r.web).padEnd(6)} | mobile: ${String(r.mobile).padEnd(6)} | ${r.note}`);
  console.log(`\nconsole errors: ${consoleErrors.length}, failed requests: ${failedRequests.length}`);
  for (const e of consoleErrors) console.log("  ERR", e);
  for (const f of failedRequests) console.log("  REQ", f);
}

export { chromium };
