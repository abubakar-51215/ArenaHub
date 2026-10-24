import { create } from 'zustand';

// Development builds only (`__DEV__` is false in a preview or store build, so every function here does nothing
// there). The last failed call of the sign-up, sign-in and code steps, as one short line for the screen: which
// call, the HTTP status or the kind of failure, never a token, an email or a message body. It is there so a
// failure on a real phone can be named without opening the logs.
//
//   key   what the line is for: the endpoint path ('/auth/register') or 'native:google'
//   what  'HTTP 401', 'timeout', 'network error (Network request failed)' or 'native code 10'
export interface DevFailure {
  key: string;
  what: string;
}

const useDevFailure = create<{ last: DevFailure | null }>()(() => ({ last: null }));

function describe(err: unknown): string {
  const e = err as { name?: string; status?: number; code?: string | number; message?: string } | null;
  if (e?.name === 'ApiError' && typeof e.status === 'number') return `HTTP ${e.status}`;
  if (e?.name === 'RequestTimeoutError') return 'timeout (no answer from the server)';
  if (e?.name === 'TypeError') return `network error (${(e.message ?? '').slice(0, 40)})`;
  if (e?.code !== undefined) return `native code ${String(e.code)}`;
  return e?.name ? `error (${e.name})` : 'error';
}

/** Remember that the call for `key` failed with `err`. */
export function noteDevFailure(key: string, err: unknown): void {
  if (!__DEV__) return;
  useDevFailure.setState({ last: { key, what: describe(err) } });
}

/** The call for `key` worked: its old failure line goes away. */
export function clearDevFailure(key: string): void {
  if (!__DEV__) return;
  if (useDevFailure.getState().last?.key === key) useDevFailure.setState({ last: null });
}

/** The line to show for the given keys: null in a preview or store build, or when nothing failed. */
export function useDevLine(keys: string[]): string | null {
  const last = useDevFailure((s) => s.last);
  if (!__DEV__ || !last || !keys.includes(last.key)) return null;
  return `Dev: ${last.key} · ${last.what}`;
}
