// Second harness mode: the prototype-comparison viewport (300x628 @2x,
// matching the mock-phone frame width the prototype itself renders at — see
// design/mobile-spec.md "Tab bar"), used to measure and screenshot the real
// tab bar for a direct diff against the prototype's own measured values.
//
// Logs in via a token injected into localStorage rather than the real login
// UI (capture-baselines.mjs does the honest UI login; this mode only cares
// about the tab bar, so skipping the login screen keeps it fast to re-run).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const WEB = process.env.WEB || "http://localhost:8081";
const API = process.env.API || "http://127.0.0.1:8000/api/v1";
const OUT = process.argv[2] || path.resolve("../../design/baselines/mobile/tabbar");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const lg = await (
    await fetch(API + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "sara.khan@example.com", password: "Player@1234" }),
    })
  ).json();
  const tokens = lg.data;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 300, height: 628 }, deviceScaleFactor: 2 });
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
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));

  await page.goto(WEB + "/login", { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.evaluate(
    (t) => localStorage.setItem("arenahub-auth", JSON.stringify({ state: { accessToken: t.access_token, refreshToken: t.refresh_token }, version: 0 })),
    tokens,
  );

  const report = {};
  for (const [name, route] of [
    ["home", "/"],
    ["search", "/search"],
    ["bookings", "/bookings"],
    ["play", "/play"],
    ["profile", "/profile"],
  ]) {
    await page.goto(WEB + route, { waitUntil: "networkidle", timeout: 240000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, `screen-${name}.png`) });

    const m = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      if (!tabs.length) return null;
      // DOM is 3 levels deeper than it looks: <a role=tab> -> per-item flex
      // wrapper -> <div role=tablist> (the row) -> the actual styled bar
      // (background/border/height all live here, not on the tablist).
      const bar = tabs[0].parentElement.parentElement.parentElement;
      const br = bar.getBoundingClientRect();
      const bcs = getComputedStyle(bar);
      return {
        bar: {
          x: br.left,
          y: br.top,
          w: br.width,
          h: br.height,
          pad: bcs.padding,
          bg: bcs.backgroundColor,
          borderTop: `${bcs.borderTopWidth} ${bcs.borderTopStyle} ${bcs.borderTopColor}`,
        },
        tabs: tabs.map((t) => {
          const r = t.getBoundingClientRect();
          // Our custom tabBarButton (app/(tabs)/_layout.tsx, G0b-2) renders a
          // single content View with [icon, label] as its only two children —
          // no crossfade wrapper, unlike the library's own default button.
          const content = t.children[0];
          const [icon, label] = [...content.children];
          const ics = getComputedStyle(icon);
          const lcs = getComputedStyle(label);
          const ir = icon.getBoundingClientRect();
          const lr = label.getBoundingClientRect();
          return {
            text: label.textContent,
            selected: t.getAttribute("aria-selected"),
            iconBox: `${ir.width.toFixed(1)}x${ir.height.toFixed(1)}`,
            iconColor: ics.color,
            labelBox: `${lr.width.toFixed(1)}x${lr.height.toFixed(1)}`,
            labelHeight: lr.height,
            labelVisible: lcs.visibility !== "hidden" && lcs.display !== "none" && lcs.opacity !== "0",
            labelFont: `${lcs.fontFamily.split(",")[0]} ${lcs.fontSize}/${lcs.lineHeight} w${lcs.fontWeight} ls ${lcs.letterSpacing}`,
            labelColor: lcs.color,
          };
        }),
      };
    });
    report[name] = m;
    if (m) {
      await page.screenshot({
        path: path.join(OUT, `bar-${name}.png`),
        clip: { x: 0, y: Math.round(m.bar.y), width: 300, height: 628 - Math.round(m.bar.y) },
      });
    }
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("console errors:", errors.length, errors.join(" | "));

  // Regression guard for the bug this harness exists to catch (G0b-2,
  // docs/RESTYLE_LOG.md "Tab bar label layout bug"): react-navigation's own
  // tabBarStyle padding silently collapsed every label to 0 height while
  // leaving its text and colour in the DOM — nothing else about the render
  // signalled failure, so a human had to notice icons-only in a screenshot.
  // Assert it here so a later group can't reintroduce it silently.
  const labelFailures = [];
  for (const [screen, data] of Object.entries(report)) {
    if (!data) {
      labelFailures.push(`${screen}: no tab bar found at all`);
      continue;
    }
    for (const t of data.tabs) {
      if (!(t.labelHeight > 0)) labelFailures.push(`${screen}/${t.text}: label height is ${t.labelHeight} (must be > 0)`);
      if (!t.labelVisible) labelFailures.push(`${screen}/${t.text}: label is hidden (visibility/display/opacity)`);
      if (!t.text || !t.text.trim()) labelFailures.push(`${screen}/${t.text}: label text is empty`);
    }
  }
  await browser.close();
  if (labelFailures.length) {
    console.error("TAB BAR LABEL ASSERTION FAILED:");
    labelFailures.forEach((f) => console.error("  -", f));
    process.exit(1);
  }
  console.log(`Label assertion passed: ${Object.values(report).reduce((n, d) => n + (d ? d.tabs.length : 0), 0)} tabs checked across ${Object.keys(report).length} screens.`);
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
