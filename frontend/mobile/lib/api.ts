/**
 * Minimal typed API client for the ArenaHub backend.
 *
 * Every /api/v1 endpoint returns the standard response envelope
 * (see backend app/shared/response.py), so the client is typed around it.
 */
import { API_BASE } from './config';

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors: FieldError[] | null;
}

export interface HealthData {
  api: string;
  database: string;
  redis: string;
}

/** GET a path under /api/v1 and return the parsed envelope. */
export async function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`);
  // The health endpoint returns 503 with a valid envelope when degraded, so we
  // parse the body regardless of status rather than throwing on !res.ok.
  return (await res.json()) as ApiEnvelope<T>;
}

/** Fetch backend health (API + PostgreSQL + Redis reachability). */
export function fetchHealth(): Promise<ApiEnvelope<HealthData>> {
  return apiGet<HealthData>('/health');
}
