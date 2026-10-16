// Checks lib/karachi.ts (Asia/Karachi dates) while the process clock is set to different time zones.
// Run: node scripts/karachi-check.cjs        (it re-runs itself under several TZ settings)
const { spawnSync } = require('child_process');
const zones = ['Asia/Karachi', 'America/Los_Angeles', 'Pacific/Auckland', 'Europe/London', 'Asia/Tokyo', 'UTC'];
if (!process.env.KCHILD) {
  let bad = 0;
  for (const tz of zones) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, TZ: tz, KCHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(r.stdout);
    if (r.status !== 0) bad++;
  }
  console.log(bad ? `\n${bad} zone(s) FAILED` : '\nall karachi checks passed in every time zone');
  process.exit(bad ? 1 : 0);
}
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'karachi.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = new Module('karachi');
m._compile(js, 'karachi.js');
const K = m.exports;
let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failed++;
    console.log(`  FAIL ${process.env.TZ} ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};
const at = (s) => new Date(s);

// 2026-10-11 19:30:00 UTC is 2026-10-12 00:30 in Karachi: just after midnight there, still the 11th in London and LA
const justAfterMidnightPk = at('2026-10-11T19:30:00Z');
eq('today just after Karachi midnight', K.karachiToday(justAfterMidnightPk), '2026-10-12');
eq('today one minute before Karachi midnight', K.karachiToday(at('2026-10-11T18:59:00Z')), '2026-10-11');
eq('today at exactly Karachi midnight', K.karachiToday(at('2026-10-11T19:00:00Z')), '2026-10-12');
eq('minutes after midnight', K.karachiMinutes(justAfterMidnightPk), 30);
eq('parts across new year', K.karachiParts(at('2026-12-31T20:00:00Z')), { year: 2027, month: 1, day: 1, hour: 1, minute: 0, dow: 5 });
eq('addDays across a month', K.addDays('2026-10-30', 3), '2026-11-02');
eq('addDays across a year', K.addDays('2026-12-31', 1), '2027-01-01');
eq('dayDiff', K.dayDiff('2026-10-11', '2026-10-14'), 3);
eq('weekday of 2026-10-11 (Sunday)', K.weekdayOf('2026-10-11'), 0);
eq('formatDayShort', K.formatDayShort('2026-05-22'), 'Fri 22 May');
eq('formatDayLong', K.formatDayLong('2026-05-22'), 'Friday 22 May');
eq('clock evening', K.formatClock('18:00:00'), '6:00 PM');
eq('clock just after midnight', K.formatClock('00:05'), '12:05 AM');
eq('clock noon', K.formatClock('12:00'), '12:00 PM');
eq('the last hour ends at midnight', K.formatClock('23:59:59'), '12:00 AM');
eq('a closing time of 24:00 is midnight', K.formatClock('24:00'), '12:00 AM');
eq('23:00 stays 11 PM', K.formatClock('23:00:00'), '11:00 PM');

// "has started" compares Karachi wall clock, not the phone's
const now = at('2026-10-11T12:00:00Z'); // 17:00 in Karachi
eq('started earlier today', K.hasStarted('2026-10-11', '16:59', now), true);
eq('not started later today', K.hasStarted('2026-10-11', '17:01', now), false);
eq('started yesterday', K.hasStarted('2026-10-10', '23:00', now), true);
eq('not started tomorrow', K.hasStarted('2026-10-12', '00:00', now), false);

// the day strip starts at Karachi's today
const strip = K.dayStrip(3, justAfterMidnightPk);
eq('strip days', strip.map((d) => d.iso), ['2026-10-12', '2026-10-13', '2026-10-14']);
eq('strip first weekday', strip[0].weekday, 'Mon');

// notice groups use the Karachi calendar day
eq('group today', K.dayGroup(at('2026-10-11T20:00:00Z'), justAfterMidnightPk), 'Today'); // 01:00 on the 12th, Karachi
eq('group yesterday', K.dayGroup(at('2026-10-11T10:00:00Z'), justAfterMidnightPk), 'Yesterday');
eq('group earlier', K.dayGroup(at('2026-10-09T10:00:00Z'), justAfterMidnightPk), 'Earlier');
eq('group a notice 20 hours old', K.dayGroup(at('2026-10-10T23:30:00Z'), at('2026-10-11T19:30:00Z')), 'Yesterday');

eq('timeAgo just now', K.timeAgo(at('2026-10-11T12:00:00Z'), at('2026-10-11T12:00:30Z')), 'Just now');
eq('timeAgo 5 min', K.timeAgo(at('2026-10-11T11:55:00Z'), at('2026-10-11T12:00:30Z')), '5 min ago');
eq('timeAgo 1 hour', K.timeAgo(at('2026-10-11T11:00:00Z'), at('2026-10-11T12:00:30Z')), '1 hour ago');
eq('timeAgo 3 days', K.timeAgo(at('2026-10-08T12:00:00Z'), at('2026-10-11T12:00:30Z')), '3 days ago');
eq('timeAgo 1 week', K.timeAgo(at('2026-10-04T12:00:00Z'), at('2026-10-11T12:00:30Z')), '1 week ago');
eq('timeAgo old date, same year', K.timeAgo(at('2026-04-27T12:00:00Z'), at('2026-10-11T12:00:30Z')), '27 Apr');
eq('timeAgo old date, other year', K.timeAgo(at('2025-04-27T12:00:00Z'), at('2026-10-11T12:00:30Z')), '27 Apr 2025');
eq(
  'shortAgo',
  [K.shortAgo(at('2026-10-11T12:00:00Z'), at('2026-10-11T12:00:30Z')), K.shortAgo(at('2026-10-11T09:59:00Z'), at('2026-10-11T12:00:00Z')), K.shortAgo(at('2026-10-10T10:00:00Z'), at('2026-10-11T12:00:00Z'))],
  ['now', '2 h', '1 d'],
);
eq('review date, same year', K.formatDate('2026-04-27T12:00:00Z', at('2026-10-11T12:00:00Z')), '27 Apr');
// a time with no zone is the server's wall clock = Karachi time, whatever the phone's zone is
eq('naive time read as Karachi', K.parseTs('2026-10-11T12:00:00').toISOString(), '2026-10-11T07:00:00.000Z');
eq('Z time kept', K.parseTs('2026-10-11T12:00:00.123456Z').toISOString(), '2026-10-11T12:00:00.123Z');
eq('offset time kept', K.parseTs('2026-10-11T12:00:00+05:00').toISOString(), '2026-10-11T07:00:00.000Z');
eq('naive date of a review', K.karachiDate('2026-10-11T00:30:00'), '2026-10-11');
eq('naive review time ago', K.timeAgo('2026-10-11T12:00:00', at('2026-10-11T07:05:00Z')), '5 min ago');
console.log(`${failed ? 'FAIL' : 'ok  '} ${process.env.TZ}`);
process.exit(failed ? 1 : 0);
