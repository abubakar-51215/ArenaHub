/**
 * App configuration sourced from public env vars (see .env.example).
 *
 * NEXT_PUBLIC_API_URL points at the FastAPI backend.
 * NEXT_PUBLIC_MAP_TILE_URL is the OSM tile provider (used from Sprint 4).
 */
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_URL = rawApiUrl ?? "";

/** Versioned API base — mirrors the backend's /api/v1 prefix. */
export const API_BASE = API_URL ? `${API_URL}/api/v1` : "/api/v1";

export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
