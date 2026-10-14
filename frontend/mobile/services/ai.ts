/** AI/NLP search + recommendation API calls (docs/12_AI_RECOMMENDATION_MODULE.md). */
import { api } from '../lib/api';
import type { Arena, ArenaCity } from '../types';

/** One understood part of the words, shown as a chip the player can remove. */
export type ChipKind = 'sport' | 'place' | 'time' | 'price' | 'sort' | 'near';
export interface UnderstoodChip {
  kind: ChipKind;
  label: string;
}

export interface ParsedQuery {
  text: string;
  sport: string | null;
  city: string | null;
  area: string | null;
  price_max: number | null;
  sort: string;
  time_reference: string | null;
  near: boolean;
  chips: UnderstoodChip[];
  used_fallback_text_search: boolean;
}

/** A result card, with the free slots in the asked time ("3 slots tonight") when a time was understood. */
export type SmartArena = Arena & { free_slots: number | null; free_slots_text: string | null };

export interface NlpSearchResult {
  parsed: ParsedQuery;
  items: SmartArena[];
  total: number;
}

/** Smart search: the server reads the words, applies them (with free slots at the asked time) and says what it
 * understood. `drop` leaves out the chips the player removed; the position is only for "near me". */
export function nlpSearch(
  q: string,
  opts: { drop?: ChipKind[]; coords?: { lat: number; lon: number } | null; pageSize?: number } = {},
): Promise<NlpSearchResult> {
  const parts = [`q=${encodeURIComponent(q)}`, `page_size=${opts.pageSize ?? 30}`];
  for (const d of opts.drop ?? []) parts.push(`drop=${d}`);
  if (opts.coords) parts.push(`lat=${opts.coords.lat}`, `lon=${opts.coords.lon}`);
  return api.get<NlpSearchResult>(`/search/nlp?${parts.join('&')}`);
}

export function getRecommendations(opts: {
  city?: ArenaCity;
  sport?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<{ items: Arena[] }> {
  const parts: string[] = [];
  if (opts.city) parts.push(`city=${encodeURIComponent(opts.city)}`);
  if (opts.sport) parts.push(`sport=${encodeURIComponent(opts.sport)}`);
  parts.push(`limit=${opts.limit ?? 10}`);
  return api.get<{ items: Arena[] }>(`/recommendations?${parts.join('&')}`, { timeoutMs: opts.timeoutMs });
}
