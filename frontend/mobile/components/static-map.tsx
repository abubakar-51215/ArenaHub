/**
 * Static OpenStreetMap view — a mosaic of OSM raster tiles centered on a
 * coordinate with a pin, rendered with plain <Image>s (no native map module,
 * so it works in Expo Go; see PROJECT_GUIDELINES deviation #8). Tapping the
 * map opens the location on openstreetmap.org.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

const TILE_SIZE = 256;

/** Slippy-map fractional tile coordinates for a lat/lng at a zoom level. */
function tileCoords(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n,
  };
}

export function StaticMap({
  latitude,
  longitude,
  height = 160,
  zoom = 15,
}: {
  latitude: number;
  longitude: number;
  height?: number;
  zoom?: number;
}) {
  const [width, setWidth] = useState(0);

  const center = tileCoords(latitude, longitude, zoom);
  const centerPx = center.x * TILE_SIZE;
  const centerPy = center.y * TILE_SIZE;

  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = [];
  if (width > 0) {
    const maxTile = 2 ** zoom - 1;
    const firstX = Math.floor((centerPx - width / 2) / TILE_SIZE);
    const lastX = Math.floor((centerPx + width / 2) / TILE_SIZE);
    const firstY = Math.max(0, Math.floor((centerPy - height / 2) / TILE_SIZE));
    const lastY = Math.min(maxTile, Math.floor((centerPy + height / 2) / TILE_SIZE));
    for (let tx = firstX; tx <= lastX; tx++) {
      for (let ty = firstY; ty <= lastY; ty++) {
        // Wrap x across the antimeridian so the URL is always valid.
        const wrappedX = ((tx % (maxTile + 1)) + maxTile + 1) % (maxTile + 1);
        tiles.push({
          key: `${tx}-${ty}`,
          x: wrappedX,
          y: ty,
          left: tx * TILE_SIZE - centerPx + width / 2,
          top: ty * TILE_SIZE - centerPy + height / 2,
        });
      }
    }
  }

  return (
    <Pressable
      style={[styles.container, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={() =>
        Linking.openURL(
          `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`,
        )
      }>
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: `https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png` }}
          style={[styles.tile, { left: t.left, top: t.top }]}
        />
      ))}
      {width > 0 ? (
        <View style={[styles.pin, { left: width / 2 - 14, top: height / 2 - 26 }]}>
          <Ionicons name="location" size={28} color={Colors.light.destructive} />
        </View>
      ) : null}
      <Text style={styles.attribution}>© OpenStreetMap</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.light.card,
  },
  tile: { position: 'absolute', width: TILE_SIZE, height: TILE_SIZE },
  pin: { position: 'absolute' },
  attribution: {
    position: 'absolute',
    bottom: 2,
    right: 6,
    fontSize: 9,
    color: Colors.light.muted,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 3,
    borderRadius: 3,
  },
});
