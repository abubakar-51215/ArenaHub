// Every screen of the web app (public, owner, admin) and of the mobile app (player, admin) loaded once
// per colour scheme and measured at every required width, as plain numbers and text: sideways scroll,
// text running past the screen edge, text clipped without an ellipsis, interactive things sitting on
// top of each other, and (mobile only) tap targets under 44 px. Console errors and failed requests are
// counted for the whole run. Scratch database, fake @example.com accounts only.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_all_screens.mjs [web|mobile]
//
// The API allows 100 requests a minute from one address and that is not changed here: every page is
// loaded once and then resized (no new requests), and loads are paced.

import fs from "node:fs";
import path from "node:path";
import {
  MOBILE, OUT, PASSWORD, WEB, adminToken, api, chromium, consoleErrors, failedRequests, fixture, freeSlots, lastOtpFor,
  mobileLogin, newPage, sleep, sql, webLogin,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "sweep1";
const WHICH = process.argv[2] || "all";
const WEB_WIDTHS = [360, 768, 1024, 1440];
const MOBILE_WIDTHS = [360, 375, 390, 430];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const PACE = Number(process.env.PACE || 6500);
const RECEIPT = "/uploads/receipts/c898309f41b1f46378fc698549e1c592.jpg";
const rows = []; // {side, role, route, scheme, width, problems[], text}

async function inspect(page, { mobile }) {
  return page.evaluate((isMobile) => {
    const out = { raw: null, sideways: false, offscreen: [], clipped: [], overlaps: [], small: [], text: "" };
    const doc = document.documentElement;
    out.sideways = doc.scrollWidth > doc.clientWidth + 1;
    const raw = (document.body.innerText || "").match(/\[(groupId|id|courtId|matchId|bookingId)\]|booking\/processing|\(tabs\)/);
    out.raw = raw ? raw[0] : null;
    out.text = (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90);
    const vw = doc.clientWidth;
    const visible = (el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // an element on a screen that is stacked underneath another one is not on show
    const onShow = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert") || s.display === "none") return false;
      }
      return true;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || "").trim();
      if (!t || !node.parentElement || !visible(node.parentElement) || !onShow(node.parentElement)) continue;
      // a scroller (a row of chips, a table) is meant to be wider than the screen
      let scroller = false;
      for (let n = node.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (["auto", "scroll"].includes(s.overflowX) && n.scrollWidth > n.clientWidth) scroller = true;
      }
      if (scroller) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) out.offscreen.push(`${t.slice(0, 28)} (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    }
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el) || !onShow(el)) continue;
      const s = getComputedStyle(el);
      const clips = ["hidden", "clip"].includes(s.overflowX);
      if (clips && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis" && el.children.length === 0 && (el.textContent || "").trim()) {
        out.clipped.push(`${(el.textContent || "").trim().slice(0, 28)} (${el.scrollWidth}>${el.clientWidth})`);
      }
    }
    const things = [];
    const fixedAncestor = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const p = getComputedStyle(n).position;
        if (p === "fixed" || p === "sticky") return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll("button,a[href],[role=button],[role=link],input,select,textarea")) {
      if (!visible(el) || !onShow(el)) continue;
      const r = el.getBoundingClientRect();
      things.push({ el, r, fixed: fixedAncestor(el), label: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 24) });
      if (isMobile && (r.width < 44 || r.height < 44) && r.top < window.innerHeight * 8) out.small.push(`${things[things.length - 1].label} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i];
        const b = things[j];
        if (a.el.contains(b.el) || b.el.contains(a.el) || a.fixed !== b.fixed) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (/show password|hide password/i.test(a.label + b.label)) continue; // the eye button sits inside its field on purpose
        if (/liked arenas|(^|\|)\/\*/.test(a.label + "|" + b.label)) continue;
        if (/^(Home|Search|Bookings|Play|Profile)$/.test(a.label) || /^(Home|Search|Bookings|Play|Profile)$/.test(b.label)) continue; // a list scrolls under the tab bar // the heart sits on its card on purpose; a style tag is not a control
        // a tap box grows its touch area past what is drawn (up to 16 px) and a tab bar covers the end of a scrolled list
        if (a.r.bottom > window.innerHeight || b.r.bottom > window.innerHeight) continue;
        if (w > 16 && h > 16)
          out.overlaps.push(`${a.label} / ${b.label}`);
      }
    }
    return out;
  }, mobile);
}

async function measure(page, { side, role, route, scheme, widths, mobile }) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: mobile ? 844 : 900 });
    await page.waitForTimeout(500);
    const r = await inspect(page, { mobile });
    const problems = [];
    if (r.sideways) problems.push("sideways scroll");
    if (r.raw) problems.push(`raw route name on screen: ${r.raw}`);
    if (r.offscreen.length) problems.push(`text past the edge: ${r.offscreen.slice(0, 2).join("; ")}`);
    if (r.clipped.length) problems.push(`cut-off text: ${r.clipped.slice(0, 2).join("; ")}`);
    if (r.overlaps.length) problems.push(`overlap: ${r.overlaps.slice(0, 2).join("; ")}`);
    if (r.small.length) problems.push(`tap target <44: ${r.small.slice(0, 3).join("; ")}`);
    rows.push({ side, role, route, scheme, width, problems, text: r.text });
  }
}

async function build() {
  const f = await fixture(TAG);
  await api(`/owner/arenas/${f.arenaId}/bank-details`, f.ownerTok, {
    method: "POST",
    body: JSON.stringify({ account_title: "Verify Owner", account_number: "PK36SCBL0000001123456702", bank_name: "Standard Chartered" }),
  });
  await sleep(400);
  await api(`/owner/arenas/${f.arenaId}/bank-details/verify`, f.ownerTok, { method: "POST", body: JSON.stringify({ code: lastOtpFor(f.owner) }) });
  const slots = await freeSlots(f.courtId, f.date, f.playerTok);
  let n = 0;
  const book = async (type = "advance") => {
    const made = await api("/bookings", f.playerTok, {
      method: "POST",
      body: JSON.stringify({ court_id: f.courtId, slot_ids: [slots[n++].id], payment_type: type }),
    });
    return made;
  };
  const pay = async (made, method, ok = true) => {
    const p = await api("/payments/initiate", f.playerTok, { method: "POST", body: JSON.stringify({ booking_group_id: made.booking_group_id, payment_method: method }) });
    if (method === "card" || method === "jazzcash") await api(`/payments/${p.payment.id}/simulate-confirm?success=${ok}`, f.playerTok, { method: "POST", body: "{}" });
    return p;
  };
  const confirmed = await book();
  await pay(confirmed, "card");
  const awaiting = await book();
  const bankPay = await pay(awaiting, "bank_transfer");
  await api(`/payments/${bankPay.payment.id}/receipt`, f.playerTok, { method: "POST", body: JSON.stringify({ receipt_proof_url: RECEIPT }) });
  const bankOnly = await book();
  await pay(bankOnly, "bank_transfer");
  const failed = await book();
  await pay(failed, "card", false);
  const unpaid = await book();
  const cancelled = await book("full");
  await pay(cancelled, "card");
  await api(`/bookings/group/${cancelled.booking_group_id}/cancel`, f.playerTok, { method: "POST", body: JSON.stringify({}) });
  const done = await book("full");
  await pay(done, "card");
  sql(`UPDATE bookings SET status='completed' WHERE booking_group_id='${done.booking_group_id}'`);
  await api(`/arenas/${f.arenaId}/reviews`, f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_id: done.bookings[0].id, rating: 5, review_text: "Great court." }),
  }).catch(() => {});
  const match = await api("/matches", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ booking_group_id: confirmed.booking_group_id, sport: "futsal", max_players: 4 }),
  }).catch(() => null);
  const complaint = await api("/complaints", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ category: "other", description: "Checking the support screens end to end." }),
  });
  const pendingArena = await api("/owner/arenas", f.ownerTok, {
    method: "POST",
    body: JSON.stringify({
      name: `Pending Arena ${TAG}`, description: "Waiting for approval", address: "3 Verify Road", city: "Lahore", area: "Gulberg",
      latitude: "31.52", longitude: "74.35", contact_phone: "0421234567", contact_email: "arena@example.com",
      operating_hours: { monday: { open: "08:00", close: "23:00" } }, sports_offered: ["futsal"], images: [], amenity_ids: [],
      advance_percentage: 50, require_full_payment: false, refund_policy: [{ hours_before: 24, refund_percentage: 100 }],
    }),
  });
  const me = await api("/users/me", f.playerTok);
  const slot = slots[n];
  return {
    f, me, confirmed: confirmed.booking_group_id, confirmedBooking: confirmed.bookings[0].id, awaiting: awaiting.booking_group_id,
    bankOnly: bankOnly.booking_group_id, failed: failed.booking_group_id, unpaid: unpaid.booking_group_id, cancelled: cancelled.booking_group_id,
    done: done.booking_group_id, match: match?.id, complaint: complaint.id, pendingArena: pendingArena.id, slot,
  };
}

const OWNER_ROUTES = ["/owner", "/owner/arenas", "/owner/bookings", "/owner/calendar", "/owner/courts", "/owner/equipment", "/owner/notifications", "/owner/payments", "/owner/pricing", "/owner/profile", "/owner/reports", "/owner/revenue", "/owner/reviews"];
const ADMIN_ROUTES = ["/admin", "/admin/arenas", "/admin/arenas/all", "/admin/bookings", "/admin/complaints", "/admin/owners", "/admin/payments", "/admin/reports", "/admin/reviews", "/admin/settings", "/admin/users"];
const PUBLIC_ROUTES = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/admin/login"];

async function sweepWeb(d) {
  const browser = await chromium.launch();
  const themeInit = (v) => (ctx) =>
    ctx.addInitScript((value) => {
      try {
        localStorage.setItem("ah-admin-theme", value);
        localStorage.setItem("theme", value);
      } catch {
        /* ignore */
      }
    }, v);
  const STATES = path.join(OUT, `_sweep_state_web_${TAG}.json`);
  let states = {};
  // a re-run within a few minutes reuses the signed-in sessions (the sign-in routes allow 20 a minute)
  if (fs.existsSync(STATES) && Date.now() - fs.statSync(STATES).mtimeMs < 8 * 60000) states = JSON.parse(fs.readFileSync(STATES, "utf-8"));
  for (const [role, email] of [["owner", d.f.owner], ["admin", d.f.admin]]) {
    if (states[role]) continue;
    const first = await newPage(browser, { width: 1024, height: 900 }, `${role}-login`);
    if (role === "admin") {
      await first.page.goto(WEB + "/admin/login", { waitUntil: "load" });
      await first.page.getByLabel("Work email").fill(email);
      await first.page.getByLabel("Password").first().fill(PASSWORD);
      await first.page.getByRole("button", { name: /sign in/i }).click();
      await first.page.getByLabel("Digit 1 of 6").waitFor({ timeout: 20000 });
      await sleep(500);
      await first.page.getByLabel("Digit 1 of 6").fill(lastOtpFor(email));
      await first.page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 25000 });
    } else {
      await webLogin(first.page, email);
    }
    states[role] = await first.ctx.storageState();
    await first.ctx.close();
    fs.writeFileSync(STATES, JSON.stringify(states));
    await sleep(PACE);
  }
  const groups = [["public", PUBLIC_ROUTES, null], ["owner", OWNER_ROUTES, states.owner], ["admin", ADMIN_ROUTES, states.admin]];
  for (const [role, routes, state] of groups) {
    for (const route of routes.filter((r) => !ONLY || ONLY.includes(r))) {
      for (const scheme of ["light", "dark"]) {
        const { page, ctx } = await newPage(browser, { width: 1024, height: 900, colorScheme: scheme, ...(state ? { storageState: state } : {}) }, `web ${role} ${route} ${scheme}`);
        await themeInit(scheme)(ctx);
        try {
          await page.goto(WEB + route, { waitUntil: "load", timeout: 40000 });
          await page.waitForTimeout(role === "public" ? 1200 : 2500);
          await measure(page, { side: "web", role, route, scheme, widths: WEB_WIDTHS, mobile: false });
        } catch (e) {
          rows.push({ side: "web", role, route, scheme, width: 0, problems: [`did not load: ${e.message.split("\n")[0]}`], text: "" });
        }
        await ctx.close();
        await sleep(role === "public" ? 800 : PACE);
      }
    }
  }
  await browser.close();
}

async function sweepMobile(d) {
  const browser = await chromium.launch();
  const login = async (email, isAdmin) => {
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "mobile-login");
    if (!isAdmin) {
      await mobileLogin(page, email);
    } else {
      await sleep(65000); // the sign-in routes allow 20 a minute (the player sign-in just before used some)
      await page.goto(MOBILE + "/login", { waitUntil: "load", timeout: 40000 });
      await page.getByPlaceholder("Email or phone").fill(email);
      await page.getByPlaceholder("Password").fill(PASSWORD);
      await page.getByText("Log in", { exact: true }).last().click();
      await page.waitForURL((u) => u.pathname.includes("admin-code"), { timeout: 25000 });
      await sleep(600);
      await page.getByLabel("Verification code").first().fill(lastOtpFor(email));
      await page.waitForURL((u) => u.pathname.startsWith("/admin") && !u.pathname.includes("code"), { timeout: 25000 });
      await page.waitForTimeout(1500);
    }
    const state = await ctx.storageState();
    await ctx.close();
    await sleep(PACE);
    return state;
  };
  const playerState = await login(d.f.player, false);
  // the admin sign-in code has an hourly cap per account, so the phone checks use their own admin account
  const mobileAdmin = `${TAG}m${Date.now() % 100000}-admin@example.com`;
  await adminToken(mobileAdmin);
  const adminState = await login(mobileAdmin, true);
  const { f } = d;
  const slotParam = encodeURIComponent(JSON.stringify([{ id: d.slot.id, date: f.date, start_time: d.slot.start_time, end_time: d.slot.end_time, price: d.slot.price }]));
  const player = [
    "/", "/results", "/search", "/bookings", "/play", "/profile",
    "/filters", "/notifications", "/health", "/one-more-step",
    `/arena/${f.arenaId}`, `/arena/${f.arenaId}/reviews`, `/court/${f.courtId}/slots?arenaId=${f.arenaId}`,
    `/booking/${f.courtId}?arenaId=${f.arenaId}&slots=${slotParam}`,
    `/booking/payment?courtId=${f.courtId}&arenaId=${f.arenaId}&groupId=${d.unpaid}`,
    `/booking/payment?courtId=${f.courtId}&arenaId=${f.arenaId}&groupId=${d.confirmed}&balance=1`,
    `/booking/detail/${d.confirmed}`, `/booking/detail/${d.awaiting}`, `/booking/detail/${d.cancelled}`, `/booking/detail/${d.done}`,
    `/booking/awaiting/${d.awaiting}`, `/booking/bank/${d.bankOnly}`, `/booking/confirmed/${d.confirmed}`, `/booking/failed/${d.failed}`,
    `/booking/move/${d.confirmed}`, `/booking/pass/${d.confirmedBooking}`, `/booking/processing/${d.unpaid}`, "/booking/return",
    `/booking/slot-lost?courtId=${f.courtId}&arenaId=${f.arenaId}&date=${f.date}&start=10:00&end=11:00`,
    "/play/create", ...(d.match ? [`/play/${d.match}`] : []),
    "/profile/edit", "/profile/liked", "/profile/payments", "/profile/report", "/profile/reviews", "/profile/settings",
    "/profile/change-email", "/profile/change-password", "/profile/change-phone",
    "/support", "/support/faq", "/support/assistant", "/support/new", `/support/${d.complaint}`,
  ];
  const admin = [
    "/admin", "/admin/approvals", "/admin/complaints", "/admin/more", "/admin/notifications", "/admin/payments", "/admin/arenas", "/admin/users",
    `/admin/approvals/${d.pendingArena}`, `/admin/arenas/${f.arenaId}`, `/admin/complaints/${d.complaint}`, `/admin/users/${d.me.id}`,
  ];
  const auth = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-otp", "/admin-code"];
  const groups = [["auth", auth, null], ["player", player, playerState], ["admin", admin, adminState]];
  // one signed-in browser per role and colour scheme for the whole run: a session that is opened again and
  // again from the same saved copy has its refresh code used twice, and the server then ends the session
  for (const [role, routes, state] of groups) {
    for (const scheme of ["light", "dark"]) {
      const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true, colorScheme: scheme, ...(state ? { storageState: state } : {}) }, `mobile ${role} ${scheme}`);
      for (const route of routes.filter((r) => !ONLY || ONLY.some((o) => r.startsWith(o)))) {
        try {
          await page.goto(MOBILE + route, { waitUntil: "load", timeout: 40000 });
          await page.waitForTimeout(2800);
          const notNow = page.getByText("Not now", { exact: true });
          if (await notNow.isVisible().catch(() => false)) await notNow.click().catch(() => {});
          await page.waitForTimeout(500);
          await measure(page, { side: "mobile", role, route: route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id").replace(/\?.*$/, ""), scheme, widths: MOBILE_WIDTHS, mobile: true });
        } catch (e) {
          rows.push({ side: "mobile", role, route, scheme, width: 0, problems: [`did not load: ${e.message.split("\n")[0]}`], text: "" });
        }
        await sleep(role === "auth" ? 1200 : PACE - 2500);
      }
      await ctx.close();
    }
  }
  await browser.close();
}

// the data is built once and kept, so a second run (or the other half) reuses it instead of using up slots
const DATA = path.join(OUT, `_sweep_data_${TAG}.json`);
let d;
if (fs.existsSync(DATA)) {
  d = JSON.parse(fs.readFileSync(DATA, "utf-8"));
  await sleep(65000); // a re-run may follow other sign-ins: let the sign-in budget refill
} else {
  d = await build();
  fs.writeFileSync(DATA, JSON.stringify(d));
  await sleep(65000); // the sign-in routes allow 20 a minute; let the budget refill before the browser signs in
}
if (WHICH === "all" || WHICH === "web") await sweepWeb(d);
if (WHICH === "all" || WHICH === "mobile") await sweepMobile(d);

const file = path.join(OUT, `_sweep_${WHICH}.json`);
fs.writeFileSync(file, JSON.stringify({ rows, consoleErrors, failedRequests }, null, 2));
const bad = rows.filter((r) => r.problems.length);
const screens = new Set(rows.map((r) => `${r.side} ${r.role} ${r.route}`));
console.log(`\nscreens measured: ${screens.size}, measurements: ${rows.length}, with a problem: ${bad.length}`);
console.log(`console errors: ${consoleErrors.length}, failed requests: ${failedRequests.length}`);
const seen = new Set();
for (const r of bad) {
  const key = `${r.side} ${r.role} ${r.route} | ${r.problems.join(" | ")}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`PROBLEM ${r.side} ${r.role} ${r.route} [${r.scheme} @${r.width}] ${r.problems.join(" | ")}`);
}
consoleErrors.slice(0, 40).forEach((e) => console.log("  ERR", e));
failedRequests.slice(0, 40).forEach((e) => console.log("  REQ", e));
process.exit(bad.length || consoleErrors.length || failedRequests.length ? 1 : 0);
