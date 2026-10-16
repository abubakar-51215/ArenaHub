/**
 * App configuration sourced from Expo public env vars.
 *
 * EXPO_PUBLIC_API_URL points at the FastAPI backend. On a simulator/web the
 * default localhost works; on a physical device set it to your machine's LAN
 * IP (e.g. http://192.168.1.5:8000) in frontend/mobile/.env.
 */
const envApiUrl = process.env.EXPO_PUBLIC_API_URL;

// __DEV__ is false in a release/production build (EAS build profile). A
// production build must never silently talk to plain-HTTP localhost — surface
// a misconfigured build profile loudly instead of shipping traffic in the
// clear. This warns rather than throws at module load so it can't break the
// static web export/bundling step (which also runs with __DEV__ === false but
// has no runtime env to point at); the fallback below is never a real prod
// endpoint anyway.
if (!__DEV__ && (!envApiUrl || !envApiUrl.startsWith('https://'))) {
  console.warn(
    'EXPO_PUBLIC_API_URL should be an https:// URL in production builds; ' +
      'no request will be sent until it is.',
  );
}

// Plain http:// is for development builds only. A release build that was not given an https:// address talks to
// nothing real: ".invalid" is a reserved name that never resolves, so no traffic can leave in the clear.
const PLAIN_HTTP_ALLOWED = __DEV__;
export const API_URL =
  envApiUrl && (envApiUrl.startsWith('https://') || PLAIN_HTTP_ALLOWED)
    ? envApiUrl
    : PLAIN_HTTP_ALLOWED
      ? 'http://localhost:8000'
      : 'https://api.arenahub.invalid';

/** Versioned API base — mirrors the backend's /api/v1 prefix. */
export const API_BASE = `${API_URL}/api/v1`;
