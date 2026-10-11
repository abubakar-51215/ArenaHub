/** Player-facing complaint API calls (Help and support). */
import { api } from '../lib/api';
import type { Page } from '../types';

export type ComplaintCategory = 'booking_issue' | 'payment_issue' | 'arena_quality' | 'owner_behavior' | 'technical_problem' | 'other';
export type ComplaintStatus = 'open' | 'under_review' | 'resolved';

export interface Complaint {
  id: string;
  category: ComplaintCategory;
  description: string;
  status: ComplaintStatus;
  admin_response: string | null;
  resolved_at: string | null;
  created_at: string;
  /** When the complaint last changed (the time of the latest reply). */
  updated_at: string | null;
}

export const MAX_COMPLAINT = 2000;

export function listMyComplaints(): Promise<Page<Complaint>> {
  return api.get<Page<Complaint>>('/complaints/my?page_size=50');
}

export function getMyComplaint(id: string): Promise<Complaint> {
  return api.get<Complaint>(`/complaints/${id}`);
}

export function submitComplaint(category: ComplaintCategory, description: string): Promise<Complaint> {
  return api.post<Complaint>('/complaints', { category, description });
}
