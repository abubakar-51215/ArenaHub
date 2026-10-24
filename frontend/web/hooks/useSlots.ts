/** TanStack Query hooks for owner slot management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteSlot,
  generateSlots,
  listOwnerSlots,
  updateSlot,
  type SlotChange,
} from "@/services/slots";

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

export function useUpdateSlot(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, change }: { slotId: string; change: SlotChange }) =>
      updateSlot(courtId, slotId, change),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-slots", courtId] }),
  });
}

export function useDeleteSlot(courtId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => deleteSlot(courtId, slotId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-slots", courtId] }),
  });
}
