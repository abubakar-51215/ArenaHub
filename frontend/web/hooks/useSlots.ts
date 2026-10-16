/** TanStack Query hooks for owner slot management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { generateSlots, listOwnerSlots, setSlotStatus } from "@/services/slots";

export function useOwnerSlots(courtId: string, date: string) {
  return useQuery({
    queryKey: ["owner-slots", courtId, date],
    queryFn: () => listOwnerSlots(courtId, date),
  });
}

export function useGenerateSlots(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (range: { start_date: string; end_date: string }) => generateSlots(courtId, range),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-slots", courtId] }),
  });
}

export function useSetSlotStatus(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, status }: { slotId: string; status: "available" | "maintenance" }) =>
      setSlotStatus(courtId, slotId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-slots", courtId] }),
  });
}
