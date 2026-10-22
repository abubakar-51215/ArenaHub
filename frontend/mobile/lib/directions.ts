import { Alert, Linking } from 'react-native';

import type { Arena } from '@/types';

/** Open the arena's location in the device's map app. Prefers the stored
 * coordinates (never invents them); falls back to the address text only when
 * no coordinates are on file. */
export async function openDirections(arena: Pick<Arena, 'latitude' | 'longitude' | 'address' | 'area' | 'city'>): Promise<void> {
  const lat = arena.latitude != null ? Number(arena.latitude) : null;
  const lon = arena.longitude != null ? Number(arena.longitude) : null;
  const query =
    lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)
      ? `${lat},${lon}`
      : [arena.address, arena.area, arena.city].filter(Boolean).join(', ');
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open maps.');
  }
}
