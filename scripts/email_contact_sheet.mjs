// Builds one contact-sheet picture (about 900px wide) of every email preview, light and dark.
// Reads the HTML files written by `backend/scripts/email_preview.py` (run that first). Sends no
// real email — it only renders static HTML files that are already on disk.
//
// Run from the repo root:
//   node scripts/email_contact_sheet.mjs

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';

const PREVIEW_DIR = path.join(process.cwd(), 'backend', 'scripts', '.email_preview');
const SHEET_WIDTH = 900;
const THUMB_WIDTH = 300;

async function main() {
  let files;
  try {
    files = (await fs.readdir(PREVIEW_DIR))
      .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
      .sort();
  } catch {
    console.error(`No preview files found at ${PREVIEW_DIR}.`);
    console.error('Run first: cd backend && uv run python scripts/email_preview.py');
    process.exit(1);
  }
  if (!files.length) {
    console.error('No .html preview files found. Run email_preview.py first.');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const thumbs = [];

  for (const file of files) {
    const label = path.parse(file).name;
    const url = pathToFileURL(path.join(PREVIEW_DIR, file)).href;
    for (const colorScheme of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: 640, height: 900 },
        colorScheme,
      });
      await page.goto(url, { waitUntil: 'networkidle' });
      const outFile = path.join(PREVIEW_DIR, `${label}.${colorScheme}.png`);
      await page.screenshot({ path: outFile, fullPage: true });
      await page.close();
      console.log('Rendered', file, colorScheme);
      if (colorScheme === 'light') thumbs.push({ label, light: outFile });
      else thumbs[thumbs.length - 1].dark = outFile;
    }
  }

  const rows = thumbs
    .map(
      ({ label, light, dark }) => `
    <div class="row">
      <div class="label">${label}</div>
      <img class="thumb" src="${pathToFileURL(light).href}" alt="${label} light">
      <img class="thumb" src="${pathToFileURL(dark).href}" alt="${label} dark">
    </div>`
    )
    .join('');

  const gridHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; padding:20px; background:#ffffff; font-family:'Segoe UI',Arial,sans-serif;
           width:${SHEET_WIDTH}px; }
    h1 { font-size:16px; margin:0 0 16px; color:#0F1A15; }
    .row { display:flex; align-items:flex-start; gap:14px; margin-bottom:16px;
           border-bottom:1px solid #E2E6E1; padding-bottom:16px; }
    .label { width:150px; font-size:11px; font-weight:700; color:#0F1A15; flex-shrink:0;
              padding-top:6px; word-break:break-word; }
    .thumb { width:${THUMB_WIDTH}px; height:auto; border:1px solid #E2E6E1; border-radius:6px;
              flex-shrink:0; }
  </style></head><body>
  <h1>ArenaHub email previews &mdash; light (left) / dark (right)</h1>
  ${rows}
  </body></html>`;

  const gridPath = path.join(PREVIEW_DIR, '_contact_sheet_source.html');
  await fs.writeFile(gridPath, gridHtml, 'utf-8');

  const page = await browser.newPage({ viewport: { width: SHEET_WIDTH + 40, height: 800 } });
  await page.goto(pathToFileURL(gridPath).href, { waitUntil: 'networkidle' });
  const sheetPath = path.join(PREVIEW_DIR, 'contact_sheet.png');
  await page.screenshot({ path: sheetPath, fullPage: true });
  await page.close();

  await browser.close();
  console.log('\nContact sheet written to', sheetPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
