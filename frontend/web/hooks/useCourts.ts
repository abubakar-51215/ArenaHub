/** TanStack Query hooks for owner court management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CourtInput,
  createCourt,
  deleteCourt,
  listCourts,
  setCourtAvailability,
  updateCourt,
} from "@/services/courts";

const key = (arenaId: string) => ["courts", arenaId] as const;

export function useCourts(arenaId: string | null) {
  return useQuery({
    queryKey: ["courts", arenaId ?? "none"],
    queryFn: () => listCourts(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useCreateCourt(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CourtInput) => createCourt(arenaId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useUpdateCourt(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courtId, input }: { courtId: string; input: Partial<CourtInput> }) =>
      updateCourt(courtId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useSetCourtAvailability(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courtId, isAvailable }: { courtId: string; isAvailable: boolean }) =>
      setCourtAvailability(courtId, isAvailable),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}

export function useDeleteCourt(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courtId: string) => deleteCourt(courtId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(arenaId) }),
  });
}
