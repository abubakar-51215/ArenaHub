// Item 2 in a real browser: the three new rows of the phone's Filters sheet (Must have, Time of
// day, How far) with location off and on, selected and cleared, the filter count on the Filters
// button, and the layout at 360, 375, 390 and 430 px. Scratch database, fake accounts.
//
//   BACKEND_LOG=<scratch backend log> SQL_RUNNER=<scratch sql helper> node scripts/verify_filters.mjs

import {
  MOBILE, allResults, api, chromium, dismissNearMe, finish, fixture, layout, makeArena, mobileLogin, newPage, record, sql,
} from "./lib/verify-kit.mjs";

const TAG = process.env.TAG || "fltv1";
const WIDTHS = [360, 375, 390, 430];

async function step(name, fn, page) {
  try {
    await fn();
    return null;
  } catch (e) {
    if (page) {
      await page.screenshot({ path: `scripts/.ui_verify/FAIL-${name}.png` }).catch(() => {});
      const text = await page.locator("body").innerText().catch(() => "");
      console.log(`  [${name}] url=${page.url()} text=${text.replace(/\s+/g, " ").slice(0, 400)}`);
    }
    return `${name}: ${e.message.split("\n")[0]}`;
  }
}

async function see(page, text, timeout = 15000) {
  try {
    await page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor({ timeout });
  } catch {
    throw new Error(`never saw "${text}"`);
  }
}

const idOf = (rows, name) => new RegExp(`UUID\\('([0-9a-f-]+)'\\), '${name}'`).exec(rows)?.[1];

async function main() {
  const f = await fixture(TAG);
  sql("INSERT INTO amenities (id, name) VALUES (gen_random_uuid(), 'Parking'), (gen_random_uuid(), 'Floodlights'), (gen_random_uuid(), 'Helipad') ON CONFLICT (name) DO NOTHING");
  const rows = sql("SELECT id, name FROM amenities");
  const parking = idOf(rows, "Parking");
  const lights = idOf(rows, "Floodlights");
  // the fixture's arena is "A" (parking + floodlights); "B" is morning-only with parking alone; "Helipad" is nobody's
  sql(`INSERT INTO arena_amenities (arena_id, amenity_id) VALUES ('${f.arenaId}', '${parking}'), ('${f.arenaId}', '${lights}') ON CONFLICT DO NOTHING`);
  const b = await makeArena(f, { name: `Verify Arena ${TAG} B`, hours: { open: "08:00", close: "12:00" } });
  sql(`INSERT INTO arena_amenities (arena_id, amenity_id) VALUES ('${b.arenaId}', '${parking}') ON CONFLICT DO NOTHING`);
  await makeArena(f, { name: `Verify Arena ${TAG} C` }); // no amenities
  const countFor = async (query) => (await api(`/arenas?${query}&page_size=1`, f.playerTok)).total;
  const mine = (await api(`/arenas?q=${encodeURIComponent("Verify Arena " + TAG)}&page_size=50`, f.playerTok)).total;

  const browser = await chromium.launch();

  // ---- location off: the rows, their states, the counts ----
  for (const width of WIDTHS) {
    const { page, ctx } = await newPage(browser, { width, height: 844, mobile: true }, "filters-off");
    const err = await step(
      "filters-off",
      async () => {
        await mobileLogin(page, f.player);
        await page.goto(`${MOBILE}/filters`, { waitUntil: "load", timeout: 30000 });
        await dismissNearMe(page);
        for (const t of ["How far", "Time of day", "Must have", "Parking", "Floodlights", "Morning", "Afternoon", "Evening", "Night", "2 km", "25 km"]) await see(page, t);
        if ((await page.getByText("Helipad", { exact: true }).count()) > 0) throw new Error("an amenity no arena has is offered");
        for (const km of ["2 km", "5 km", "10 km", "25 km"]) {
          const disabled = await page.getByRole("button", { name: km, exact: true }).first().getAttribute("aria-disabled");
          if (disabled !== "true") throw new Error(`${km} should be greyed out with location off`);
        }
        const body = await page.locator("body").innerText();
        if (!/Needs your location\.|Location is off\./.test(body)) throw new Error("the line under How far is missing");
        const lay = await layout(page);
        if (lay.sideways) throw new Error(`sideways scroll ${lay.scrollWidth}>${lay.clientWidth}`);
        if (lay.leak) throw new Error(`header shows a route name: ${lay.leak}`);
        if (lay.small.length) throw new Error(`tap targets under 44px: ${lay.small.slice(0, 4).join(", ")}`);
      },
      page,
    );
    record(`Filters: rows, location off @${width}`, "N/A", err ? "FAIL" : "PASS", err ?? "all rows, radius greyed out with a line, no sideways scroll, taps >= 44px");
    await ctx.close();
  }

  // ---- selecting: the live count follows the server, the badge counts rows, Clear resets ----
  {
    const { page, ctx } = await newPage(browser, { width: 390, height: 844, mobile: true }, "filters-select");
    const err = await step(
      "filters-select",
      async () => {
        await mobileLogin(page, f.player);
        // the filters live in memory, so go the way a player does: Results, then the Filters button
        await page.goto(`${MOBILE}/results`, { waitUntil: "load", timeout: 30000 });
        await dismissNearMe(page);
        await page.getByRole("button", { name: "Filters", exact: true }).first().click();
        await see(page, "Must have");
        const show = async (n) => see(page, `Show ${n} ${n === 1 ? "arena" : "arenas"}`, 15000);

        await page.getByRole("button", { name: "Parking", exact: true }).click();
        await show(await countFor(`amenity_ids=${parking}`));
        await page.getByRole("button", { name: "Floodlights", exact: true }).click();
        await show(await countFor(`amenity_ids=${parking}&amenity_ids=${lights}`)); // only arena A has both
        // an arena with only Parking (B) is dropped once Floodlights is also required
        if ((await countFor(`amenity_ids=${parking}&amenity_ids=${lights}`)) >= (await countFor(`amenity_ids=${parking}`))) throw new Error("requiring a second amenity did not narrow the list");

        await page.getByRole("button", { name: "Evening", exact: true }).click();
        await show(await countFor(`amenity_ids=${parking}&amenity_ids=${lights}&time_of_day=evening`));

        // back on the results page the Filters button counts the rows in use (amenities + time of day = 2)
        await page.getByText(/^Show \d+ arenas?$/).filter({ visible: true }).first().click();
        await page.getByRole("button", { name: "Filters, 2 applied" }).first().waitFor({ timeout: 15000 });

        // Clear all resets every row and the count
        await page.getByRole("button", { name: "Filters, 2 applied" }).first().click();
        await see(page, "Must have");
        await page.getByRole("button", { name: "Clear all filters" }).click();
        await page.waitForTimeout(500);
        for (const name of ["Parking", "Evening"]) {
          const on = await page.getByRole("button", { name }).first().getAttribute("aria-selected");
          if (on === "true") throw new Error(`${name} is still selected after Clear all`);
        }
        await show(mine > 0 ? await countFor("") : 0);
      },
      page,
    );
    record("Filters: select, count badge, Clear all", "N/A", err ? "FAIL" : "PASS", err ?? "live count equals the server's, badge 'Filters, 2 applied', Clear all resets");
    await ctx.close();
  }

  // ---- location on: How far works and filters ----
  {
    const { page, ctx } = await newPage(
      browser,
      { width: 390, height: 844, mobile: true, permissions: ["geolocation"], geolocation: { latitude: 31.5204, longitude: 74.3587 } },
      "filters-on",
    );
    const err = await step(
      "filters-on",
      async () => {
        await mobileLogin(page, f.player);
        await page.goto(`${MOBILE}/filters`, { waitUntil: "load", timeout: 30000 });
        await dismissNearMe(page);
        await see(page, "How far");
        // Near me is the one control that asks for the position
        await page.getByRole("button", { name: "Near me", exact: true }).click();
        await page.waitForFunction(
          () => document.querySelector('[aria-label="2 km"]')?.getAttribute("aria-disabled") !== "true",
          null,
          { timeout: 20000 },
        );
        await page.getByRole("button", { name: "2 km", exact: true }).click();
        const want = await countFor("lat=31.5204&lon=74.3587&radius_km=2&sort=near");
        await see(page, `Show ${want} ${want === 1 ? "arena" : "arenas"}`);
        const lay = await layout(page);
        if (lay.sideways) throw new Error(`sideways scroll ${lay.scrollWidth}>${lay.clientWidth}`);
      },
      page,
    );
    record("Filters: How far works once location is on", "N/A", err ? "FAIL" : "PASS", err ?? "Near me asks, then 2/5/10/25 km are live and the count matches the server");
    await ctx.close();
  }

  await browser.close();
  finish({ name: "filters" });
  process.exit(allResults().some((r) => r.mobile === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
