import { create } from 'zustand';

import type { ArenaCity } from '@/types';

/**
 * What the Search, Results and Filters screens share (memory only): the typed
 * text, the filters, and the sort. A "See all" link from Home sets a title and
 * a sort and clears the rest.
 */
export type SortChoice = 'best' | 'price_asc' | 'rating_desc' | 'newest';

export const PRICE_MIN = 200;
export const PRICE_MAX = 5000; // "5,000+": no upper limit

interface SearchFiltersState {
  q: string;
  city?: ArenaCity;
  sport?: string;
  priceMin: number;
  priceMax: number;
  sort: SortChoice;
  /** True once the person picked a sort: smart search then stops choosing one ("cheap" means price). */
  sortTouched: boolean;
  /** Shown instead of "Results" (Home's See all: "Trending now", "Popular arenas"). */
  title?: string;
  setQ: (q: string) => void;
  setCity: (city?: ArenaCity) => void;
  setSport: (sport?: string) => void;
  setPrice: (min: number, max: number) => void;
  setSort: (sort: SortChoice) => void;
  /** Open Results fresh: everything cleared, then these set. */
  open: (preset: { q?: string; sport?: string; sort?: SortChoice; title?: string }) => void;
  /** Clear filters: the filters AND the search text. */
  clearAll: () => void;
}

const BLANK = { q: '', city: undefined, sport: undefined, priceMin: PRICE_MIN, priceMax: PRICE_MAX, sort: 'best' as SortChoice, sortTouched: false, title: undefined };

export const useSearchFilters = create<SearchFiltersState>()((set) => ({
  ...BLANK,
  setQ: (q) => set({ q }),
  setCity: (city) => set({ city }),
  setSport: (sport) => set({ sport }),
  setPrice: (priceMin, priceMax) => set({ priceMin, priceMax }),
  setSort: (sort) => set({ sort, sortTouched: true }),
  open: (preset) => set({ ...BLANK, ...preset, sortTouched: preset.sort !== undefined }),
  clearAll: () => set({ ...BLANK }),
}));

/** The number on the Filters button: city, sport and a changed price range. */
export function activeFilterCount(s: Pick<SearchFiltersState, 'city' | 'sport' | 'priceMin' | 'priceMax'>): number {
  return (s.city ? 1 : 0) + (s.sport ? 1 : 0) + (s.priceMin > PRICE_MIN || s.priceMax < PRICE_MAX ? 1 : 0);
}
