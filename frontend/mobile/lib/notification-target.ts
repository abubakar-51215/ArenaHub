import type { AppNotification } from '@/services/notifications';

/** What a notice is about, so a tap can open it. */
export type NoticeTarget =
  | { kind: 'booking'; bookingId: string }
  | { kind: 'match'; matchId: string }
  | { kind: 'review'; arenaId: string; bookingId: string }
  | { kind: 'complaint'; complaintId: string }
  | { kind: 'none' };

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function noticeTarget(n: Pick<AppNotification, 'event' | 'data'>): NoticeTarget {
  const d = n.data ?? {};
  if (n.event === 'rate_your_game') {
    const arenaId = str(d.arena_id);
    const bookingId = str(d.booking_id);
    return arenaId && bookingId ? { kind: 'review', arenaId, bookingId } : { kind: 'none' };
  }
  if (n.event.startsWith('match_')) {
    const matchId = str(d.match_id);
    return matchId ? { kind: 'match', matchId } : { kind: 'none' };
  }
  if (n.event === 'complaint_reply') {
    const complaintId = str(d.complaint_id);
    return complaintId ? { kind: 'complaint', complaintId } : { kind: 'none' };
  }
  const bookingId = str(d.booking_id);
  return bookingId ? { kind: 'booking', bookingId } : { kind: 'none' };
}

/** What an admin notice is about (arena-hub-admin-app.html: Admin notifications). */
export type AdminNoticeTarget =
  | { kind: 'approval'; arenaId: string }
  | { kind: 'complaint'; complaintId: string }
  | { kind: 'none' };

export function adminNoticeTarget(n: Pick<AppNotification, 'event' | 'data'>): AdminNoticeTarget {
  const d = n.data ?? {};
  if (n.event === 'arena_waiting') {
    const arenaId = str(d.arena_id);
    return arenaId ? { kind: 'approval', arenaId } : { kind: 'none' };
  }
  if (n.event === 'complaint_new') {
    const complaintId = str(d.complaint_id);
    return complaintId ? { kind: 'complaint', complaintId } : { kind: 'none' };
  }
  return { kind: 'none' };
}

export type NoticeTone = 'ok' | 'wait' | 'off' | 'idle';
export type NoticeIcon = 'tick' | 'clock' | 'receipt' | 'star' | 'close' | 'people' | 'bell' | 'lifebuoy';

/** The coloured tile of a notice: lime for good news, amber for waiting and reminders, red for trouble. */
export function noticeLook(event: string): { tone: NoticeTone; icon: NoticeIcon } {
  switch (event) {
    case 'booking_confirmed':
    case 'new_confirmed_booking':
    case 'balance_paid':
      return { tone: 'ok', icon: 'tick' };
    case 'booking_reminder_24h':
    case 'booking_reminder_1h':
    case 'payment_reminder':
      return { tone: 'wait', icon: 'clock' };
    case 'refund_completed':
      return { tone: 'ok', icon: 'receipt' };
    case 'refund_initiated':
    case 'refund_needs_manual':
    case 'refund_to_send':
      return { tone: 'wait', icon: 'receipt' };
    case 'rate_your_game':
      return { tone: 'wait', icon: 'star' };
    case 'booking_cancelled':
    case 'booking_payment_failed':
    case 'receipt_rejected':
    case 'match_cancelled':
      return { tone: 'off', icon: 'close' };
    case 'match_joined':
    case 'match_left':
    case 'match_full':
      return { tone: 'ok', icon: 'people' };
    case 'complaint_reply':
      return { tone: 'ok', icon: 'lifebuoy' };
    default:
      return { tone: 'idle', icon: 'bell' };
  }
}
