// Reads the animated code the way the Reanimated babel plugin does and, for every worklet (a function that runs on the
// UI thread), lists the outside names it uses and flags any ORDINARY function it calls directly. On the UI thread an
// ordinary function is not callable: that is the red "X is not a function (it is Object)" error seen on a phone.
// Safe: numbers, strings, arrays, plain objects, shared values, other worklets, runOnJS(fn) (the way to call back into
// JavaScript) and Reanimated's own functions.
// Run from frontend/mobile:  node scripts/worklet-check.cjs        (V=1 lists every worklet and the names it uses)
const babel = require('@babel/core');
const path = require('path');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['lib/brand-motion.ts', 'components/brand/brand-mark.tsx', 'components/brand/animated-splash.tsx', 'components/ui/button.tsx', 'components/ui/confirm-sheet.tsx', 'components/ui/confirm-tick.tsx', 'components/ui/field.tsx', 'components/ui/pressable-scale.tsx', 'components/ui/range-slider.tsx', 'components/ui/skeleton.tsx', 'components/ui/toast.tsx', 'components/venue.tsx', 'hooks/use-shake.ts', 'components/g6/profile-ui.tsx', 'components/ui/bottom-sheet.tsx'];
const SAFE = new Set(['runOnJS', 'runOnUI', 'interpolate', 'interpolateColor', 'withTiming', 'withDelay', 'withRepeat', 'withSequence', 'withSpring', 'cancelAnimation', 'Easing', 'Extrapolation', 'clamp', 'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'isNaN', 'parseFloat', 'parseInt', '_ref0']);
const compiled = files.map((f) => ({ f, code: babel.transformFileSync(path.resolve(f), { babelrc: false, configFile: false, presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]], caller: { name: 'metro', platform: 'android', bundler: 'metro', isDev: true } }).code }));
// every worklet function name defined anywhere (an imported helper is safe only when it is one of these)
const workletFns = new Set();
for (const { code } of compiled) {
  for (const m of code.matchAll(/code:"function (\w+)\(/g)) {
    workletFns.add(m[1]);
    workletFns.add(m[1].replace(/_[A-Za-z]+Tsx?\d+$/, '')); // an exported helper is named kf_brandMotionTs2 by the plugin; the call site says kf
  }
}
for (const { code } of compiled) for (const m of code.matchAll(/(?:var|const|let)\s+(\w+)\s*=\s*function\s+\w+Factory\s*\(/g)) workletFns.add(m[1]);
let bad = 0;
for (const { f, code } of compiled) {
  const rows = [];
  for (const m of code.matchAll(/code:"function (\w+)\(([^)]*)\)\s*\{(.*?)\}",location:/gs)) {
    const body = m[3];
    const cl = body.match(/const\{([^}]*)\}=this\.__closure/);
    const names = cl ? cl[1].split(',').map((s) => s.trim().split(':').pop().trim()).filter(Boolean) : [];
    const called = names.filter((n) => new RegExp(`(^|[^.\\w])${n}\\(`).test(body.replace(new RegExp(`runOnJS\\(${n}\\)`, 'g'), '')));
    const flagged = called.filter((n) => !SAFE.has(n) && !workletFns.has(n));
    rows.push({ fn: m[1], names, called, flagged });
  }
  const problems = rows.flatMap((r) => r.flagged.map((n) => `${r.fn} calls ${n}`));
  console.log(`${f}: ${rows.length} worklet(s)  ${problems.length ? 'PROBLEM: ' + [...new Set(problems)].join('; ') : 'ok'}`);
  if (process.env.V) for (const r of rows) console.log('   ', r.fn, 'uses', [...new Set(r.names)].join(', '), '| calls', r.called.join(', ') || '-');
  bad += problems.length;
}
process.exit(bad ? 1 : 0);
