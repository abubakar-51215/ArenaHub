/**
 * Typed API client for the ArenaHub backend.
 *
 * Every /api/v1 endpoint returns the standard response envelope
 * (backend app/shared/response.py), so the client is typed around it. Authed
 * requests attach the access token from the auth store and transparently
 * refresh it once on a 401 before giving up. Mirrors
 * frontend/web/services/api.ts's pattern (fetch + envelope + one-shot
 * refresh-and-retry) — mobile just reads/writes the token pair to/from a
 * SecureStore-backed Zustand store instead of localStorage.
 */
import { API_BASE } from './config';
import { useAuthStore } from '../store/auth';
import type { Tokens } from '../types';

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

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];
  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function parse<T>(res: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return { success: res.ok, message: res.statusText, data: null, errors: null };
  }
}

async function rawRequest(
  method: Method,
  path: string,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Attempt a one-shot refresh of the token pair. Returns the new access token. */
async function tryRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) return null;
  const res = await rawRequest('POST', '/auth/refresh', { refresh_token: refreshToken }, null);
  if (!res.ok) {
    clear();
    return null;
  }
  const env = await parse<Tokens>(res);
  if (!env.data) {
    clear();
    return null;
  }
  setTokens(env.data);
  return env.data.access_token;
}

/** Authed request against /api/v1. Throws {@link ApiError} on a failure envelope. */
export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  let res = await rawRequest(method, path, body, token);

  if (res.status === 401 && token) {
    const fresh = await tryRefresh();
    if (fresh) res = await rawRequest(method, path, body, fresh);
  }

  const env = await parse<T>(res);
  if (!res.ok || !env.success) {
    throw new ApiError(env.message || 'Request failed', res.status, env.errors ?? []);
  }
  return env.data as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  del: <T>(path: string) => apiRequest<T>('DELETE', path),
};

// ---- unauthenticated helpers (health page) ----

export async function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`);
  return parse<T>(res);
}

export function fetchHealth(): Promise<ApiEnvelope<HealthData>> {
  return apiGet<HealthData>('/health');
}
