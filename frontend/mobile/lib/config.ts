/**
 * App configuration sourced from Expo public env vars.
 *
 * EXPO_PUBLIC_API_URL points at the FastAPI backend. On a simulator/web the
 * default localhost works; on a physical device set it to your machine's LAN
 * IP (e.g. http://192.168.1.5:8000) in frontend/mobile/.env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Versioned API base — mirrors the backend's /api/v1 prefix. */
export const API_BASE = `${API_URL}/api/v1`;
