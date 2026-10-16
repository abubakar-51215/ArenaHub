import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useArenaSearch } from '@/hooks/useArenas';
import { nlpSearch, type ChipKind, type SmartArena, type UnderstoodChip } from '@/services/ai';
import { useLocationStore } from '@/store/location';
import { PRICE_MAX, PRICE_MIN, useSearchFilters, type SortChoice } from '@/store/search-filters';

/** The text after the person stops typing for a moment (so each keystroke is not a request). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * The results for the current text and filters.
 *
 * Words the server understood (smart search, arena-hub-player-app-smart.html frames 1 to 3): the server applies
 * them itself — sport, city or area, price per hour, order, near me and the free slots at the asked time — and the
 * screen shows its chips; a removed chip is sent back in `drop`. Words it did not understand (frame 4), or no words
 * at all: the arena search with the person's Filters, the words matched against arena names.
 */
export function useResults(opts: { pageSize?: number; drop?: ChipKind[] } = {}) {
  const f = useSearchFilters();
  const coords = useLocationStore((s) => s.coords);
  const q = useDebounced(f.q.trim());
  const drop = opts.drop ?? [];
  const smart = useQuery({
    queryKey: ['nlp', q, drop, coords?.lat, coords?.lon],
    queryFn: () => nlpSearch(q, { drop, coords, pageSize: opts.pageSize ?? 30 }),
    enabled: q.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const parsed = smart.data?.parsed;
  const understood = !!parsed && !parsed.used_fallback_text_search;

  let sort: SortChoice = f.sort;
  // "Near me" and a distance need the player's position; without it they quietly do nothing (the screens say why)
  if (sort === 'near' && !coords) sort = 'best';

  const params = {
    q: q || undefined,
    city: f.city ?? undefined,
    sport: f.sport ?? undefined,
    price_min: f.priceMin > PRICE_MIN ? f.priceMin : undefined,
    price_max: f.priceMax < PRICE_MAX ? f.priceMax : undefined,
    sort: sort === 'newest' ? ('newest' as const) : sort,
    page_size: opts.pageSize ?? 30,
    // the position goes with the search only to work out distances; the server does not keep it
    ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
    ...(coords && f.radiusKm ? { radius_km: f.radiusKm } : {}),
  };
  // the plain arena search is needed only without words, or when the words were not understood
  const search = useArenaSearch(params, { enabled: q.length === 0 || (!!parsed && !understood) });
  const waitingForWords = q.length > 0 && smart.isLoading;

  if (understood) {
    return {
      query: smart,
      parsed,
      understood,
      sort,
      chips: parsed.chips,
      isLoading: smart.isLoading,
      isError: smart.isError,
      items: smart.data?.items ?? [],
      total: smart.data?.total ?? 0,
    };
  }
  return {
    query: q.length > 0 && smart.isError ? smart : search,
    parsed,
    understood,
    sort,
    chips: [] as UnderstoodChip[],
    isLoading: waitingForWords || search.isLoading,
    isError: search.isError || (q.length > 0 && smart.isError),
    items: (search.data?.items ?? []) as SmartArena[],
    total: search.data?.total ?? 0,
  };
}
