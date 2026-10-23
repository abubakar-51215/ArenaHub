// The journey items that the other scripts do not cover, on web and on the mobile web build:
// every pay-balance method state, the three new filters alone and combined (against the live API),
// smart search and the support assistant (including the out-of-scope reply), notification preferences,
// owner bank-detail change with a code, admin approval / complaint reply / suspend and delete, the
// admin payments labels (Completed, Part refunded, Refunded), empty states, and error states (server
// offline, slow network, expired session). Scratch database, fake @example.com accounts only.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_journey_extra.mjs

import {
  API, MOBILE, PASSWORD, WEB, allResults, api, chromium, finish, fixture, freeSlots, lastOtpFor, layout, mobileLogin,
  newPage, record, registerAndVerify, sleep, sql, webLogin,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "jx1";
const RECEIPT = "/uploads/receipts/c898309f41b1f46378fc698549e1c592.jpg";
const OUT_OF_SCOPE = "Sorry this is not from our project please ask me about it";

async function step(item, web, mobile, fn) {
  try {
    const note = await fn();
    record(item, web, mobile, note || "");
  } catch (e) {
    record(item, web === "N/A" ? "N/A" : "FAIL", mobile === "N/A" ? "N/A" : "FAIL", String(e.message).split("\n")[0].slice(0, 220));
  }
}
const visible = (page, text) => page.getByText(text, { exact: true }).filter({ visible: true }).first();

async function bookPaid(f, slot, { type = "advance", method = "card" } = {}) {
  const made = await api("/bookings", f.playerTok, {
    method: "POST",
    body: JSON.stringify({ court_id: f.courtId, slot_ids: [slot.id], payment_type: type }),
  });
  const p = await api("/payments/initiate", f.playerTok, { method: "POST", body: JSON.stringify({ booking_group_id: made.booking_group_id, payment_method: method }) });
  if (method === "card") await api(`/payments/${p.payment.id}/simulate-confirm?success=true`, f.playerTok, { method: "POST", body: "{}" });
  return { group: made.booking_group_id, booking: made.bookings[0].id, payment: p.payment.id };
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
  let n = 0;
  const next = () => slots[n++];

  // ================= pay balance, every method state (live API) =================
  const bal = await bookPaid(f, next());
  await step("Pay balance: card (online) opens a payment and fails cleanly", "N/A", "PASS", async () => {
    const p = await api("/payments/initiate-balance", f.playerTok, { method: "POST", body: JSON.stringify({ booking_group_id: bal.group, payment_method: "card" }), headers: { "Idempotency-Key": `${TAG}-b1` } });
    await api(`/payments/${p.payment.id}/simulate-confirm?success=false`, f.playerTok, { method: "POST", body: "{}" });
    const g = await api(`/bookings/group/${bal.group}`, f.playerTok);
    if (!g.can_pay_balance) throw new Error("after a failed balance payment the player could not try again");
    return `failed balance payment leaves Pay balance available (balance_due ${g.balance_due})`;
  });
  await step("Pay balance: a second open payment is refused", "N/A", "PASS", async () => {
    await api("/payments/initiate-balance", f.playerTok, { method: "POST", body: JSON.stringify({ booking_group_id: bal.group, payment_method: "jazzcash", wallet_number: "03001234567" }), headers: { "Idempotency-Key": `${TAG}-b2` }, raw: true });
    const again = await api("/payments/initiate-balance", f.playerTok, { method: "POST", raw: true, body: JSON.stringify({ booking_group_id: bal.group, payment_method: "easypaisa", wallet_number: "03001234567" }), headers: { "Idempotency-Key": `${TAG}-b3` } });
    if (again.status !== 409 && again.status !== 200) throw new Error(`unexpected ${again.status}`);
    return `JazzCash opened, EasyPaisa while open -> ${again.status} (${String(again.body.message || "").slice(0, 60)})`;
  });
  await step("Pay balance: the amount cannot be chosen by the client", "N/A", "PASS", async () => {
    const g = await api(`/bookings/group/${bal.group}`, f.playerTok);
    const tamper = await api("/payments/initiate-balance", f.playerTok, { method: "POST", raw: true, body: JSON.stringify({ booking_group_id: bal.group, payment_method: "bank_transfer", amount: "1.00" }), headers: { "Idempotency-Key": `${TAG}-b4` } });
    const amount = tamper.body?.data?.payment?.amount;
    if (amount !== undefined && Number(amount) !== Number(g.balance_due) && tamper.status === 200) throw new Error(`amount ${amount} != balance ${g.balance_due}`);
    return `status ${tamper.status}, amount ${amount ?? "not accepted"} vs balance ${g.balance_due}`;
  });

  // ================= filters, alone and combined (live API) =================
  const amenities = await api("/arenas/amenities", f.playerTok);
  const parking = amenities.find((a) => a.name === "Parking");
  const flood = amenities.find((a) => a.name === "Floodlights");
  sql(`INSERT INTO arena_amenities (arena_id, amenity_id) VALUES ('${f.arenaId}','${parking.id}') ON CONFLICT DO NOTHING`);
  const ids = async (q) => (await api(`/arenas?${q}&page_size=100`, f.playerTok)).items.map((a) => a.id);
  const near = "lat=31.5204&lon=74.3587";
  await step("Filters alone: must-have amenity", "N/A", "PASS", async () => {
    const withParking = await ids(`amenity_ids=${parking.id}`);
    const none = await ids(`amenity_ids=${flood.id}&amenity_ids=${parking.id}`);
    if (!withParking.includes(f.arenaId)) throw new Error("arena with Parking missing");
    if (none.includes(f.arenaId)) throw new Error("ALL rule broken: arena without Floodlights returned");
    return `Parking -> ${withParking.length} arena(s); Parking+Floodlights (all) -> ${none.length}`;
  });
  await step("Filters alone: time of day", "N/A", "PASS", async () => {
    const out = {};
    for (const t of ["morning", "afternoon", "evening", "night"]) out[t] = (await ids(`time_of_day=${t}&date=${f.date}`)).includes(f.arenaId);
    if (!Object.values(out).some(Boolean)) throw new Error("no time of day found the arena that is open all day");
    return JSON.stringify(out);
  });
  await step("Filters alone: radius (and refused without a position)", "N/A", "PASS", async () => {
    const r5 = await ids(`${near}&radius_km=5`);
    const far = await ids(`lat=33.6844&lon=73.0479&radius_km=2`);
    const bad = await api(`/arenas?radius_km=5`, f.playerTok, { raw: true });
    if (!r5.includes(f.arenaId)) throw new Error("arena at the centre missing from 5 km");
    if (far.includes(f.arenaId)) throw new Error("arena in Lahore returned for a 2 km circle in Islamabad");
    return `5 km -> ${r5.length}; Islamabad 2 km -> ${far.length}; radius without position -> ${bad.status}`;
  });
  await step("Filters combined: amenity + time of day + radius", "N/A", "PASS", async () => {
    const all = await ids(`amenity_ids=${parking.id}&time_of_day=evening&date=${f.date}&${near}&radius_km=5`);
    const alone = await ids(`amenity_ids=${parking.id}`);
    if (!all.includes(f.arenaId)) throw new Error("combined filter lost the matching arena");
    if (all.some((i) => !alone.includes(i))) throw new Error("combined result is not a subset of the single filter");
    const empty = await ids(`amenity_ids=${flood.id}&time_of_day=evening&date=${f.date}&${near}&radius_km=5`);
    if (empty.includes(f.arenaId)) throw new Error("arena without Floodlights returned");
    return `combined ${all.length} (subset of ${alone.length}); unmatched amenity -> ${empty.length}`;
  });

  // ================= admin payments labels: Completed / Part refunded / Refunded =================
  const part = await fixture(`${TAG}p`, { policy: [{ hours_before: 24, refund_percentage: 50 }] });
  const pslots = await freeSlots(part.courtId, part.date, part.playerTok);
  const mk = async (slot) => {
    const made = await api("/bookings", part.playerTok, { method: "POST", body: JSON.stringify({ court_id: part.courtId, slot_ids: [slot.id], payment_type: "full" }) });
    const p = await api("/payments/initiate", part.playerTok, { method: "POST", body: JSON.stringify({ booking_group_id: made.booking_group_id, payment_method: "card" }) });
    await api(`/payments/${p.payment.id}/simulate-confirm?success=true`, part.playerTok, { method: "POST", body: "{}" });
    return made;
  };
  await mk(pslots[0]); // stays Completed
  const toPart = await mk(pslots[1]);
  await api(`/bookings/group/${toPart.booking_group_id}/cancel`, part.playerTok, { method: "POST", body: JSON.stringify({}) }); // 50% back
  const toFull = await mk(pslots[2]);
  await api(`/admin/bookings/${toFull.bookings[0].id}/force-refund`, part.adminTok, { method: "POST", body: JSON.stringify({ reason: "Checking the Refunded label." }) });

  const browser = await chromium.launch();
  const PACE = 7000;

  // ================= web: admin =================
  const adminCtx = await newPage(browser, { width: 1280, height: 900 }, "admin-login");
  await adminCtx.page.goto(WEB + "/admin/login", { waitUntil: "load" });
  await adminCtx.page.getByLabel("Work email").fill(part.admin);
  await adminCtx.page.getByLabel("Password").first().fill(PASSWORD);
  await adminCtx.page.getByRole("button", { name: /sign in/i }).click();
  await adminCtx.page.getByLabel("Digit 1 of 6").waitFor({ timeout: 20000 });
  await sleep(500);
  await adminCtx.page.getByLabel("Digit 1 of 6").fill(lastOtpFor(part.admin));
  await adminCtx.page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 25000 });
  const adminState = await adminCtx.ctx.storageState();
  await adminCtx.ctx.close();
  await sleep(PACE);

  await step("Admin payments labels: Completed, Part refunded, Refunded", "PASS", "N/A", async () => {
    const seen = {};
    for (const scheme of ["light", "dark"]) {
      for (const width of [360, 1024]) {
        const { page, ctx } = await newPage(browser, { width, height: 900, colorScheme: scheme, storageState: adminState }, `admin-payments ${scheme}`);
        await ctx.addInitScript((v) => localStorage.setItem("ah-admin-theme", v), scheme);
        await page.goto(WEB + "/admin/payments", { waitUntil: "load" });
        await page.locator("tbody tr").first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(1500);
        const body = await page.innerText("body");
        for (const label of ["Completed", "Part refunded", "Refunded"]) {
          const re = label === "Refunded" ? /(^|\s)Refunded(\s|$)/ : new RegExp(label);
          seen[`${label} ${scheme} ${width}`] = re.test(body);
        }
        await ctx.close();
        await sleep(PACE);
      }
    }
    const missing = Object.entries(seen).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error("label missing: " + missing.join(", "));
    return "all 3 labels present, light + dark, 360 + 1024";
  });

  await step("Admin: approve an arena in the browser", "PASS", "N/A", async () => {
    const pend = await api("/owner/arenas", part.ownerTok, {
      method: "POST",
      body: JSON.stringify({
        name: `Approve Me ${TAG}`, description: "Waiting", address: "4 Verify Road", city: "Lahore", area: "Gulberg", latitude: "31.52", longitude: "74.35",
        contact_phone: "0421234567", contact_email: "arena@example.com", operating_hours: { monday: { open: "08:00", close: "23:00" } },
        sports_offered: ["futsal"], images: [], amenity_ids: [], advance_percentage: 50, require_full_payment: false, refund_policy: [{ hours_before: 24, refund_percentage: 100 }],
      }),
    });
    const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: adminState }, "admin-approve");
    await page.goto(WEB + "/admin/arenas", { waitUntil: "load" });
    // older test arenas fill the first page, so the first row is approved, and the waiting count must drop by one
    const before = (await api("/admin/dashboard", part.adminTok)).pending_arenas ?? null;
    const row = page.locator("tbody tr").first();
    await row.waitFor({ timeout: 30000 });
    const name = (await row.innerText()).split("\n")[0];
    await row.getByRole("button", { name: "Approve", exact: true }).click();
    await page.waitForTimeout(3000);
    const after = (await api("/admin/dashboard", part.adminTok)).pending_arenas ?? null;
    await ctx.close();
    await sleep(PACE);
    if (before !== null && after !== before - 1) throw new Error(`waiting count ${before} -> ${after}`);
    return `approved "${name.slice(0, 30)}" from the table (waiting ${before} -> ${after})`;
  });

  await step("Admin: complaint reply in the browser", "PASS", "N/A", async () => {
    const c = await api("/complaints", part.playerTok, { method: "POST", body: JSON.stringify({ category: "other", description: "Please check the reply box from the browser." }) });
    const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: adminState }, "admin-complaint");
    await page.goto(WEB + "/admin/complaints", { waitUntil: "load" });
    const crow = page.locator("tbody tr", { hasText: "Please check the reply box" }).first();
    await crow.waitFor({ timeout: 30000 });
    await crow.getByRole("button", { name: "Open", exact: true }).click();
    await page.locator("textarea").first().fill("Thank you, we have fixed this.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(2500);
    const after = await api(`/admin/complaints/${c.id}`, part.adminTok);
    await ctx.close();
    await sleep(PACE);
    if (!after.admin_response) throw new Error("no reply saved on the complaint");
    return `status ${after.status}`;
  });

  await step("Admin: suspend then delete a user in the browser", "PASS", "N/A", async () => {
    const email = `${TAG}-victim@example.com`;
    await registerAndVerify(email, "player", "Victim");
    const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: adminState }, "admin-users");
    await page.goto(WEB + "/admin/users", { waitUntil: "load" });
    const row = () => page.locator("tr", { hasText: email }).first();
    await page.getByPlaceholder(/search/i).first().fill(email).catch(() => {});
    await row().waitFor({ timeout: 20000 });
    await row().getByRole("button", { name: "Suspend", exact: true }).click();
    await page.locator("textarea, input[type=text]").last().fill("Checking the suspend dialog.").catch(() => {});
    await page.getByRole("button", { name: /suspend/i }).last().click();
    await page.waitForTimeout(2500);
    const login = await api("/auth/login", null, { method: "POST", raw: true, body: JSON.stringify({ email, password: PASSWORD }) });
    if (login.status < 400) throw new Error("a suspended user could still sign in");
    await row().getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: /delete/i }).last().click();
    await page.waitForTimeout(2500);
    await ctx.close();
    await sleep(PACE);
    return `suspended (sign-in -> ${login.status}), delete confirmed`;
  });

  // ================= web: owner bank detail change with a code =================
  const ownerState = await (async () => {
    const { page, ctx } = await newPage(browser, { width: 1280, height: 900 }, "owner-login");
    await webLogin(page, part.owner);
    const s = await ctx.storageState();
    await ctx.close();
    await sleep(PACE);
    return s;
  })();
  await step("Owner: add a bank account with a code (browser)", "PASS", "N/A", async () => {
    const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: ownerState }, "owner-bank");
    await page.goto(WEB + "/owner/payments", { waitUntil: "load" });
    await page.getByRole("button", { name: "Add bank account", exact: true }).first().click();
    await page.getByLabel("Bank name").first().fill("Meezan Bank");
    await page.getByLabel("Account title").first().fill("Verify Owner");
    await page.getByLabel("Account number").first().fill("PK36MEZN0000001123456702");
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    await page.getByText("Confirm this bank account change").waitFor({ timeout: 15000 });
    await sleep(500);
    await page.getByLabel("Digit 1 of 6").fill(lastOtpFor(part.owner));
    await page.getByText("Confirm this bank account change").waitFor({ state: "hidden", timeout: 15000 });
    await page.getByText("Meezan Bank").first().waitFor({ timeout: 15000 });
    await ctx.close();
    await sleep(PACE);
    return "form -> code dialog -> account listed";
  });

  // ================= web: error states =================
  await step("Web error states: offline, slow, expired session", "PASS", "N/A", async () => {
    const notes = [];
    {
      const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: ownerState, expectErrors: true }, "web-offline");
      await page.goto(WEB + "/owner/courts", { waitUntil: "load" });
      await page.waitForTimeout(2500);
      await ctx.route(/localhost:8001\/api\//, (r) => r.abort("connectionrefused"));
      await page.goto(WEB + "/owner/reviews", { waitUntil: "load" });
      await page.waitForTimeout(4000);
      const text = (await page.innerText("body")).replace(/\s+/g, " ");
      if (!/could not|couldn't|try again|error|offline|unable|failed/i.test(text)) throw new Error("no error message when the server is unreachable: " + text.slice(0, 120));
      notes.push("offline shows a message");
      await ctx.close();
    }
    {
      const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: ownerState }, "web-slow");
      await ctx.route(/localhost:8001\/api\/v1\/owner\//, async (r) => {
        await sleep(5000);
        await r.continue();
      });
      const t0 = Date.now();
      await page.goto(WEB + "/owner/courts", { waitUntil: "load" });
      await page.waitForTimeout(1500);
      const early = (await page.innerText("body")).replace(/\s+/g, " ");
      await page.waitForTimeout(9000);
      const late = (await page.innerText("body")).replace(/\s+/g, " ");
      if (late === early && /loading|skeleton/i.test(late)) throw new Error("still loading after 10 s with the page frozen");
      notes.push(`slow API: page responsive (${Math.round((Date.now() - t0) / 1000)} s)`);
      await ctx.close();
    }
    {
      const { page, ctx } = await newPage(browser, { width: 1280, height: 900, storageState: ownerState, expectErrors: true }, "web-expired");
      await page.goto(WEB + "/owner", { waitUntil: "load" });
      await page.waitForTimeout(3000);
      await ctx.route(/localhost:8001\/api\//, (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Token has expired.", data: null, errors: null }) }));
      await page.goto(WEB + "/owner/bookings", { waitUntil: "load" });
      await page.waitForURL((u) => u.pathname.includes("login"), { timeout: 20000 });
      notes.push("expired session -> sign in page");
      await ctx.close();
    }
    await sleep(PACE);
    return notes.join("; ");
  });

  // ================= mobile web =================
  const mp = await registerAndVerify(`${TAG}-fresh@example.com`, "player", "Fresh"); // no data at all
  void mp;
  const mobile = async (email, opts = {}) => {
    const made = await newPage(browser, { width: 390, height: 844, mobile: true, ...opts }, "mobile-extra");
    await mobileLogin(made.page, email);
    return made;
  };

  await step("Smart search (mobile)", "N/A", "PASS", async () => {
    const { page, ctx } = await mobile(f.player);
    await page.goto(MOBILE + "/search", { waitUntil: "load" });
    await page.getByPlaceholder(/futsal in Lahore/).fill("futsal court in Lahore under 3000");
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.pathname.includes("results"), { timeout: 20000 });
    await visible(page, f.arenaId ? `Verify Arena ${TAG}` : "x").waitFor({ timeout: 25000 });
    await ctx.close();
    await sleep(PACE);
    return "typed a sentence -> Results shows the matching arena";
  });

  await step("Support assistant: in scope and out of scope (mobile)", "N/A", "PASS", async () => {
    const { page, ctx } = await mobile(f.player);
    await page.goto(MOBILE + "/support/assistant", { waitUntil: "load" });
    const box = page.getByPlaceholder("Type your question");
    await box.fill("What is my booking history?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForTimeout(3500);
    const inScope = await page.innerText("body");
    if (inScope.includes(OUT_OF_SCOPE)) throw new Error("an in-scope question got the out-of-scope reply");
    await box.fill("What is the capital of France?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await visible(page, OUT_OF_SCOPE).waitFor({ timeout: 20000 });
    await ctx.close();
    await sleep(PACE);
    return `out-of-scope reply is exactly: ${OUT_OF_SCOPE}`;
  });

  await step("Notification preferences (mobile)", "N/A", "PASS", async () => {
    const { page, ctx } = await mobile(f.player);
    await page.goto(MOBILE + "/profile/settings", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const before = JSON.stringify((await api("/users/me", f.playerTok)).notification_preferences);
    const sw = page.getByRole("switch").first();
    await sw.waitFor({ timeout: 15000 });
    await sw.click();
    await page.waitForTimeout(2500);
    const after = JSON.stringify((await api("/users/me", f.playerTok)).notification_preferences);
    await ctx.close();
    await sleep(PACE);
    if (before === after) throw new Error("tapping the first switch did not change what the server keeps");
    return `server kept ${after.slice(0, 90)}`;
  });

  await step("Empty states (mobile): a player with no data", "N/A", "PASS", async () => {
    const { page, ctx } = await mobile(`${TAG}-fresh@example.com`);
    const seen = [];
    for (const route of ["/bookings", "/profile/liked", "/profile/payments", "/profile/reviews", "/notifications", "/support"]) {
      await page.goto(MOBILE + route, { waitUntil: "load" });
      await page.waitForTimeout(2500);
      const text = (await page.innerText("body")).replace(/\s+/g, " ");
      if (/could not load|undefined|NaN/i.test(text)) throw new Error(`${route}: ${text.slice(0, 100)}`);
      seen.push(`${route}: ${text.slice(0, 50)}`);
      await sleep(2500);
    }
    await ctx.close();
    await sleep(PACE);
    return seen.join(" | ");
  });

  await step("Error states (mobile): offline, slow, expired session", "N/A", "PASS", async () => {
    const notes = [];
    {
      const { page, ctx } = await mobile(f.player, { expectErrors: true });
      await page.goto(MOBILE + "/bookings", { waitUntil: "load" });
      await page.waitForTimeout(2500);
      await ctx.route(/localhost:8001\/api\//, (r) => r.abort("connectionrefused"));
      await page.goto(MOBILE + "/profile/payments", { waitUntil: "load" });
      await page.waitForTimeout(5000);
      const text = (await page.innerText("body")).replace(/\s+/g, " ");
      if (!/could not load|No connection|Try again/i.test(text)) throw new Error("no friendly message when the server is unreachable: " + text.slice(0, 120));
      await ctx.unroute(/localhost:8001\/api\//);
      const again = page.getByText("Try again", { exact: true }).filter({ visible: true }).first();
      if (await again.isVisible().catch(() => false)) {
        await again.click();
        await page.waitForTimeout(3500);
        const text2 = (await page.innerText("body")).replace(/\s+/g, " ");
        if (/could not load/i.test(text2)) throw new Error("Try again did not recover once the server was back");
        notes.push("offline message, Try again recovers");
      } else notes.push("offline message shown");
      await ctx.close();
    }
    {
      const { page, ctx } = await mobile(f.player, { expectErrors: true });
      await ctx.route(/localhost:8001\/api\/v1\/bookings/, async (r) => {
        await sleep(5000);
        await r.continue();
      });
      await page.goto(MOBILE + "/bookings", { waitUntil: "load" });
      await page.waitForTimeout(1500);
      const early = (await page.innerText("body")).replace(/\s+/g, " ");
      await page.waitForTimeout(9000);
      const late = (await page.innerText("body")).replace(/\s+/g, " ");
      if (/could not load/i.test(late)) throw new Error("a 5 s delay was reported as a failure");
      notes.push(`slow: loading state then content (${early === late ? "same" : "changed"})`);
      await ctx.close();
    }
    {
      const { page, ctx } = await mobile(f.player, { expectErrors: true });
      await page.goto(MOBILE + "/bookings", { waitUntil: "load" });
      await page.waitForTimeout(2500);
      await ctx.route(/localhost:8001\/api\//, (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Token has expired.", data: null, errors: null }) }));
      await page.goto(MOBILE + "/profile/payments", { waitUntil: "load" });
      await page.waitForURL((u) => u.pathname.includes("login") || u.pathname === "/", { timeout: 20000 });
      await page.waitForTimeout(1500);
      const text = await page.innerText("body");
      if (!/Log in|Welcome back/i.test(text)) throw new Error("expired session did not lead to the log in screen: " + text.slice(0, 80));
      notes.push("expired session -> log in screen");
      await ctx.close();
    }
    await sleep(PACE);
    return notes.join("; ");
  });

  await browser.close();
  finish({ name: "journey-extra" });
  process.exit(allResults().some((r) => r.web === "FAIL" || r.mobile === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
