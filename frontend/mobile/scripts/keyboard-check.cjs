// Checks the keyboard geometry in lib/keyboard.ts (pure functions) with the cases that matter on a phone.
// Run: node scripts/keyboard-check.cjs
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'keyboard.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = new Module('keyboard');
m.paths = [];
m.require = (id) => (id === 'react-native' ? { Keyboard: { addListener() {} }, Platform: { OS: 'android' } } : require(id));
m._compile(js, 'keyboard.js');
const { keyboardOverlap, scrollDeltaToReveal, scrollDeltaToRevealTop, KEYBOARD_MARGIN } = m.exports;

let failed = 0;
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got}, want ${want}`);
};

// A 800 px tall screen, keyboard 300 px high => keyboard top at 500.
eq('screen bottom 800, keyboard top 500 -> covers 300', keyboardOverlap(800, 500), 300);
eq('window already shrunk by Android (area bottom 500) -> adds nothing', keyboardOverlap(500, 500), 0);
eq('area bottom above the keyboard (400) -> adds nothing', keyboardOverlap(400, 500), 0);
eq('no keyboard -> 0', keyboardOverlap(800, null), 0);
eq('footer 56 px high at the bottom of a 800 screen, keyboard 500: area covers 300', keyboardOverlap(800, 500), 300);

eq('field bottom 450 with keyboard top 500, margin 24 -> already visible (needs 474)', scrollDeltaToReveal(450, 500), 0);
eq('field bottom 490 -> scroll 14 down to leave 24', scrollDeltaToReveal(490, 500), 14);
eq('field bottom 560 (under the keyboard) -> scroll 84', scrollDeltaToReveal(560, 500), 84);
eq('field bottom 700 -> scroll 224', scrollDeltaToReveal(700, 500), 224);
eq('no keyboard -> 0', scrollDeltaToReveal(700, null), 0);
eq('margin constant is 24', KEYBOARD_MARGIN, 24);

eq('field top 10 under the top edge 60 -> scroll up 74', scrollDeltaToRevealTop(10, 60), -74);
eq('field top 100 is visible -> 0', scrollDeltaToRevealTop(100, 60), 0);

// the sequence on Login: field 2 (password) bottom at 640 on a 780 px screen, keyboard 300 px (top 480)
const need = scrollDeltaToReveal(640, 480);
eq('Login password field at bottom 640, keyboard top 480 -> scroll 184', need, 184);
eq('after scrolling it ends 24 px above the keyboard', 640 - need, 480 - 24);

console.log(failed ? `\n${failed} FAILED` : '\nall keyboard geometry checks passed');
process.exit(failed ? 1 : 0);
