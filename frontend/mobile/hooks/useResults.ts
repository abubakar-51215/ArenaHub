import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { sportLabel } from '@/constants/sports';
import { useArenaSearch } from '@/hooks/useArenas';
import { nlpSearch, type ParsedQuery } from '@/services/ai';
import { useLocationStore } from '@/store/location';
import { PRICE_MAX, PRICE_MIN, useSearchFilters, type SortChoice } from '@/store/search-filters';
import type { ArenaCity } from '@/types';

/** The text after the person stops typing for a moment (so each keystroke is not a request). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const SORT_FROM_WORDS: Record<string, SortChoice> = { price_asc: 'price_asc', rating_desc: 'rating_desc' };

/** What smart search understood, as words for the small chips under the field. */
export function understoodChips(parsed: ParsedQuery | undefined): string[] {
  if (!parsed || parsed.used_fallback_text_search) return [];
  const chips: string[] = [];
  if (parsed.sport) chips.push(sportLabel(parsed.sport));
  if (parsed.city) chips.push(parsed.city);
  if (parsed.sort === 'price_asc') chips.push('Cheapest first');
  else if (parsed.sort === 'price_desc') chips.push('Most expensive first');
  else if (parsed.sort === 'rating_desc') chips.push('Top rated');
  return chips;
}

/**
 * The results for the current text and filters. Smart search reads the text
 * ("cheap futsal in Lahore" means futsal, Lahore, cheapest first); what the
 * person set in Filters wins over what it guessed, and a sort they picked wins
 * over a guessed one. The arenas themselves always come from the arena search,
 * so every card has the same fields.
 */
export function useResults(opts: { pageSize?: number } = {}) {
  const f = useSearchFilters();
  const coords = useLocationStore((s) => s.coords);
  const q = useDebounced(f.q.trim());
  const parse = useQuery({
    queryKey: ['nlp-parse', q],
    queryFn: () => nlpSearch(q),
    enabled: q.length > 0,
    staleTime: 60_000,
  });
  const parsed = parse.data?.parsed;

  let sort: SortChoice = f.sort;
  // "Near me" and a distance need the player's position; without it they quietly do nothing (the screens say why)
  if (sort === 'near' && !coords) sort = 'best';
  if (!f.sortTouched && parsed && !parsed.used_fallback_text_search && SORT_FROM_WORDS[parsed.sort]) {
    sort = SORT_FROM_WORDS[parsed.sort];
  }

  const waitingForParse = q.length > 0 && parse.isLoading;
  const params = {
    q: q && (!parsed || parsed.used_fallback_text_search) ? q : undefined,
    city: (f.city ?? (parsed?.city as ArenaCity | null | undefined)) || undefined,
    sport: f.sport ?? (parsed && !parsed.used_fallback_text_search ? parsed.sport ?? undefined : undefined),
    price_min: f.priceMin > PRICE_MIN ? f.priceMin : undefined,
    price_max: f.priceMax < PRICE_MAX ? f.priceMax : undefined,
    sort: sort === 'newest' ? ('newest' as const) : sort,
    page_size: opts.pageSize ?? 30,
    // the position goes with the search only to work out distances; the server does not keep it
    ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
    ...(coords && f.radiusKm ? { radius_km: f.radiusKm } : {}),
  };
  const search = useArenaSearch(params);
  return {
    query: search,
    parsed,
    sort,
    chips: understoodChips(parsed),
    isLoading: waitingForParse || search.isLoading,
    isError: search.isError,
    items: search.data?.items ?? [],
    total: search.data?.total ?? 0,
  };
}
