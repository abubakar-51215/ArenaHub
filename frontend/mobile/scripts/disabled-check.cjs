// A disabled button keeps 4.5 : 1 for its text (rule d2 in docs/MOBILE_QA_GATE.md). Reads the colours from constants/theme.ts
// (so a changed colour is checked, not a copy of it) and checks the shared Button has no see-through disabled style.
// Run: node scripts/disabled-check.cjs
const fs = require('fs');
const path = require('path');
const theme = fs.readFileSync(path.join(__dirname, '..', 'constants', 'theme.ts'), 'utf8');
const color = (name) => {
  const line = theme.split(/\r?\n/).find((l) => new RegExp('^\\s+' + name + ':').test(l));
  const m = line ? /'(#[0-9A-Fa-f]{6})'/.exec(line) : null;
  if (!m) throw new Error(`no colour ${name} in constants/theme.ts`);
  return m[1];
};
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
let failed = 0;
const need = (name, fg, bg, min = 4.5) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)} : 1  ${name} (${fg} on ${bg})`);
};
const { paper, card, line } = { paper: color('paper'), card: color('card'), line: color('line') };
need('a dark button that cannot be pressed yet (Confirm, Log in, Continue): paper text on disabledInk', paper, color('disabledInk'));
need('the assistant\'s send arrow: paper on disabledInk', paper, color('disabledInk'));
need('every other disabled button, and "Google needs a connection": text on the flat light grey', color('disabledText'), line);
need('the disabled composer box: its placeholder on the card', color('muted'), card);
// the disabled look must stay clearly different from the pressable one
const ink = color('ink');
const apart = ratio(color('disabledInk'), ink);
console.log(`  ${apart >= 2 ? 'ok  ' : 'FAIL'} ${apart.toFixed(2).padStart(5)} : 1  a disabled dark button against the active one (at least 2 : 1 apart)`);
if (apart < 2) failed++;
const button = fs.readFileSync(path.join(__dirname, '..', 'components', 'ui', 'button.tsx'), 'utf8');
const seeThrough = /disabled:\s*\{\s*opacity/.test(button) || /offInk/.test(button);
console.log(`  ${seeThrough ? 'FAIL' : 'ok  '}        the shared Button has no see-through disabled style`);
if (seeThrough) failed++;
console.log(failed ? `${failed} disabled-button checks failed` : 'all disabled-button checks passed');
process.exit(failed ? 1 : 0);
