/** The player's booking-history report (a file, not JSON). */
import { API_BASE } from '../lib/config';
import { useAuthStore } from '../store/auth';

export async function fetchMyBookingsReport(opts: { from?: string; to?: string; format?: 'pdf' | 'csv' }): Promise<{ bytes: Uint8Array; filename: string; mime: string }> {
  const format = opts.format ?? 'pdf';
  const qs = new URLSearchParams({ format });
  if (opts.from) qs.set('date_from', opts.from);
  if (opts.to) qs.set('date_to', opts.to);
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE}/reports/my-bookings?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw new Error('Could not make the report.');
  const stamp = new Date().toISOString().slice(0, 10);
  return { bytes: new Uint8Array(await res.arrayBuffer()), filename: `arenahub-bookings-${stamp}.${format}`, mime: format === 'pdf' ? 'application/pdf' : 'text/csv' };
}
