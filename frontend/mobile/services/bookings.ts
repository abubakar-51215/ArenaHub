/** Player-facing booking API calls. */
import { api } from '../lib/api';
import type { Booking, BookingGroup, BookingStatus, Page, PaymentPlan } from '../types';

export interface BookingCreateInput {
  court_id: string;
  slot_ids: string[];
  payment_type: PaymentPlan;
  discount_code?: string;
  equipment?: { equipment_id: string; quantity: number }[];
}

export function createBooking(data: BookingCreateInput): Promise<BookingGroup> {
  return api.post<BookingGroup>('/bookings', data);
}

export function listMyBookings(status?: BookingStatus): Promise<Page<Booking>> {
  const qs = status ? `?status=${status}&page_size=50` : '?page_size=50';
  return api.get<Page<Booking>>(`/bookings${qs}`);
}

export function getBooking(bookingId: string): Promise<Booking> {
  return api.get<Booking>(`/bookings/${bookingId}`);
}

export function cancelBooking(bookingId: string, reason?: string): Promise<Booking> {
  return api.post<Booking>(`/bookings/${bookingId}/cancel`, { reason });
}

export function rescheduleBooking(bookingId: string, newSlotId: string): Promise<Booking> {
  return api.post<Booking>(`/bookings/${bookingId}/reschedule`, { new_slot_id: newSlotId });
}
