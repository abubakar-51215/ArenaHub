import { adminNoticeTarget, noticeTarget } from '@/lib/notification-target';
import { getBooking } from '@/services/bookings';

/**
 * Where a tapped push notification should open, from the same allowlisted event -> target mapping the
 * in-app notification lists already use (lib/notification-target.ts) — never a path built directly from
 * push data. Returns null when the event is unknown or its data is missing/invalid, so the caller falls
 * back to a safe screen instead of guessing.
 */
export async function resolvePushPath(
  event: string,
  data: Record<string, unknown>,
  role: string | undefined,
): Promise<string | null> {
  if (role === 'admin') {
    const target = adminNoticeTarget({ event, data });
    if (target.kind === 'approval') return `/admin/approvals/${target.arenaId}`;
    if (target.kind === 'complaint') return `/admin/complaints/${target.complaintId}`;
    return null;
  }

  const target = noticeTarget({ event, data });
  if (target.kind === 'none') return null;
  try {
    if (target.kind === 'booking') {
      const booking = await getBooking(target.bookingId);
      return `/booking/detail/${booking.booking_group_id}`;
    }
    if (target.kind === 'match') return `/play/${target.matchId}`;
    if (target.kind === 'review') return `/arena/${target.arenaId}/reviews?bookingId=${target.bookingId}`;
    if (target.kind === 'complaint') return `/support/${target.complaintId}`;
  } catch {
    return null; // e.g. the booking no longer exists or the lookup failed — fall back
  }
  return null;
}
