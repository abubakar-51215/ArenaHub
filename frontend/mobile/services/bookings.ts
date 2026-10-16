/** Player-facing booking API calls. */
import { api } from '../lib/api';
import type { Booking, BookingGroup, BookingGroupDetails, BookingGroupItem, BookingPreview, BookingStatus, CancelPreview, Page, PaymentPlan, ReschedulePreview } from '../types';

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

export interface BookingPreviewInput {
  court_id: string;
  slot_ids: string[];
  discount_code?: string;
  equipment?: { equipment_id: string; quantity: number }[];
}

/** The price of a checkout with nothing reserved (a 409 means a time was taken). */
export function previewBooking(data: BookingPreviewInput): Promise<BookingPreview> {
  return api.post<BookingPreview>('/bookings/preview', data);
}

export function getBookingGroup(groupId: string): Promise<BookingGroupDetails> {
  return api.get<BookingGroupDetails>(`/bookings/group/${groupId}`);
}

/** Leave checkout and give the times back. */
export function releaseBookingGroup(groupId: string): Promise<BookingGroupDetails> {
  return api.post<BookingGroupDetails>(`/bookings/group/${groupId}/release`);
}

export type BookingTab = 'upcoming' | 'past' | 'cancelled';

/** My bookings: one item per booking, the tab decided by the server. */
export function listBookingGroups(tab: BookingTab, page = 1, pageSize = 50): Promise<Page<BookingGroupItem>> {
  return api.get<Page<BookingGroupItem>>(`/bookings/groups?tab=${tab}&page=${page}&page_size=${pageSize}`);
}

export function getCancelPreview(groupId: string): Promise<CancelPreview> {
  return api.get<CancelPreview>(`/bookings/group/${groupId}/cancel-preview`);
}

/** Cancel the whole booking; the refund is worked out once by the server. */
export function cancelBookingGroup(groupId: string, reason?: string): Promise<BookingGroupDetails> {
  return api.post<BookingGroupDetails>(`/bookings/group/${groupId}/cancel`, { reason });
}

export function previewReschedule(groupId: string, newSlotIds: string[]): Promise<ReschedulePreview> {
  return api.post<ReschedulePreview>(`/bookings/group/${groupId}/reschedule-preview`, { new_slot_ids: newSlotIds });
}

export function rescheduleBookingGroup(groupId: string, newSlotIds: string[]): Promise<BookingGroupDetails> {
  return api.post<BookingGroupDetails>(`/bookings/group/${groupId}/reschedule`, { new_slot_ids: newSlotIds });
}
