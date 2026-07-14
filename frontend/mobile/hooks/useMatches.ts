import { useQuery } from '@tanstack/react-query';

import { getMatch, listMyMatches, listOpenMatches, type OpenMatchesParams } from '../services/matches';

export function useOpenMatches(params: OpenMatchesParams) {
  return useQuery({
    queryKey: ['open-matches', params],
    queryFn: () => listOpenMatches(params),
  });
}

export function useMyMatches() {
  return useQuery({
    queryKey: ['my-matches'],
    queryFn: () => listMyMatches(),
  });
}

export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: () => getMatch(matchId as string),
    enabled: !!matchId,
  });
}
