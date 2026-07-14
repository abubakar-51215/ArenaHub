/** TanStack Query hooks for owner equipment management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type EquipmentInput,
  adjustQuantity,
  createEquipment,
  deleteEquipment,
  listEquipment,
  updateEquipment,
} from "@/services/equipment";

const key = (arenaId: string) => ["equipment", arenaId] as const;

export function useEquipment(arenaId: string | null) {
  return useQuery({
    queryKey: ["equipment", arenaId ?? "none"],
    queryFn: () => listEquipment(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useCreateEquipment(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentInput) => createEquipment(arenaId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useUpdateEquipment(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      equipmentId,
      input,
    }: {
      equipmentId: string;
      input: Partial<Omit<EquipmentInput, "quantity_total">>;
    }) => updateEquipment(equipmentId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useAdjustQuantity(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ equipmentId, delta }: { equipmentId: string; delta: number }) =>
      adjustQuantity(equipmentId, delta),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useDeleteEquipment(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (equipmentId: string) => deleteEquipment(equipmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}
