// Checks lib/deeplink.ts: which links are kept while signed out. Run: node scripts/deeplink-check.cjs
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'deeplink.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = new Module('deeplink');
m._compile(js, 'deeplink.js');
const D = m.exports;
let failed = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
};
eq('app link to a match', D.pathFromUrl('arenahub://play/abc-123'), '/play/abc-123');
eq('app link with a query', D.pathFromUrl('arenahub://arena/xyz/reviews?bookingId=7'), '/arena/xyz/reviews?bookingId=7');
eq('dev client link', D.pathFromUrl('exp://192.168.1.5:8081/--/booking/detail/g1'), '/booking/detail/g1');
eq('web address', D.pathFromUrl('https://arenahub.example/support/42'), '/support/42');
eq('log in is not kept', D.pathFromUrl('arenahub://login'), null);
eq('auth group is not kept', D.pathFromUrl('arenahub://(auth)/register'), null);
eq('empty', D.pathFromUrl('arenahub://'), null);
eq('null', D.pathFromUrl(null), null);
eq('unknown screen', D.pathFromUrl('arenahub://something/else'), null);
eq('tab screen Bookings', D.pathFromUrl('http://localhost:8081/bookings'), '/bookings');
eq('tab screen Search', D.pathFromUrl('arenahub://search?q=padel'), '/search?q=padel');
eq('admin screen', D.pathFromUrl('http://localhost:8081/admin/users/u1'), '/admin/users/u1');
eq('player link fits a player', D.linkFitsRole('/bookings', 'player'), true);
eq('admin link never opens for a player', D.linkFitsRole('/admin/users', 'player'), false);
eq('admin link fits an admin', D.linkFitsRole('/admin/users', 'admin'), true);
eq('player link never opens for an admin', D.linkFitsRole('/bookings', 'admin'), false);
const courts = [{ id: 'c1' }, { id: 'c2' }];
eq('slot link with no arena', D.arenaLinkProblem({ arenaId: undefined, courtId: 'c1' }), 'not-found');
eq('slot link with a removed arena (404)', D.arenaLinkProblem({ arenaId: 'a1', courtId: 'c1', errorStatuses: [404, null] }), 'not-found');
eq('slot link whose court belongs to another arena', D.arenaLinkProblem({ arenaId: 'a1', courtId: 'c9', courts }), 'not-found');
eq('slot link with a network failure is not "not found"', D.arenaLinkProblem({ arenaId: 'a1', courtId: 'c1', errorStatuses: [0, 503] }), null);
eq('a good slot link', D.arenaLinkProblem({ arenaId: 'a1', courtId: 'c1', courts }), null);
eq('still loading courts', D.arenaLinkProblem({ arenaId: 'a1', courtId: 'c1', courts: undefined }), null);
D.rememberLink('/play/abc');
D.rememberLink(null);
eq('pending kept', D.takePendingLink(), '/play/abc');
eq('pending taken once', D.takePendingLink(), null);
console.log(failed ? `${failed} FAILED` : 'all deep link checks passed');
process.exit(failed ? 1 : 0);
