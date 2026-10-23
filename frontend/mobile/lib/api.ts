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
  /** What the server sent with the error, if anything (a sign-in that needs the email confirmed first, say). */
  data: unknown;
  constructor(message: string, status: number, fieldErrors: FieldError[] = [], data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.data = data;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
let refreshPromise: Promise<string | null> | null = null;

async function parse<T>(res: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return { success: res.ok, message: res.statusText, data: null, errors: null };
  }
}

/** How long an ordinary request may take; start-up calls pass a shorter limit. */
const DEFAULT_TIMEOUT_MS = 20000;

export class RequestTimeoutError extends Error {
  constructor() {
    super('The server took too long to answer.');
    this.name = 'RequestTimeoutError';
  }
}

async function rawRequest(
  method: Method,
  path: string,
  body: unknown,
  token: string | null,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  idempotencyKey?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new RequestTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Attempt a one-shot refresh of the token pair. Returns the new access token. */
async function tryRefresh(timeoutMs?: number): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) return null;
  const res = await rawRequest('POST', '/auth/refresh', { refresh_token: refreshToken }, null, timeoutMs);
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
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/** Authed request against /api/v1. Throws {@link ApiError} on a failure envelope. */
export async function apiRequest<T>(method: Method, path: string, body?: unknown, opts?: { timeoutMs?: number; idempotencyKey?: string }): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  let res = await rawRequest(method, path, body, token, opts?.timeoutMs, opts?.idempotencyKey);

  if (res.status === 401 && token) {
    const fresh = await tryRefresh(opts?.timeoutMs);
    if (fresh) res = await rawRequest(method, path, body, fresh, opts?.timeoutMs, opts?.idempotencyKey);
  }

  const env = await parse<T>(res);
  if (!res.ok || !env.success) {
    throw new ApiError(env.message || 'Request failed', res.status, env.errors ?? [], env.data ?? null);
  }
  return env.data as T;
}

export const api = {
  get: <T>(path: string, opts?: { timeoutMs?: number }) => apiRequest<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number; idempotencyKey?: string }) => apiRequest<T>('POST', path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number }) => apiRequest<T>('PATCH', path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number }) => apiRequest<T>('PUT', path, body, opts),
  del: <T>(path: string, opts?: { timeoutMs?: number }) => apiRequest<T>('DELETE', path, undefined, opts),
};

// ---- unauthenticated helpers (health page) ----

export async function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`);
  return parse<T>(res);
}

export function fetchHealth(): Promise<ApiEnvelope<HealthData>> {
  return apiGet<HealthData>('/health');
}
