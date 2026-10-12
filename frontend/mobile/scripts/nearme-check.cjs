// Checks the near-me pop-up rule (lib/nearme.ts promptDue + the Karachi date) around Karachi midnight, under several phone time zones.
// Run: node scripts/nearme-check.cjs
const { spawnSync } = require('child_process');
const zones = ['Asia/Karachi', 'America/Los_Angeles', 'Pacific/Auckland', 'Europe/London', 'UTC'];
if (!process.env.NCHILD) {
  let bad = 0;
  for (const tz of zones) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, TZ: tz, NCHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(r.stdout);
    if (r.status !== 0) bad++;
  }
  console.log(bad ? `\n${bad} zone(s) FAILED` : '\nall near-me rule checks passed in every time zone');
  process.exit(bad ? 1 : 0);
}
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');
function load(file, requireMap = {}) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = new Module(file);
  m.require = (id) => (id in requireMap ? requireMap[id] : require(id));
  m._compile(js, file);
  return m.exports;
}
const K = load('lib/karachi.ts');
const store = new Map();
const N = load('lib/nearme.ts', {
  '@react-native-async-storage/async-storage': { default: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => void store.set(k, v) } },
  '@/lib/karachi': K,
});
let failed = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++;
    console.log(`  FAIL ${process.env.TZ} ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};
const at = (s) => new Date(s);
const due = (granted, last, now) => N.promptDue({ granted, lastNotNow: last, today: K.karachiToday(now) });

(async () => {
  // never asked: shown
  eq('first ever open', due(false, null, at('2026-10-12T05:00:00Z')), true);
  // location allowed: never shown
  eq('allowed never shows', due(true, null, at('2026-10-12T05:00:00Z')), false);
  eq('allowed never shows, even after a Not now', due(true, '2026-10-01', at('2026-10-12T05:00:00Z')), false);

  // "Not now" at 23:50 Karachi on the 12th (18:50 UTC)
  const notNow = at('2026-10-12T18:50:00Z');
  await N.rememberNotNow(notNow);
  const saved = [...store.values()][0];
  eq('stored value is only the Karachi date', saved, '2026-10-12');
  // opened again at 23:59:59 Karachi, same day: not shown
  eq('same Karachi day, 23:59', due(false, saved, at('2026-10-12T18:59:59Z')), false);
  // opened again at 00:00:00 Karachi on the 13th (19:00 UTC): shown again
  eq('next Karachi day, 00:00', due(false, saved, at('2026-10-12T19:00:00Z')), true);
  eq('next Karachi day, morning', due(false, saved, at('2026-10-13T04:00:00Z')), true);
  eq('three days later', due(false, saved, at('2026-10-15T09:00:00Z')), true);
  // opened many times on the same day: never shown
  for (const h of ['2026-10-12T19:00:00Z', '2026-10-13T00:00:00Z', '2026-10-13T12:00:00Z']) {
    store.set('arenahub-nearme-not-now', '2026-10-13');
    eq(`many opens on the 13th ${h}`, due(false, '2026-10-13', at(h)), false);
  }
  // the phone's own zone does not matter: 2026-10-12 20:00 in Los Angeles is 2026-10-13 08:00 in Karachi
  eq('phone zone does not matter', due(false, '2026-10-12', at('2026-10-13T03:00:00Z')), true);
  eq('phone zone does not matter (same day)', due(false, '2026-10-12', at('2026-10-12T17:00:00Z')), false);
  console.log(`${failed ? 'FAIL' : 'ok  '} ${process.env.TZ}`);
  process.exit(failed ? 1 : 0);
})();
