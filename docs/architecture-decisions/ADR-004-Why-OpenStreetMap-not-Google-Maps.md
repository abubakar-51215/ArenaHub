# ADR-004: Why OpenStreetMap instead of Google Maps

**Status:** Accepted · **Date:** 2026-07-12 · **Sprint:** 1

## Context
Docs 02 and 06 name Google Maps for nearby-arena discovery and navigation.
Google Maps Platform requires a billing account with a credit card even within
the free tier, and enforces API-key restrictions and quota management. For a
two-person FYP demo, avoiding a billing account and key-leak risk is valuable.
The mapping needs are modest: show arenas on a map, show the user's location,
and compute distances for "nearby" sorting.

## Decision
Use **OpenStreetMap** tiles with **Leaflet** on web and **`react-native-maps`
with OSM tiles** on mobile. Compute distances with the **Haversine formula**
from `lat`/`lng` stored on the `arenas` table (no paid geocoding/distance API).

## Consequences
- **Positive:** No billing account, no credit card, no per-request cost; no API
  key to leak; fully defensible for an FYP; distance math is a pure function on
  stored coordinates. `NEXT_PUBLIC_MAP_TILE_URL` keeps the tile provider
  configurable.
- **Negative / trade-offs:** OSM tile servers have usage policies (need a
  proper tile provider / User-Agent for anything beyond light use); no built-in
  turn-by-turn navigation or rich places autocomplete like Google; geocoding
  (address → coordinates) needs a separate service (e.g. Nominatim) if required
  later.
- **Mitigation:** Navigation can hand off to the device's default maps app via
  a geo: URI; if richer geocoding is needed, Nominatim or a paid provider can
  be added behind the same map config without changing stored data.
