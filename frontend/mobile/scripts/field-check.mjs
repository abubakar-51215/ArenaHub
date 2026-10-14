// Every text field with an icon is 48px tall with a 20px icon: empty or filled, focused or not, at 360, 375, 390
// and 430 wide (rule d in docs/MOBILE_QA_GATE.md); a shared field without an icon is 48px tall. Runs against the
// phone web build.
// Run: node scripts/field-check.mjs [http://localhost:8081]
//   Signed-in screens (search) are checked too when FIELD_CHECK_TOKEN holds an access token of a player.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const TOKEN = process.env.FIELD_CHECK_TOKEN;
const STEP = 8000;
const WIDTHS = [360, 375, 390, 430];
const ROUTES = [
  ['Log in', '/login'],
  ['Create account', '/register'],
  ['Forgot password', '/forgot-password'],
  ['Reset password (new password)', '/reset-password?email=field.check%40example.com', 'password'],
  ...(TOKEN ? [['Search', '/search', 'signed-in']] : []),
];

/** Each icon field on the page: its height and its icon's width and height. */
const measure = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="icon-field"]')].map((f) => {
      const box = f.getBoundingClientRect();
      const svg = f.querySelector('svg');
      const ic = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
      const input = f.querySelector('input,textarea');
      return { label: input?.getAttribute('aria-label') ?? '?', h: box.height, iw: ic.width, ih: ic.height };
    }),
  );

let failed = 0;
let fields = 0;
const br = await chromium.launch();
for (const w of WIDTHS) {
  for (const [name, route, step] of ROUTES) {
    // signed out for the sign-in screens (a saved sign-in would skip them), signed in for the rest
    const ctx = await br.newContext({ viewport: { width: w, height: 800 } });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('arenahub-first-launch-done', '1');
        if (t) localStorage.setItem('arenahub-auth', JSON.stringify({ state: { accessToken: t }, version: 0 }));
      } catch {}
    }, step === 'signed-in' ? TOKEN : null);
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP);
    await page.goto(BASE + route, { waitUntil: 'load', timeout: STEP });
    if (step === 'password') {
      // the reset screen opens on the code; six digits move on to the new password
      await page.getByLabel('Verification code, 6 digits').pressSequentially('123456');
      await page.getByLabel('New password', { exact: true }).waitFor({ timeout: STEP });
    }
    await page.locator('[data-testid="icon-field"]').first().waitFor({ timeout: STEP });
    const states = [];
    states.push(['empty', await measure(page)]);
    const inputs = page.locator('[data-testid="icon-field"] input');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      await inputs.nth(i).focus();
      states.push([`field ${i + 1} focused, empty`, await measure(page)]);
      await inputs.nth(i).fill('Abc123@x.pk');
      states.push([`field ${i + 1} focused, filled`, await measure(page)]);
    }
    await page.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
    states.push(['filled, not focused', await measure(page)]);
    for (const [state, list] of states) {
      for (const f of list) {
        fields++;
        // a field drawn without an icon (Phone: the icon set has none) is held to the 48px height only
        const iconOk = (f.iw === 0 && f.ih === 0) || (Math.abs(f.iw - 20) < 0.6 && Math.abs(f.ih - 20) < 0.6);
        const ok = Math.abs(f.h - 48) < 0.6 && iconOk;
        if (!ok) {
          failed++;
          console.log(`  FAIL ${w} ${name} "${f.label}" ${state}: field ${f.h}px, icon ${f.iw}x${f.ih}px`);
        }
      }
    }
    const count = states[0][1].length;
    console.log(`  ${failed ? '    ' : 'ok  '} ${w} ${name}: ${count} icon field${count === 1 ? '' : 's'}, ${states.length} states`);
    await ctx.close();
  }
}
await br.close();
console.log(failed ? `${failed} of ${fields} measurements failed` : `all field checks passed (${fields} measurements: 48px fields, 20px icons)`);
process.exit(failed ? 1 : 0);
