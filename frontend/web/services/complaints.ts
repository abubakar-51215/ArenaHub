/** Admin complaint triage API calls. */
import { api } from "@/services/api";
import type { Complaint, ComplaintCategory, ComplaintStatus, Page } from "@/types";

export function listComplaints(params: {
  status?: ComplaintStatus;
  category?: ComplaintCategory;
  page?: number;
  page_size?: number;
}): Promise<Page<Complaint>> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.category) q.set("category", params.category);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 20));
  return api.get<Page<Complaint>>(`/admin/complaints?${q.toString()}`);
}

export function respondToComplaint(
  complaintId: string,
  adminResponse: string,
  status: ComplaintStatus,
): Promise<Complaint> {
  return api.put<Complaint>(`/admin/complaints/${complaintId}`, {
    admin_response: adminResponse,
    status,
  });
}
