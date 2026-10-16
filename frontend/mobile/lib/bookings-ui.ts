import type { PillTone } from '@/components/booking/parts';
import { formatRs } from '@/lib/money';
import type { BookingStatus } from '@/types';

/** The status tag of a booking, as the My bookings frames word it. */
export function statusPill(status: BookingStatus): { label: string; tone: PillTone } {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmed', tone: 'ok' };
    case 'pending_payment':
      return { label: 'Awaiting payment', tone: 'wait' };
    case 'pending_approval':
      return { label: 'Awaiting approval', tone: 'wait' };
    case 'completed':
      return { label: 'Completed', tone: 'idle' };
    case 'rejected':
      return { label: 'Receipt not accepted', tone: 'off' };
    default:
      return { label: 'Cancelled', tone: 'off' };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-05-22" -> { day: "22", month: "May", weekday: "Fri" } for the date block. */
export function dateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { day: String(d).padStart(2, '0'), month: MONTHS[m - 1], weekday: DAYS[new Date(y, m - 1, d).getDay()] };
}

/** The refund line of a cancelled booking: Refunded ₨ X, Refund pending or No refund. */
export function refundLine(amount: string, status: 'pending' | 'processed' | 'failed' | null): string {
  if (!status || Number(amount) <= 0) return 'No refund';
  if (status === 'processed') return `Refunded ${formatRs(amount)}`;
  if (status === 'failed') return 'Refund needs help. Contact the arena.';
  return 'Refund pending';
}
