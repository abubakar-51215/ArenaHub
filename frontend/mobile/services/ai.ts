/** AI/NLP search + recommendation API calls (docs/12_AI_RECOMMENDATION_MODULE.md). */
import { api } from '../lib/api';
import type { Arena, ArenaCity } from '../types';

export interface ParsedQuery {
  sport: string | null;
  city: string | null;
  sort: string;
  time_reference: string | null;
  used_fallback_text_search: boolean;
}

export interface NlpSearchResult {
  parsed: ParsedQuery;
  items: Arena[];
  total: number;
}

export function nlpSearch(q: string): Promise<NlpSearchResult> {
  return api.get<NlpSearchResult>(`/search/nlp?q=${encodeURIComponent(q)}&page_size=30`);
}

export function getRecommendations(opts: {
  city?: ArenaCity;
  sport?: string;
  limit?: number;
}): Promise<{ items: Arena[] }> {
  const parts: string[] = [];
  if (opts.city) parts.push(`city=${encodeURIComponent(opts.city)}`);
  if (opts.sport) parts.push(`sport=${encodeURIComponent(opts.sport)}`);
  parts.push(`limit=${opts.limit ?? 10}`);
  return api.get<{ items: Arena[] }>(`/recommendations?${parts.join('&')}`);
}
