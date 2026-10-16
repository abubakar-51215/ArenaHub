/**
 * Where an owner's notice opens on the web, like a notice on the phone opens its booking, match or review.
 * null = nothing to open (the notice is read where it is). No imports, so scripts/check-notice-targets.mjs can load it.
 */
export interface NoticeLike {
  event: string;
  data?: Record<string, unknown> | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function ownerNoticeTarget(n: NoticeLike): string | null {
  const d = n.data ?? {};
  switch (n.event) {
    case "receipt_to_review":
      return "/owner/bookings?status=pending_approval"; // the receipt waits in Bookings, "Pending approval"
    case "new_confirmed_booking":
      return "/owner/bookings?status=confirmed";
    case "refund_to_send":
      return "/owner/payments?tab=refunds";
    case "review_new": {
      const arena = str(d.arena_id);
      return arena ? `/owner/reviews?arena=${arena}` : "/owner/reviews";
    }
    case "arena_approved":
    case "arena_rejected":
    case "arena_suspended":
    case "arena_reactivated":
    case "arena_deleted":
      return "/owner/arenas";
    default:
      return null;
  }
}
