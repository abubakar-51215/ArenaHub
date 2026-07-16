/**
 * App configuration sourced from Expo public env vars.
 *
 * EXPO_PUBLIC_API_URL points at the FastAPI backend. On a simulator/web the
 * default localhost works; on a physical device set it to your machine's LAN
 * IP (e.g. http://192.168.1.5:8000) in frontend/mobile/.env.
 */
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;

// __DEV__ is false in a release/production build (EAS build profile). A
// production build must never silently fall back to plain-HTTP localhost —
// that would only happen from a misconfigured build profile, but fail loudly
// rather than ship traffic in the clear.
if (!__DEV__ && (!envApiUrl || !envApiUrl.startsWith('https://'))) {
  throw new Error(
    'EXPO_PUBLIC_API_URL must be set to an https:// URL in production builds.',
  );
}

export const API_URL = envApiUrl ?? 'http://localhost:8000';

/** Versioned API base — mirrors the backend's /api/v1 prefix. */
export const API_BASE = `${API_URL}/api/v1`;
