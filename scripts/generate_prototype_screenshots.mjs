import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';

async function main() {
  const repoRoot = process.cwd();
  const protoDir = path.join(repoRoot, 'design', 'prototypes');
  const outDir = path.join(repoRoot, 'design', 'wireframes', 'prototype_screens');

  try {
    await fs.access(protoDir);
  } catch (e) {
    console.error('No prototypes directory found at', protoDir);
    process.exit(0);
  }

  await fs.mkdir(outDir, { recursive: true });

  const files = (await fs.readdir(protoDir, { withFileTypes: true }))
    .filter(f => f.isFile() && f.name.toLowerCase().endsWith('.html'))
    .map(f => f.name);

  if (!files.length) {
    console.log('No HTML prototype files found.');
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  for (const file of files) {
    const filePath = path.join(protoDir, file);
    const url = pathToFileURL(filePath).href;
    const outFile = path.join(outDir, path.parse(file).name + '.png');
    console.log('Rendering', file, '->', outFile);
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: outFile, fullPage: true });
    } catch (err) {
      console.error('Failed to render', file, err);
    }
  }

  await browser.close();
  console.log('Done. Screenshots saved to', outDir);
}

main().catch(err => { console.error(err); process.exit(1); });
