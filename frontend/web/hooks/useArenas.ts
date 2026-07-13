/** TanStack Query hooks for owner arena management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type ArenaInput,
  createArena,
  deactivateArena,
  listMyArenas,
  resubmitArena,
  updateArena,
} from "@/services/arenas";

const KEY = ["arenas"] as const;

export function useMyArenas() {
  return useQuery({ queryKey: KEY, queryFn: () => listMyArenas() });
}

export function useCreateArena() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ArenaInput) => createArena(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateArena() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ArenaInput> }) =>
      updateArena(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeactivateArena() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateArena(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResubmitArena() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resubmitArena(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
