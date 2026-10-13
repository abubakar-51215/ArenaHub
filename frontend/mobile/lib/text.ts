/** Parts of a line joined with " · ", skipping any that are empty (no "A · · B"). */
export function dotJoin(parts: (string | null | undefined | false)[], sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join(sep);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The Suspend arena sheet: how many upcoming bookings the suspension cancels (from the server), worded for 0, 1 and more. */
export function suspendCountText(n: number): string {
  if (n === 0) return 'No upcoming bookings to cancel.';
  return `${n} upcoming ${plural(n, 'booking', 'bookings')} will be cancelled with a full refund.`;
}

/** The "Needs you" rows of the admin Overview, worded for 1 and more (a row with 0 is not shown). */
export const needArenas = (n: number): string => `${n} ${plural(n, 'arena', 'arenas')} waiting for approval`;
export const needComplaints = (n: number): string => `${n} ${plural(n, 'complaint', 'complaints')} without a reply`;
export const needRefunds = (n: number): string => `${n} ${plural(n, 'refund', 'refunds')} waiting to be paid`;
/** "₨ 3,000" for one refund, "₨ 8,000 in total" for several. */
export const refundTotalText = (n: number, amount: string): string => (n === 1 ? amount : `${amount} in total`);
