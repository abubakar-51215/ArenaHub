import { useQuery } from '@tanstack/react-query';

import { getAvailability, getSlotsToday } from '@/services/courts';

/** Per court of an arena: slots still open today and the lowest price among them. */
export function useSlotsToday(arenaId: string | undefined) {
  return useQuery({
    queryKey: ['slots-today', arenaId],
    queryFn: () => getSlotsToday(arenaId as string),
    enabled: !!arenaId,
    staleTime: 30_000,
  });
}

/** Open slot count per date for a court (the 7-day strip's dots). */
export function useAvailability(courtId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['court-availability', courtId, from, to],
    queryFn: () => getAvailability(courtId as string, from, to),
    enabled: !!courtId,
    staleTime: 30_000,
  });
}
