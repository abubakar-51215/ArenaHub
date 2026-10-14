// Checks lib/notice-target.ts: every notice an owner can get opens the right page on the web (as on the phone).
// Run: node scripts/check-notice-targets.mjs
import { ownerNoticeTarget } from "../lib/notice-target.ts";

const cases = [
  ["receipt_to_review", { booking_id: "b1" }, "/owner/bookings?status=pending_approval"],
  ["new_confirmed_booking", { count: 2 }, "/owner/bookings?status=confirmed"],
  ["refund_to_send", { booking_id: "b1" }, "/owner/payments?tab=refunds"],
  ["review_new", { arena_id: "a1", review_id: "r1" }, "/owner/reviews?arena=a1"],
  ["review_new", {}, "/owner/reviews"],
  ["arena_approved", { arena_name: "Kickoff Arena" }, "/owner/arenas"],
  ["arena_rejected", {}, "/owner/arenas"],
  ["arena_suspended", {}, "/owner/arenas"],
  ["arena_reactivated", {}, "/owner/arenas"],
  ["arena_deleted", {}, "/owner/arenas"],
  ["account_reactivated", {}, null], // read where it is
  ["booking_confirmed", { booking_id: "b1" }, null], // a player's notice, never an owner's
];
let bad = 0;
for (const [event, data, want] of cases) {
  const got = ownerNoticeTarget({ event, data });
  if (got !== want) {
    bad += 1;
    console.error(`FAIL ${event}: got ${got}, want ${want}`);
  }
}
console.log(bad ? `${bad} of ${cases.length} failed` : `notice targets: ${cases.length} cases pass`);
process.exit(bad ? 1 : 0);
