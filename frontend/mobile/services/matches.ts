/** Player-facing matchmaking ("Play") API calls. */
import { api } from '../lib/api';
import type { ArenaCity, Match, MatchDetail, Page } from '../types';

export interface MatchCreateInput {
  arena_id: string;
  court_id: string;
  sport: string;
  match_date: string;
  start_time: string;
  end_time: string;
  max_players: number;
}

export interface OpenMatchesParams {
  city?: ArenaCity;
  sport?: string;
  date?: string;
  page?: number;
  page_size?: number;
}

export interface MyMatches {
  created: Match[];
  joined: Match[];
}

function toQuery(params: object): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export function createMatch(data: MatchCreateInput): Promise<MatchDetail> {
  return api.post<MatchDetail>('/matches', data);
}

export function listOpenMatches(params: OpenMatchesParams = {}): Promise<Page<Match>> {
  return api.get<Page<Match>>(`/matches${toQuery(params)}`);
}

export function listMyMatches(): Promise<MyMatches> {
  return api.get<MyMatches>('/matches/mine');
}

export function getMatch(matchId: string): Promise<MatchDetail> {
  return api.get<MatchDetail>(`/matches/${matchId}`);
}

export function joinMatch(matchId: string): Promise<MatchDetail> {
  return api.post<MatchDetail>(`/matches/${matchId}/join`);
}

export function leaveMatch(matchId: string): Promise<void> {
  return api.post<void>(`/matches/${matchId}/leave`);
}

export function cancelMatch(matchId: string): Promise<void> {
  return api.del<void>(`/matches/${matchId}`);
}
