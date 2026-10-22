// Builds one ~900px-wide contact sheet of this pass's new/changed screens
// only, from the PNGs already captured under scripts/.ui_verify/ by
// verify_ui_web.mjs and verify_ui_mobile.mjs. Run after both of those.
//
// Run from the repo root:
//   node scripts/build_contact_sheet.mjs

import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const DIR = path.join(process.cwd(), "scripts", ".ui_verify");
const SHEET_WIDTH = 900;

const ITEMS = [
  { label: "Booking pass (mobile, 390px)", file: "mobile-pass-screen.390.png" },
  { label: "Get Directions, arena page (mobile, 390px)", file: "mobile-get-directions.390.png" },
  { label: "Force refund dialog (web, 1024px)", file: "admin-force-refund.1024.light.png" },
  { label: "Blocked dates list (web, 1024px)", file: "owner-blocked-dates-photos.1024.light.png" },
  { label: "Photo upload (web, 1024px)", file: "owner-blocked-dates-photos.1024.light.png" },
  { label: "Use my current location (web, 1024px)", file: "owner-use-my-location-granted.1024.png" },
];

async function main() {
  const rows = [];
  for (const { label, file } of ITEMS) {
    const full = path.join(DIR, file);
    try {
      await fs.access(full);
    } catch {
      console.error(`Missing: ${file}`);
      continue;
    }
    rows.push({ label, url: pathToFileURL(full).href });
  }

  const rowsHtml = rows
    .map(
      ({ label, url }) => `
    <div class="row">
      <div class="label">${label}</div>
      <img class="thumb" src="${url}" alt="${label}">
    </div>`,
    )
    .join("");

  const gridHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; padding:20px; background:#ffffff; font-family:'Segoe UI',Arial,sans-serif;
           width:${SHEET_WIDTH}px; }
    h1 { font-size:16px; margin:0 0 16px; color:#0F1A15; }
    .row { margin-bottom:18px; border-bottom:1px solid #E2E6E1; padding-bottom:18px; }
    .label { font-size:12px; font-weight:700; color:#0F1A15; margin-bottom:8px; }
    .thumb { max-width:${SHEET_WIDTH - 40}px; height:auto; border:1px solid #E2E6E1; border-radius:6px; }
  </style></head><body>
  <h1>ArenaHub — new screens this pass</h1>
  ${rowsHtml}
  </body></html>`;

  const gridPath = path.join(DIR, "_contact_sheet_source.html");
  await fs.writeFile(gridPath, gridHtml, "utf-8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SHEET_WIDTH + 40, height: 800 } });
  await page.goto(pathToFileURL(gridPath).href, { waitUntil: "networkidle" });
  const sheetPath = path.join(DIR, "contact_sheet.png");
  await page.screenshot({ path: sheetPath, fullPage: true });
  await page.close();
  await browser.close();

  console.log("Contact sheet written to", sheetPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
