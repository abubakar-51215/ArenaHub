/** Owner refunds: the list of refunds on the owner's own arenas, and "Mark as paid" for bank-transfer ones. */
import { api } from "@/services/api";
import type { OwnerRefund, Page } from "@/types";

export type RefundFilter = "pending" | "processed" | "all";

export function listOwnerRefunds(status: RefundFilter, arenaId?: string): Promise<Page<OwnerRefund>> {
  const q = new URLSearchParams({ status, page_size: "100" });
  if (arenaId) q.set("arena_id", arenaId);
  return api.get<Page<OwnerRefund>>(`/owner/refunds?${q.toString()}`);
}

/** How many refunds wait for the owner (the number on the tab and in the sidebar). */
export async function countPendingRefunds(): Promise<number> {
  const page = await api.get<Page<OwnerRefund>>("/owner/refunds?status=pending&page_size=1");
  return page.total;
}

export interface MarkPaidResult {
  refund: OwnerRefund;
  already_processed: boolean;
}

export function markRefundPaid(refundId: string): Promise<MarkPaidResult> {
  return api.post<MarkPaidResult>(`/owner/refunds/${refundId}/mark-paid`);
}
