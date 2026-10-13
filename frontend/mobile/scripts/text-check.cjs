// Checks the wording helpers of lib/text.ts and the money format of lib/money.ts (join without empty parts, the suspend count, the Overview rows for 1 and more).
// Run: node scripts/text-check.cjs
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'text.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = new Module('text');
m._compile(js, 'text.js');
const T = m.exports;
const msrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'money.ts'), 'utf8');
const mm = new Module('money');
mm._compile(ts.transpileModule(msrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, 'money.js');
const M = mm.exports;
let failed = 0;
const eq = (name, got, want) => {
  if (got !== want) {
    failed++;
    console.log(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else console.log(`  ok   ${name}`);
};
eq('dotJoin skips empty parts', T.dotJoin(['Goal Line Arena', '', 'Oct 15']), 'Goal Line Arena · Oct 15');
eq('dotJoin skips null and spaces', T.dotJoin(['A', null, '  ', 'B', undefined, false]), 'A · B');
eq('dotJoin all empty', T.dotJoin(['', null]), '');
eq('suspend 0', T.suspendCountText(0), 'No upcoming bookings to cancel.');
eq('suspend 1', T.suspendCountText(1), '1 upcoming booking will be cancelled with a full refund.');
eq('suspend 14', T.suspendCountText(14), '14 upcoming bookings will be cancelled with a full refund.');
eq('arenas 1', T.needArenas(1), '1 arena waiting for approval');
eq('arenas 3', T.needArenas(3), '3 arenas waiting for approval');
eq('complaints 1', T.needComplaints(1), '1 complaint without a reply');
eq('complaints 5', T.needComplaints(5), '5 complaints without a reply');
eq('refunds 1', T.needRefunds(1), '1 refund waiting to be paid');
eq('refunds 3', T.needRefunds(3), '3 refunds waiting to be paid');
eq('refund total 1', T.refundTotalText(1, '₨ 3,000'), '₨ 3,000');
eq('refund total 3', T.refundTotalText(3, '₨ 8,000'), '₨ 8,000 in total');
eq('money whole', M.formatRs('2000.00'), '₨ 2,000');
eq('money paisa kept', M.formatRs('2500.50'), '₨ 2,500.50');
eq('money half of 2500.50', M.formatRs('1250.25'), '₨ 1,250.25');
eq('money millions', M.formatRs(1234567), '₨ 1,234,567');
eq('money zero', M.formatRs(0), '₨ 0');
eq('money negative', M.formatRs(-3000), '₨ -3,000');
eq('money bad', M.formatRs('abc'), '');
console.log(failed ? `\n${failed} text check(s) FAILED` : '\nall text checks passed');
process.exit(failed ? 1 : 0);
