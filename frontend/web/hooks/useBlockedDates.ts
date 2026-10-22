/** TanStack Query hooks for owner blocked-dates management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { blockDate, listBlockedDates, unblockDate } from "@/services/blocked-dates";

const key = (arenaId: string) => ["blocked-dates", arenaId] as const;

export function useBlockedDates(arenaId: string | null) {
  return useQuery({
    queryKey: ["blocked-dates", arenaId ?? "none"],
    queryFn: () => listBlockedDates(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useBlockDate(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockedDate, reason }: { blockedDate: string; reason?: string }) =>
      blockDate(arenaId, blockedDate, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useUnblockDate(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: string) => unblockDate(arenaId, blockedId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}
