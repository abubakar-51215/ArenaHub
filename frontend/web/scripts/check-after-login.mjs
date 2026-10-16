// Checks lib/after-login.ts: after signing in, a page under the console is reopened; anything else goes home.
// Run: node scripts/check-after-login.mjs
import { afterLogin } from "../lib/after-login.ts";

const cases = [
  ["/owner", "?next=%2Fowner%2Fpayments", "/owner/payments"],
  ["/owner", "?next=%2Fowner%2Fbookings%3Fstatus%3Dpending", "/owner/bookings?status=pending"],
  ["/owner", "", "/owner"],
  ["/owner", "?next=%2Fadmin%2Fusers", "/owner"],
  ["/owner", "?next=%2F%2Fevil.example%2Fowner", "/owner"],
  ["/owner", "?next=https%3A%2F%2Fevil.example%2Fowner", "/owner"],
  ["/owner", "?next=%2Fownerx", "/owner"],
  ["/admin", "?next=%2Fadmin%2Fusers", "/admin/users"],
  ["/admin", "?next=%2Fowner", "/admin"],
];
let bad = 0;
for (const [home, search, want] of cases) {
  globalThis.window = { location: { search } };
  const got = afterLogin(home);
  if (got !== want) {
    bad += 1;
    console.error(`FAIL ${home} ${search || "(none)"}: got ${got}, want ${want}`);
  }
}
console.log(bad ? `${bad} of ${cases.length} failed` : `after-login: ${cases.length} cases pass`);
process.exit(bad ? 1 : 0);
