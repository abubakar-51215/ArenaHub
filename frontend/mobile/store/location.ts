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

import { LOCATION_TIMEOUT_MS } from "@/constants/brand";
import { startupLog } from "@/lib/startup-log";
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
  "idle" | "detecting" | "detected" | "denied" | "outside" | "unavailable";

/** Where the player is (memory only: never saved on the phone, never sent anywhere except as search parameters). */
export interface Coords {
  lat: number;
  lon: number;
}

interface LocationState {
  city: ArenaCity | null;
  status: LocationStatus;
  coords: Coords | null;
  /** True once the system says location is allowed; false when refused; null when not asked yet. */
  granted: boolean | null;
  /** Ask the system (no dialog) whether location is already allowed. */
  refreshPermission: () => Promise<boolean>;
  /** Find the player. Asks for permission if it is not given yet. Never takes longer than LOCATION_TIMEOUT_MS. */
  detect: () => Promise<void>;
}

export const useLocationStore = create<LocationState>()((set, get) => ({
  city: null,
  status: "idle",
  coords: null,
  granted: null,
  refreshPermission: async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === "granted";
      set({ granted: granted ? true : status === "denied" ? false : null });
      return granted;
    } catch {
      return false;
    }
  },
  detect: async () => {
    if (get().status === "detecting") return;
    set({ status: "detecting" });
    // Nothing waits for this: after LOCATION_TIMEOUT_MS the lookup is given up on and the screens show the saved city
    // (or "All cities"). A refused or dismissed permission is a normal answer, not an error.
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      startupLog(`location: no answer after ${LOCATION_TIMEOUT_MS / 1000} s, using the saved city`);
      set({ status: "unavailable", city: null });
    }, LOCATION_TIMEOUT_MS);
    const done = (next: Partial<LocationState> & { status: LocationStatus }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      set(next);
    };
    try {
      startupLog("location: asking for permission");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        startupLog("location: permission not given, using the saved city");
        done({ status: "denied", city: null, coords: null, granted: false });
        return;
      }
      set({ granted: true });
      startupLog("location: reading the position");
      const cached = await Location.getLastKnownPositionAsync();
      const cachedIsFresh =
        cached != null && Date.now() - cached.timestamp <= MAX_CACHED_LOCATION_AGE_MS;
      const position =
        cachedIsFresh && cached
          ? cached
          : await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const city = nearestSupportedCity(lat, lon);
      startupLog(`location: ${city ?? "outside the supported cities"}`);
      done({ status: city ? "detected" : "outside", city, coords: { lat, lon }, granted: true });
    } catch {
      startupLog("location: could not be read, using the saved city");
      done({ status: "unavailable", city: null });
    }
  },
}));
