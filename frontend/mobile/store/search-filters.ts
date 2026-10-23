import { create } from 'zustand';

import type { TimeOfDay } from '@/constants/filters';
import type { ArenaCity } from '@/types';

/**
 * What the Search, Results and Filters screens share (memory only): the typed
 * text, the filters, and the sort. A "See all" link from Home sets a title and
 * a sort and clears the rest.
 */
export type SortChoice = 'best' | 'price_asc' | 'rating_desc' | 'newest' | 'near';

/** The "How far" chips of Filters, in km (null = Any). */
export const RADIUS_CHOICES = [2, 5, 10, 25] as const;

export const PRICE_MIN = 200;
export const PRICE_MAX = 5000; // "5,000+": no upper limit

interface SearchFiltersState {
  q: string;
  city?: ArenaCity;
  sport?: string;
  priceMin: number;
  priceMax: number;
  /** Only arenas within this many km (needs the player's location); null = any distance. */
  radiusKm: number | null;
  /** "Must have": only arenas that have ALL of these amenities. */
  amenityIds: string[];
  /** Only arenas with a free slot in this part of the day (today's date: the sheet has no date). */
  timeOfDay?: TimeOfDay;
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
  setRadius: (km: number | null) => void;
  toggleAmenity: (id: string) => void;
  setTimeOfDay: (t?: TimeOfDay) => void;
  /** Open Results fresh: everything cleared, then these set. */
  open: (preset: { q?: string; sport?: string; sort?: SortChoice; title?: string }) => void;
  /** Clear filters: the filters AND the search text. */
  clearAll: () => void;
}

const BLANK = { q: '', city: undefined, sport: undefined, priceMin: PRICE_MIN, priceMax: PRICE_MAX, radiusKm: null as number | null, amenityIds: [] as string[], timeOfDay: undefined as TimeOfDay | undefined, sort: 'best' as SortChoice, sortTouched: false, title: undefined };

export const useSearchFilters = create<SearchFiltersState>()((set) => ({
  ...BLANK,
  setQ: (q) => set({ q }),
  setCity: (city) => set({ city }),
  setSport: (sport) => set({ sport }),
  setPrice: (priceMin, priceMax) => set({ priceMin, priceMax }),
  setSort: (sort) => set({ sort, sortTouched: true }),
  setRadius: (radiusKm) => set({ radiusKm }),
  toggleAmenity: (id) => set((s) => ({ amenityIds: s.amenityIds.includes(id) ? s.amenityIds.filter((a) => a !== id) : [...s.amenityIds, id] })),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  open: (preset) => set({ ...BLANK, ...preset, sortTouched: preset.sort !== undefined }),
  clearAll: () => set({ ...BLANK }),
}));

/** The number on the Filters button: one for each row in use (city, sport, a changed price range, a distance, a time of day, amenities). */
export function activeFilterCount(
  s: Pick<SearchFiltersState, 'city' | 'sport' | 'priceMin' | 'priceMax'> & { radiusKm?: number | null; amenityIds?: string[]; timeOfDay?: TimeOfDay },
): number {
  return (
    (s.city ? 1 : 0) +
    (s.sport ? 1 : 0) +
    (s.priceMin > PRICE_MIN || s.priceMax < PRICE_MAX ? 1 : 0) +
    (s.radiusKm ? 1 : 0) +
    (s.amenityIds?.length ? 1 : 0) +
    (s.timeOfDay ? 1 : 0)
  );
}
