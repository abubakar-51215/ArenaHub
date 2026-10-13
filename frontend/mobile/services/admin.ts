/** Admin on the phone: the calls the admin screens make (all of them need an admin sign-in; the server refuses anyone else). */
import { api } from '../lib/api';
import type { Page } from '../types';

export interface PhoneOverview {
  pending_arenas: number;
  oldest_pending_arena_name: string | null;
  oldest_pending_arena_at: string | null;
  open_complaints: number;
  oldest_open_complaint_at: string | null;
  bookings_today: number;
  refunds_waiting: number;
  refunds_waiting_amount: string;
}

export type ArenaScope = 'waiting' | 'approved' | 'rejected' | 'live' | 'suspended' | 'all';

export interface AdminArenaCard {
  id: string;
  name: string;
  city: string;
  area: string | null;
  status: 'pending' | 'approved' | 'rejected';
  is_suspended: boolean;
  sports_offered: string[];
  owner_name: string;
  created_at: string;
}

export interface AdminArenaSummary extends AdminArenaCard {
  description: string | null;
  address: string;
  images: string[];
  owner_email: string;
  courts: number;
  min_price: string | null;
  avg_rating: number | null;
  review_count: number;
  upcoming_bookings: number;
  rejection_reason: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
}

export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: 'player' | 'owner' | 'admin';
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  total_bookings: number;
  total_complaints: number;
  suspended_reason: string | null;
}

export interface AdminComplaint {
  id: string;
  player_id: string;
  player_name: string;
  category: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved';
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AdminPayment {
  id: string;
  booking_code: string;
  player_name: string;
  arena_name: string | null;
  amount: string;
  payment_method: string;
  status: string;
  lifecycle_status: string;
  created_at: string;
  refund_pending: boolean;
}

export interface AdminRefund {
  id: string;
  status: 'pending' | 'processed' | 'failed';
  amount: string;
  reason: string | null;
  payment_method: string;
  player_name: string;
  booking_code: string;
  arena_name: string;
  court_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  processed_at: string | null;
  can_mark_paid: boolean;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const getPhoneOverview = () => api.get<PhoneOverview>('/admin/phone/overview');

export const listArenaCards = (scope: ArenaScope, search?: string) =>
  api.get<Page<AdminArenaCard>>(`/admin/arena-cards${qs({ scope, search: search?.trim(), page_size: 50 })}`);
export const getArenaSummary = (id: string) => api.get<AdminArenaSummary>(`/admin/arenas/${id}/summary`);
export const approveArena = (id: string) => api.post<unknown>(`/admin/arenas/${id}/approve`);
export const rejectArena = (id: string, reason: string) => api.post<unknown>(`/admin/arenas/${id}/reject`, { reason });
export const suspendArena = (id: string, reason: string) => api.post<unknown>(`/admin/arenas/${id}/suspend`, { reason });
export const reactivateArena = (id: string) => api.post<unknown>(`/admin/arenas/${id}/reactivate`);

export const ADMIN_USERS_PAGE = 50;
export const listAdminUsers = (role?: 'player' | 'owner', search?: string, page = 1) =>
  api.get<Page<AdminUser>>(`/admin/users${qs({ role, search: search?.trim(), page, page_size: ADMIN_USERS_PAGE })}`);
export const getAdminUser = (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`);
export const suspendUser = (id: string, reason: string) => api.patch<AdminUser>(`/admin/users/${id}/suspend`, { reason });
export const reactivateUser = (id: string) => api.patch<AdminUser>(`/admin/users/${id}/reactivate`);

export const listAdminComplaints = (status?: 'open' | 'resolved') =>
  api.get<Page<AdminComplaint>>(`/admin/complaints${qs({ status, page_size: 50 })}`);
export const getAdminComplaint = (id: string) => api.get<AdminComplaint>(`/admin/complaints/${id}`);
export const replyToComplaint = (id: string, text: string) =>
  api.put<AdminComplaint>(`/admin/complaints/${id}`, { admin_response: text, status: 'resolved' });

export const listAdminPayments = () => api.get<Page<AdminPayment>>('/admin/payments?page_size=50');
export const listAdminRefunds = (status: 'pending' | 'processed' | 'all') =>
  api.get<Page<AdminRefund>>(`/admin/refunds${qs({ status, page_size: 50 })}`);
export const markRefundPaid = (id: string) =>
  api.post<{ refund: AdminRefund; already_processed: boolean }>(`/admin/refunds/${id}/mark-paid`);
