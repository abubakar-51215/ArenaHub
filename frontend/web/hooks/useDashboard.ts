/** TanStack Query hooks for the owner dashboard. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePayment,
  getCalendar,
  getDashboardSummary,
  getRevenue,
  listPendingApprovals,
  rejectPayment,
  type RevenueParams,
} from "@/services/dashboard";

export function useDashboardSummary() {
  return useQuery({ queryKey: ["dashboard-summary"], queryFn: getDashboardSummary });
}

export function usePendingApprovals(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["pending-approvals", page, pageSize],
    queryFn: () => listPendingApprovals(page, pageSize),
  });
}

export function useCalendar(arenaId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["calendar", arenaId ?? "none", from, to],
    queryFn: () => getCalendar(arenaId as string, from, to),
    enabled: !!arenaId,
  });
}

export function useRevenue(params: RevenueParams) {
  return useQuery({
    queryKey: ["revenue", params.arenaId ?? "all", params.dateFrom ?? "", params.dateTo ?? ""],
    queryFn: () => getRevenue(params),
  });
}

function invalidateApprovals(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["pending-approvals"] });
  qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
}

export function useApprovePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => approvePayment(paymentId),
    onSuccess: () => invalidateApprovals(qc),
  });
}

export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      rejectPayment(paymentId, reason),
    onSuccess: () => invalidateApprovals(qc),
  });
}
