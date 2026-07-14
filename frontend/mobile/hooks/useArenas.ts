import { useQuery } from '@tanstack/react-query';

import { getArena, getRatingSummary, searchArenas, type ArenaSearchParams } from '../services/arenas';
import { listCourts } from '../services/courts';

export function useArenaSearch(params: ArenaSearchParams) {
  return useQuery({
    queryKey: ['arenas', params],
    queryFn: () => searchArenas(params),
  });
}

export function useArena(arenaId: string | undefined) {
  return useQuery({
    queryKey: ['arena', arenaId],
    queryFn: () => getArena(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useArenaCourts(arenaId: string | undefined) {
  return useQuery({
    queryKey: ['arena-courts', arenaId],
    queryFn: () => listCourts(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useArenaRating(arenaId: string | undefined) {
  return useQuery({
    queryKey: ['arena-rating', arenaId],
    queryFn: () => getRatingSummary(arenaId as string),
    enabled: !!arenaId,
  });
}
