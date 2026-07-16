/**
 * Detected-city store (Zustand, in-memory only — location is re-detected per
 * app launch, never persisted).
 *
 * ArenaHub's supported cities are a fixed enum (Lahore/Islamabad/Karachi/
 * Multan — docs/PROJECT_GUIDELINES.md multi-city decision), so "detect my
 * location" means: get GPS coordinates, snap to the nearest supported city
 * center by Haversine distance, and only accept it if it's within a sane
 * radius (a user in Peshawar shouldn't be silently assigned Islamabad's
 * arenas as "nearby").
 */
import * as Location from "expo-location";
import { create } from "zustand";

import { type ArenaCity } from "@/types";

const CITY_CENTERS: Record<ArenaCity, { lat: number; lon: number }> = {
  Lahore: { lat: 31.5204, lon: 74.3587 },
  Islamabad: { lat: 33.6844, lon: 73.0479 },
  Karachi: { lat: 24.8607, lon: 67.0011 },
  Multan: { lat: 30.1575, lon: 71.5249 },
};

/** A detection farther than this from every supported city is rejected. */
const MAX_CITY_RADIUS_KM = 60;

/** A cached last-known fix older than this is treated as stale — the device
 * may not have moved GPS in a while, so a fresh fix is requested instead. */
const MAX_CACHED_LOCATION_AGE_MS = 5 * 60 * 1000;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestSupportedCity(
  lat: number,
  lon: number,
): ArenaCity | null {
  let best: ArenaCity | null = null;
  let bestDistance = Infinity;
  for (const [city, center] of Object.entries(CITY_CENTERS) as [
    ArenaCity,
    { lat: number; lon: number },
  ][]) {
    const distance = haversineKm(lat, lon, center.lat, center.lon);
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return bestDistance <= MAX_CITY_RADIUS_KM ? best : null;
}

export type LocationStatus =
  "idle" | "detecting" | "detected" | "denied" | "outside";

interface LocationState {
  city: ArenaCity | null;
  status: LocationStatus;
  detect: () => Promise<void>;
}

export const useLocationStore = create<LocationState>()((set, get) => ({
  city: null,
  status: "idle",
  detect: async () => {
    if (get().status === "detecting") return;
    set({ status: "detecting" });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        set({ status: "denied", city: null });
        return;
      }
      const cached = await Location.getLastKnownPositionAsync();
      const cachedIsFresh =
        cached != null && Date.now() - cached.timestamp <= MAX_CACHED_LOCATION_AGE_MS;
      const position =
        cachedIsFresh && cached
          ? cached
          : await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
      const city = nearestSupportedCity(
        position.coords.latitude,
        position.coords.longitude,
      );
      set(
        city ? { status: "detected", city } : { status: "outside", city: null },
      );
    } catch {
      set({ status: "idle", city: null });
    }
  },
}));
