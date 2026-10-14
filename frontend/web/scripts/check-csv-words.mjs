// Checks lib/bookings-csv.ts: the owner Bookings CSV uses the screen's words, money, dates and times, never raw keys.
// Run: node scripts/check-csv-words.mjs
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const nodeRequire = createRequire(import.meta.url);
const loaded = {};
function load(name) {
  if (loaded[name]) return loaded[name].exports;
  const src = fs.readFileSync(path.join(lib, `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = new Module(name);
  m.require = (id) => (id.startsWith('./') ? load(id.slice(2)) : nodeRequire(id));
  loaded[name] = m;
  m._compile(js, `${name}.js`);
  return m.exports;
}
const { bookingsCsv } = load('bookings-csv');

const row = (over) => ({
  booking_id: 'b1',
  booking_code: 'AHB-1A2B3C',
  booking_date: '2026-10-14',
  start_time: '19:00:00',
  end_time: '20:00:00',
  arena_name: 'Kickoff Arena',
  court_name: 'Court A',
  player_name: 'Ayesha "AK" Khan',
  total_amount: '2500.50',
  status: 'confirmed',
  payment_id: 'p1',
  payment_method: 'bank_transfer',
  payment_status: 'completed',
  ...over,
});
const csv = bookingsCsv([
  row(),
  row({ status: 'pending_payment', payment_method: null, payment_status: null, total_amount: '2000.00' }),
  row({ status: 'pending_approval', payment_status: 'pending' }),
  row({ status: 'cancelled', payment_status: 'refunded', start_time: '23:00:00', end_time: '23:59:59' }),
]);
const lines = csv.split('\n');
let failed = 0;
const eq = (name, got, want) => {
  if (got !== want) {
    failed++;
    console.log(`FAIL ${name}:\n  got  ${got}\n  want ${want}`);
  }
};
eq('header', lines[0], 'Booking,Date,Time,Arena,Court,Customer,Status,Payment,Amount');
eq('a paid booking', lines[1], '"AHB-1A2B3C","Oct 14, 2026","7:00 PM – 8:00 PM","Kickoff Arena","Court A","Ayesha ""AK"" Khan","Confirmed","Bank transfer · paid","Rs. 2,500.50"');
eq('not paid yet', lines[2].split('","').slice(6).join('|'), 'Awaiting payment|Not paid yet|Rs. 2,000"');
eq('receipt to review', lines[3].split('","').slice(6, 8).join('|'), 'Pending approval|Bank transfer · receipt to review');
eq('refunded, last hour of the day', lines[4].split('","').slice(2, 3).concat(lines[4].split('","').slice(6, 8)).join('|'), '11:00 PM – 12:00 AM|Cancelled|Bank transfer · refunded');
const raw = /\b[a-z]+_[a-z_]+\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}:\d{2}:\d{2}\b|(?<![\d,.])\d{4,}\.\d{2}\b/;
const bad = lines.slice(1).find((l) => raw.test(l));
eq('no raw keys, ISO dates, 24-hour times or bare amounts', bad ?? 'none', 'none');
console.log(failed ? `${failed} FAILED` : `csv words: ${lines.length - 1} rows in the screen's words`);
process.exit(failed ? 1 : 0);
