// Builds every ArenaHub logo asset from the geometry in design/brand/arenahub-logo.html
// (the source of truth: its mark(), P palettes and iconBase are called in the page).
// Run from frontend/mobile:  node scripts/brand-assets.mjs
// Writes the SVG marks and the PNGs into the Expo app and the web app's public folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '../../../node_modules/playwright/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const LOGO = path.join(repo, 'design/brand/arenahub-logo.html');
const MOBILE = path.join(repo, 'frontend/mobile/assets/images');
const MOBILE_BRAND = path.join(repo, 'frontend/mobile/assets/brand');
const WEB = path.join(repo, 'frontend/web/public');
const WEB_BRAND = path.join(WEB, 'brand');
for (const d of [MOBILE, MOBILE_BRAND, WEB_BRAND]) fs.mkdirSync(d, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
await page.goto(pathToFileURL(LOGO).href, { waitUntil: 'load' });
await page.waitForTimeout(500);

// the page's own helpers build the marks; they are global lexical bindings of its script
const parts = await page.evaluate(() => {
  const wrap = (inner, vb = '0 0 120 120', extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${extra}>${inner}</svg>`;
  const foot = (pal) => Object.assign({}, pal, { ball: 'football' });
  const fg = (inner) => `<g transform="translate(14.4 14.4) scale(.76)">${inner}</g>`;
  const solid = (c) => ({ line: c, hole: c, ring: c, mono: true });
  return {
    svg: {
      'mark-dark': wrap(mark(foot(P.dark))),
      'mark-light': wrap(mark(foot(P.light))),
      'mark-on-lime': wrap(mark(foot(P.onLime))),
      'mark-mono-ink': wrap(mark(P.monoInk)),
      'mark-mono-white': wrap(mark(P.monoWhite)),
    },
    icon: wrap(mark(Object.assign({}, iconBase, { sq: true }))),
    badge: wrap(mark(iconBase)),
    badgeSmall: (s) => null,
    badge16: wrap(mark(Object.assign({}, iconBase, { small: true }))),
    adaptiveFg: wrap(fg(mark(P.dark))),
    adaptiveBg: wrap('<rect width="120" height="120" fill="#0F1A15"/>'),
    adaptiveMono: wrap(fg(mark(Object.assign({}, solid('#FFFFFF'), { noRing: false })))),
    notification: wrap(mark(Object.assign({}, solid('#FFFFFF'), { noRing: true }))),
    splash: wrap('<rect width="120" height="120" fill="#0F1A15"/>' + mark(foot(P.dark))),
  };
});

const render = async (svg, size, file, opts = {}) => {
  const html = `<body style="margin:0;background:${opts.bg ?? 'transparent'}"><div id="a" style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`;
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(html);
  await p.locator('#a').screenshot({ path: file, omitBackground: !opts.bg });
  await p.close();
};

// SVG marks (viewBox 0 0 120 120)
for (const [name, svg] of Object.entries(parts.svg)) {
  fs.writeFileSync(path.join(MOBILE_BRAND, `${name}.svg`), svg);
  fs.writeFileSync(path.join(WEB_BRAND, `${name}.svg`), svg);
}
fs.writeFileSync(path.join(WEB, 'icon.svg'), parts.badge);

// mobile PNGs
await render(parts.icon, 1024, path.join(MOBILE, 'icon.png'), { bg: '#0F1A15' });
await render(parts.adaptiveFg, 432, path.join(MOBILE, 'android-icon-foreground.png'));
await render(parts.adaptiveBg, 432, path.join(MOBILE, 'android-icon-background.png'), { bg: '#0F1A15' });
await render(parts.adaptiveMono, 432, path.join(MOBILE, 'android-icon-monochrome.png'));
await render(parts.notification, 96, path.join(MOBILE, 'notification-icon.png'));
await render(parts.splash, 1024, path.join(MOBILE, 'splash-icon.png'), { bg: '#0F1A15' });
await render(parts.badge, 48, path.join(MOBILE, 'favicon.png'));

// web PNGs
await render(parts.badge16, 16, path.join(WEB, 'favicon-16x16.png'));
await render(parts.badge, 32, path.join(WEB, 'favicon-32x32.png'));
await render(parts.badge, 48, path.join(WEB, 'favicon-48x48.png'));
await render(parts.icon, 180, path.join(WEB, 'apple-touch-icon.png'), { bg: '#0F1A15' });
await render(parts.badge, 40, path.join(WEB_BRAND, 'email-badge.png'));
await render(parts.badge, 80, path.join(WEB_BRAND, 'email-badge@2x.png'));

// share card 1200 x 630: the mark and the wordmark on ink
{
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto(pathToFileURL(LOGO).href, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.evaluate((mk) => {
    document.body.innerHTML = `<div id="card" style="width:1200px;height:630px;background:#0F1A15;display:flex;align-items:center;justify-content:center;gap:56px;color:#F3F7EF;font-family:'Inter Tight',sans-serif">${mk}<div><div style="font-family:'Archivo',sans-serif;font-variation-settings:'wdth' 74,'wght' 800;font-size:132px;letter-spacing:-.025em;line-height:1">ArenaHub</div><div style="color:#8FA096;font-size:40px;margin-top:18px">Find a court. Get a game.</div></div></div>`;
  }, parts.svg['mark-dark'].replace('<svg ', '<svg width="300" height="300" '));
  await p.waitForTimeout(500);
  await p.locator('#card').screenshot({ path: path.join(WEB, 'og-share.png') });
  await p.close();
}

// ball faces for the in-app mark (react-native-svg draws them from these strings)
const faces = await page.evaluate(() => ({ keys: KEYS, faces: Object.fromEntries(KEYS.map((k) => [k, { name: FACES[k].name, svg: FACES[k].svg }])) }));
fs.writeFileSync(
  path.join(repo, 'frontend/mobile/constants/brand-faces.generated.ts'),
  `// GENERATED by scripts/brand-assets.mjs from design/brand/arenahub-logo.html. Do not hand-edit.
// Ball faces, viewBox -9 -9 18 18, circle radius 8 centred on 0,0.
export const BALL_KEYS = ${JSON.stringify(faces.keys)} as const;
export type BallKey = (typeof BALL_KEYS)[number];
export const BALL_FACES: Record<BallKey, { name: string; svg: string }> = ${JSON.stringify(faces.faces, null, 2)};
`,
);


// the web build of the mark runs the file's own CSS keyframes (react-native-svg animated props do not update on web)
{
  const html = fs.readFileSync(LOGO, 'utf8');
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const cut = (from, to) => {
    const a = style.indexOf(from);
    const b = to ? style.indexOf(to, a) : style.length;
    return style.slice(a, b);
  };
  let css = [
    cut('/* base (pre-animation) states */', '/* ================= SHEET ================= */'),
    cut('/* loader */', '@media (max-width:520px)'),
    cut('/* success: ring lights', '/* reduce motion: final picture at once */'),
  ].join('\n');
  const names = ['lockup', 'hmark', 'hbox', 'shake', 'hsvg', 'wordwrap', 'word', 'tag', 'shock', 'track', 'glint', 'trail', 'rk', 'bt', 'burst', 'spark', 'dot', 'pulse', 'ball', 'gh', 'sc', 'sp', 'f1', 'f2', 'f3', 'f4', 'f', 'g1', 'g2', 'ld', 'ldbox', 'lrun', 'lball', 'lsp', 'lf', 'ok', 'okring', 'okball', 'okpulse', 'go', 'done', 'off', 'offball', 'on', 'paused', 'sway'];
  css = css.replace(new RegExp('\\.(' + names.join('|') + ')(?![\\w-])', 'g'), '.bm-$1');
  css = css.replace(/@keyframes (\w+)/g, '@keyframes bm-$1');
  css = css.replace(/animation(-name)?:([^;}]*)/g, (m, nm, v) => 'animation' + (nm || '') + ':' + v.replace(/\b(h[A-Z]\w*|l[A-Z]\w*|ok[A-Z]|offB)\b/g, 'bm-$1'));
  const head = '// GENERATED by scripts/brand-assets.mjs from design/brand/arenahub-logo.html. Do not hand-edit.\n// The hero, loader, success and offline CSS of the logo file, class names prefixed bm-.\n';
  // the hero svg of the file (ring, racket, bat, burst, sparks, landing), classes prefixed bm-
  const heroSvg = html
    .match(/<svg class="hsvg"[^>]*>([\s\S]*?)<\/svg>/)[1]
    .replace(/class="([^"]+)"/g, (m, c) => 'class="' + c.split(' ').map((x) => 'bm-' + x).join(' ') + '"');
  const out = head + 'export const BRAND_WEB_CSS = ' + JSON.stringify(css) + ';\nexport const BRAND_HERO_SVG = ' + JSON.stringify(heroSvg) + ';\n';
  fs.writeFileSync(path.join(repo, 'frontend/mobile/components/brand/brand-web-css.generated.ts'), out);
}

// web: inline marks (dark and light, football), the faces and the logo file's CSS for the first-load loader
{
  const inner = await page.evaluate(() => ({
    dark: mark(Object.assign({}, P.dark, { ball: 'football' })),
    light: mark(Object.assign({}, P.light, { ball: 'football' })),
    loaderDark: mark(Object.assign({}, P.dark, { noBall: true })),
    loaderLight: mark(Object.assign({}, P.light, { noBall: true })),
  }));
  const css = fs.readFileSync(path.join(repo, 'frontend/mobile/components/brand/brand-web-css.generated.ts'), 'utf8').match(/BRAND_WEB_CSS = (".*");/)[1];
  const out =
    '// GENERATED by frontend/mobile/scripts/brand-assets.mjs from design/brand/arenahub-logo.html. Do not hand-edit.\n' +
    'export const MARK_INNER = ' + JSON.stringify(inner) + ' as const;\n' +
    'export const BALL_KEYS = ' + JSON.stringify(faces.keys) + ' as const;\n' +
    'export const BALL_FACES: Record<string, string> = ' + JSON.stringify(Object.fromEntries(faces.keys.map((k) => [k, faces.faces[k].svg]))) + ';\n' +
    'export const LOADER_CSS: string = ' + css + ';\n';
  fs.mkdirSync(path.join(repo, 'frontend/web/components/brand'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'frontend/web/components/brand/arena-mark.generated.ts'), out);
  // favicon.ico: 16, 32 and 48 px PNGs in one icon file
  const sizes = [16, 32, 48];
  const pngs = sizes.map((n) => fs.readFileSync(path.join(WEB, `favicon-${n}x${n}.png`)));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map((png, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i], 0);
    e.writeUInt8(sizes[i], 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  fs.writeFileSync(path.join(repo, 'frontend/web/app/favicon.ico'), Buffer.concat([head, ...entries, ...pngs]));
}

await browser.close();
console.log('brand assets written');
