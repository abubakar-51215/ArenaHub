import { useQuery } from "@tanstack/react-query";

import { countPendingRefunds, listOwnerRefunds, type RefundFilter } from "@/services/refunds";

export function useOwnerRefunds(status: RefundFilter, arenaId?: string) {
  return useQuery({
    queryKey: ["owner-refunds", status, arenaId ?? ""],
    queryFn: () => listOwnerRefunds(status, arenaId),
  });
}

/** The number of refunds waiting for the owner; refreshes every minute and when the window is focused. */
export function usePendingRefundCount() {
  return useQuery({
    queryKey: ["owner-refunds-count"],
    queryFn: countPendingRefunds,
    refetchInterval: 60_000,
  });
}
