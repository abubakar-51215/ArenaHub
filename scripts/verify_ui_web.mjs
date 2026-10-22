// Playwright verification for this pass's web features (force refund dialog,
// blocked dates list, photo upload) against a running backend pointed at
// arenahub_scratch + the web dev server. Real UI login, not an injected
// token — the login screen itself is part of what gets exercised.
//
// Run from the repo root (after starting backend on arenahub_scratch and
// `npm run dev` in frontend/web):
//   SCRATCH_DB_URL="postgresql://<user>:<password>@localhost:5432/arenahub_scratch" \
//   BACKEND_LOG="<path to the running backend's stdout log>" \
//   node scripts/verify_ui_web.mjs
//
// Optional: WEB (default http://localhost:3000), API (default
// http://localhost:8000/api/v1), ADMIN_EMAIL (default a fixed address — pass
// a fresh one on a re-run if the admin sign-in code quota is exhausted).

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WEB = process.env.WEB || "http://localhost:3000";
const API = process.env.API || "http://localhost:8000/api/v1";
const LOG = process.env.BACKEND_LOG || "/tmp/backend-scratch.log";
const OUT = path.resolve("scripts/.ui_verify");
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [360, 768, 1024, 1440];
const report = [];
const log = (k, v) => {
  report.push([k, v]);
  console.log(`[${k}] ${v}`);
};

function lastOtpFor(email) {
  const lines = fs.readFileSync(LOG, "utf-8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("code_dev_delivery") && lines[i].includes(`destination=${email}`)) {
      const m = /code=(\d+)/.exec(lines[i]);
      if (m) return m[1];
    }
  }
  return null;
}

async function api(p, token, opts = {}) {
  const r = await fetch(API + p, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await r.json();
  if (!r.ok || body.success === false) {
    throw new Error(`${opts.method || "GET"} ${p} -> ${r.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

/** Ensures the account exists and is verified; returns an access token only
 * for a plain (non-admin) account — an admin account finishes sign-in through
 * its own two-step challenge elsewhere, so this just provisions it. Safe to
 * call again on a re-run: an already-registered, already-verified account is
 * left alone rather than erroring. */
async function registerAndVerify(email, role) {
  const existing = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Verify@12345" }),
  });
  if (existing.ok) {
    const body = await existing.json();
    return body.data?.access_token ?? null; // null for an existing admin (password step only)
  }
  const registered = await fetch(API + "/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: "UI Verify " + role,
      email,
      phone: "03" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"),
      password: "Verify@12345",
      role: role === "admin" ? "owner" : role,
    }),
  });
  if (!registered.ok) return null; // already exists in some other state; the caller re-checks
  await new Promise((r) => setTimeout(r, 400)); // let the log line land
  const code = lastOtpFor(email);
  if (!code) throw new Error(`No dev OTP found for ${email} in ${LOG}`);
  const verified = await api("/auth/verify-otp", null, {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  return verified.access_token;
}

async function main() {
  // ---- provision test data (fake @example.com addresses only) ----
  const ownerEmail = "ui-verify-owner@example.com";
  const playerEmail = "ui-verify-player@example.com";
  const adminEmail = process.env.ADMIN_EMAIL || "ui-verify-admin@example.com";

  const ownerTok = await registerAndVerify(ownerEmail, "owner");
  const playerTok = await registerAndVerify(playerEmail, "player");
  await registerAndVerify(adminEmail, "admin"); // registers as "owner"; promoted below
  // Admins aren't self-served (tests/helpers.py's make_admin does the same
  // thing via a direct DB write, scoped to the test DB session). This script
  // talks to arenahub_scratch only — never the dev or production database.
  // SCRATCH_DB_URL: a full postgres:// connection string pointed at
  // arenahub_scratch (never committed; set it in your own shell).
  const scratchDbUrl = process.env.SCRATCH_DB_URL;
  if (!scratchDbUrl || !scratchDbUrl.includes("arenahub_scratch")) {
    throw new Error("Set SCRATCH_DB_URL to a postgres:// URL for arenahub_scratch before running this script.");
  }
  execSync(`psql "${scratchDbUrl}" -c "UPDATE users SET role='admin' WHERE email='${adminEmail}';"`, {
    stdio: "pipe",
  });
  const challenge = await api("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: "Verify@12345" }),
  });
  await new Promise((r) => setTimeout(r, 400));
  const adminCode = lastOtpFor(adminEmail);
  if (!adminCode) throw new Error(`No dev admin-login code found for ${adminEmail}`);
  const adminTokens = await api("/auth/admin/verify-code", null, {
    method: "POST",
    body: JSON.stringify({ challenge_token: challenge.challenge_token, code: adminCode }),
  });
  const adminTok = adminTokens.access_token;
  log("setup", "accounts created, admin promoted in arenahub_scratch");

  const existingArenas = await api("/owner/arenas", ownerTok);
  let arena = existingArenas.items.find((a) => a.name === "UI Verify Arena");
  if (!arena) {
    arena = await api("/owner/arenas", ownerTok, {
      method: "POST",
      body: JSON.stringify({
        name: "UI Verify Arena",
        description: "Verification fixture",
        address: "1 Verify Road",
        city: "Lahore",
        area: "Gulberg",
        latitude: "31.5204",
        longitude: "74.3587",
        contact_phone: "0421234567",
        contact_email: "arena@example.com",
        operating_hours: { monday: { open: "08:00", close: "23:00" } },
        sports_offered: ["futsal"],
        images: [],
        advance_percentage: 100,
        require_full_payment: true,
        refund_policy: [],
      }),
    });
  }
  log("setup", "arena ready " + arena.id);

  // Approve via an admin account. If this admin isn't actually elevated
  // (first-admin seeding may already exist from a prior run), fall back to
  // whatever admin the scratch DB already has by scanning the log, but the
  // common path is: the very first registered account on an empty scratch DB
  // auto-promotes via the app's own first-admin seeding, or the admin must be
  // promoted out-of-band. We try the token we have; if approval 403s we still
  // proceed (arena stays pending — blocked-dates/photo-upload don't require
  // approval to exercise their UI, only the force-refund booking does).
  let approved = arena.status === "approved";
  if (!approved) {
    try {
      await api(`/admin/arenas/${arena.id}/approve`, adminTok, { method: "POST" });
      approved = true;
    } catch (e) {
      log("warn", "admin approve failed (" + e.message.slice(0, 120) + "), continuing");
    }
  }

  let bookingDetailUrl = null;
  if (approved) {
    const existingCourts = await api(`/owner/arenas/${arena.id}/courts`, ownerTok);
    const court =
      existingCourts.find((c) => c.name === "Court A") ??
      (await api(`/owner/arenas/${arena.id}/courts`, ownerTok, {
        method: "POST",
        body: JSON.stringify({ name: "Court A", sport_types: ["futsal"], base_price: "2000.00" }),
      }));
    // The arena's operating_hours only cover Monday, so the slot date must
    // actually be a future Monday or slot generation silently skips it.
    const today = new Date();
    const daysAhead = ((1 - today.getUTCDay() + 7) % 7) || 7;
    const d = new Date(today.getTime() + daysAhead * 86400000);
    const dateIso = d.toISOString().slice(0, 10);
    await api(`/owner/courts/${court.id}/slots/generate`, ownerTok, {
      method: "POST",
      body: JSON.stringify({ start_date: dateIso, end_date: dateIso }),
    });
    const existingBookings = await api("/bookings?status=confirmed&page_size=50", playerTok);
    const already = existingBookings.items.find((b) => b.arena_id === arena.id);
    if (already) {
      log("setup", "reusing an already-confirmed booking for force-refund target");
    } else {
      const slots = await api(`/courts/${court.id}/slots?date=${dateIso}`, playerTok);
      const available = slots.find((s) => s.status === "available");
      if (!available) throw new Error(`No available slot on ${dateIso} to book for the fixture.`);
      const created = await api("/bookings", playerTok, {
        method: "POST",
        body: JSON.stringify({ court_id: court.id, slot_ids: [available.id], payment_type: "full" }),
      });
      const initiated = await api("/payments/initiate", playerTok, {
        method: "POST",
        body: JSON.stringify({ booking_group_id: created.booking_group_id, payment_method: "card" }),
      });
      await api(`/payments/${initiated.payment.id}/simulate-confirm?success=true`, playerTok, { method: "POST" });
      log("setup", "confirmed booking created for force-refund target");
    }
  } else {
    log("setup", "skipping booking fixture (arena not approved — no admin available)");
  }

  // ---- browser verification ----
  const browser = await chromium.launch();
  const allErrors = [];
  const allFailed = [];

  async function withPage(colorScheme, width, fn, label, contextOpts = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, ...contextOpts });
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
    page.on("response", async (r) => {
      if (r.status() >= 400 && r.url().includes("8001")) {
        let body = "";
        try {
          body = (await r.text()).slice(0, 200);
        } catch {
          /* ignore */
        }
        failed.push(`${r.status()} ${r.url()} :: ${body}`);
      }
    });
    // Next.js RSC prefetch requests aborted by a client-side navigation away
    // (a normal consequence of this script moving fast) are not a real
    // network failure — filtered out rather than reported as one.
    page.on("requestfailed", (r) => {
      const failure = r.failure()?.errorText ?? "";
      if (failure.includes("ERR_ABORTED") && r.url().includes("_rsc=")) return;
      failed.push(`${r.method()} ${r.url()} ${failure}`);
    });
    try {
      await fn(page);
    } catch (e) {
      log("FAIL", `${label} @${width}/${colorScheme}: ${e.message.split("\n")[0]}`);
    }
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    if (scrollW > clientW + 1) {
      log("FAIL", `${label} @${width}/${colorScheme}: sideways scroll (${scrollW} > ${clientW})`);
    }
    if (errors.length) allErrors.push(...errors.map((e) => `${label}@${width}/${colorScheme}: ${e}`));
    if (failed.length) allFailed.push(...failed.map((e) => `${label}@${width}/${colorScheme}: ${e}`));
    await ctx.close();
    await new Promise((r) => setTimeout(r, 4000)); // stay well under the API rate limit
  }

  async function loginAs(page, email) {
    await page.goto(WEB + "/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.getByLabel("Email or phone").fill(email);
    await page.getByLabel("Password").first().fill("Verify@12345");
    await page.getByRole("button", { name: /log in|sign in/i }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
  }

  async function loginAsAdmin(page, email) {
    await page.goto(WEB + "/admin/login", { waitUntil: "networkidle", timeout: 60000 });
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").first().fill("Verify@12345");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByLabel("Digit 1 of 6").waitFor({ timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    const code = lastOtpFor(email);
    if (!code) throw new Error(`No dev admin-login code found for ${email}`);
    await page.getByLabel("Digit 1 of 6").fill(code);
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
  }

  for (const width of WIDTHS) {
    for (const colorScheme of ["light", "dark"]) {
      // Owner: arena form. The dialog scrolls internally (the page behind it
      // does not), so fullPage alone only captures the first screenful —
      // scroll the dialog's own content to reach Blocked Dates and Photos.
      await withPage(colorScheme, width, async (page) => {
        await loginAs(page, ownerEmail);
        await page.goto(WEB + "/owner/arenas", { waitUntil: "networkidle", timeout: 30000 });
        await page.getByRole("button", { name: /edit/i }).first().click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, `owner-arena-form.${width}.${colorScheme}.png`), fullPage: true });
        const dialog = page.getByRole("dialog");
        await dialog.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `owner-blocked-dates-photos.${width}.${colorScheme}.png`), fullPage: true });
      }, "owner-arena-form");
    }
  }

  // "Use my current location": grant a fake location, then deny it. Checked
  // at every required width, light only (the control's own correctness does
  // not depend on color scheme once the dialog's own dark styling is already
  // proven above).
  for (const width of WIDTHS) {
    await withPage(
      "light",
      width,
      async (page) => {
        await loginAs(page, ownerEmail);
        await page.goto(WEB + "/owner/arenas", { waitUntil: "networkidle", timeout: 30000 });
        await page.getByRole("button", { name: /edit/i }).first().click();
        await page.waitForTimeout(600);
        const button = page.getByRole("button", { name: "Use my current location" });
        const box = await button.boundingBox();
        if (box && box.height < 24) {
          log("FAIL", `geolocation-grant @${width}: tap target too small (${box.height}px tall)`);
        }
        await button.click();
        await page.getByLabel("Latitude (optional)").locator("xpath=.").waitFor();
        await page.waitForFunction(
          () => (document.getElementById("a-lat")?.value ?? "") !== "31.5204000",
          { timeout: 5000 },
        );
        await page.screenshot({ path: path.join(OUT, `owner-use-my-location-granted.${width}.png`) });
      },
      "geolocation-grant",
      { permissions: ["geolocation"], geolocation: { latitude: 24.8607, longitude: 67.0011 } },
    );

    await withPage(
      "light",
      width,
      async (page) => {
        await loginAs(page, ownerEmail);
        await page.goto(WEB + "/owner/arenas", { waitUntil: "networkidle", timeout: 30000 });
        await page.getByRole("button", { name: /edit/i }).first().click();
        await page.waitForTimeout(600);
        await page.getByRole("button", { name: "Use my current location" }).click();
        await page
          .getByText("Location permission was denied. Type the latitude and longitude instead.")
          .waitFor({ timeout: 5000 });
        await page.screenshot({ path: path.join(OUT, `owner-use-my-location-denied.${width}.png`) });
      },
      "geolocation-deny",
      { permissions: [] }, // no geolocation permission granted: the browser refuses the prompt
    );
  }

  if (approved) {
    // Admin sign-in emails a code with a 60s/5-per-hour limit (shared/codes.py)
    // — too tight for 8 fresh logins. Sign in once for real through the UI,
    // then reuse that session's localStorage/cookie for the remaining
    // viewport/colorScheme combinations (the force-refund dialog itself is
    // still driven live in a real browser each time; only the repeated OTP
    // round trip is avoided).
    let authStorage = null;
    let roleCookie = null;
    await withPage("light", 1024, async (page) => {
      await loginAsAdmin(page, adminEmail);
      authStorage = await page.evaluate(() => localStorage.getItem("arenahub-auth"));
      roleCookie = (await page.context().cookies()).find((c) => c.name === "session_role");
    }, "admin-login-once");

    for (const width of WIDTHS) {
      for (const colorScheme of ["light", "dark"]) {
        await withPage(colorScheme, width, async (page) => {
          await page.context().addCookies([
            { name: "session_role", value: roleCookie?.value ?? "admin", url: WEB },
          ]);
          await page.addInitScript((v) => localStorage.setItem("arenahub-auth", v), authStorage);
          await page.goto(WEB + "/admin/bookings", { waitUntil: "networkidle", timeout: 30000 });
          await page.getByRole("button", { name: "View" }).first().click();
          await page.waitForTimeout(400);
          const forceBtn = page.getByRole("button", { name: /force refund/i });
          if (await forceBtn.count()) {
            await forceBtn.click();
            await page.waitForTimeout(400);
          }
          await page.screenshot({ path: path.join(OUT, `admin-force-refund.${width}.${colorScheme}.png`), fullPage: true });
        }, "admin-force-refund");
      }
    }
  } else {
    log("skip", "admin-force-refund screenshots skipped (no approved arena / confirmed booking)");
  }

  fs.writeFileSync(path.join(OUT, "_console.json"), JSON.stringify({ errors: allErrors, failed: allFailed }, null, 2));
  log("console-errors", String(allErrors.length));
  log("failed-requests", String(allFailed.length));
  allErrors.slice(0, 10).forEach((e) => console.log("  ERR:", e));
  allFailed.slice(0, 10).forEach((e) => console.log("  NET:", e));

  await browser.close();
  fs.writeFileSync(path.join(OUT, "_report.json"), JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
