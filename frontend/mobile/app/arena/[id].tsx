import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArenaCard } from '@/components/arena-card';
import { StaticMap } from '@/components/static-map';
import { Colors } from '@/constants/theme';
import { useArena, useArenaCourts, useArenaRating } from '@/hooks/useArenas';
import { getRecommendations } from '@/services/ai';
import { listPricingRules } from '@/services/courts';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Sat 18:00–23:00 ×1.5" / "Daily 18:00–23:00 ×1.5" peak-window lines. */
function PeakPricingLines({ courtId }: { courtId: string }) {
  const rules = useQuery({
    queryKey: ['pricing-rules', courtId],
    queryFn: () => listPricingRules(courtId),
  });
  if (!rules.data?.length) return null;
  return (
    <View style={styles.peakLines}>
      {rules.data.map((r) => (
        <View key={r.id} style={styles.peakLine}>
          <Ionicons name="flash" size={11} color={Colors.light.warning} />
          <Text style={styles.peakLineText}>
            Peak: {r.weekday ? WEEKDAYS[r.weekday - 1] : 'Daily'} {r.start_time.slice(0, 5)}–
            {r.end_time.slice(0, 5)} ×{Number(r.price_multiplier)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function openDirections(lat: number, lng: number, name: string) {
  const label = encodeURIComponent(name);
  const url = Platform.select({
    ios: `http://maps.apple.com/?ll=${lat},${lng}&q=${label}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    default: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
  });
  Linking.openURL(url).catch(() => {
    // Fall back to the OSM website if no maps app handles the URI.
    Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`);
  });
}

export default function ArenaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const arena = useArena(id);
  const courts = useArenaCourts(id);
  const rating = useArenaRating(id);
  const similar = useQuery({
    queryKey: ['similar-arenas', id, arena.data?.city, arena.data?.sports_offered],
    queryFn: () => getRecommendations({ city: arena.data?.city, limit: 8 }),
    enabled: !!arena.data,
  });

  if (arena.isLoading || !arena.data) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  const a = arena.data;

  return (
    <View style={styles.container}>
      <ScrollView>
        <View>
          {a.images.length ? (
            <FlatList
              data={a.images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, i) => `${uri}-${i}`}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={styles.heroImage} contentFit="cover" />
              )}
            />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: Colors.light.card }]} />
          )}
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.name}>{a.name}</Text>
          <Pressable
            style={styles.metaRow}
            onPress={() => router.push({ pathname: '/arena/[id]/reviews', params: { id: a.id } })}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={styles.meta}>
              {rating.data?.average_rating?.toFixed(1) ?? '—'} ({rating.data?.review_count ?? 0} reviews)
            </Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.light.muted} />
          </Pressable>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={Colors.light.muted} />
            <Text style={styles.meta}>
              {a.area ? `${a.area}, ` : ''}
              {a.city}
            </Text>
          </View>

          <View style={styles.sportsRow}>
            {a.sports_offered.map((s) => (
              <View key={s} style={styles.sportPill}>
                <Text style={styles.sportPillText}>{s}</Text>
              </View>
            ))}
          </View>

          {a.amenities.length ? (
            <>
              <Text style={styles.sectionTitle}>Amenities</Text>
              <View style={styles.amenitiesRow}>
                {a.amenities.map((am) => (
                  <View key={am.id} style={styles.amenityPill}>
                    <Text style={styles.amenityText}>{am.name}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {a.description ? (
            <>
              <Text style={styles.sectionTitle}>About Arena</Text>
              <Text style={styles.description}>{a.description}</Text>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.address}>{a.address}</Text>
          <StaticMap latitude={Number(a.latitude)} longitude={Number(a.longitude)} />
          <Pressable
            style={styles.directionsButton}
            onPress={() => openDirections(Number(a.latitude), Number(a.longitude), a.name)}>
            <Ionicons name="navigate-outline" size={16} color={Colors.light.tint} />
            <Text style={styles.directionsText}>Get Directions</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Courts</Text>
          {courts.isLoading ? (
            <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 8 }} />
          ) : (
            (courts.data ?? []).map((court) => (
              <Pressable
                key={court.id}
                style={styles.courtRow}
                disabled={!court.is_available}
                onPress={() =>
                  router.push({
                    pathname: '/court/[id]/slots',
                    params: { id: court.id, arenaId: a.id },
                  })
                }>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courtName}>{court.name}</Text>
                  <Text style={styles.courtSports}>{court.sport_types.join(' · ')}</Text>
                  <PeakPricingLines courtId={court.id} />
                </View>
                <Text style={styles.courtPrice}>Rs. {court.base_price} / hr</Text>
                {!court.is_available ? (
                  <Text style={styles.unavailable}>Unavailable</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.light.muted} />
                )}
              </Pressable>
            ))
          )}

          {similar.data?.items.filter((s) => s.id !== a.id).length ? (
            <>
              <Text style={styles.sectionTitle}>You Might Also Like</Text>
              <FlatList
                data={similar.data.items.filter((s) => s.id !== a.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.similarRow}
                renderItem={({ item }) => <ArenaCard arena={item} width={160} />}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroImage: { width: 400, height: 220 },
  backButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20, gap: 4 },
  name: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontSize: 13, color: Colors.light.muted },
  sportsRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  sportPill: { backgroundColor: Colors.light.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  sportPillText: { fontSize: 12, color: Colors.light.tint, fontWeight: '600', textTransform: 'capitalize' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 20, marginBottom: 8 },
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenityPill: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  amenityText: { fontSize: 12, color: Colors.light.text },
  description: { fontSize: 14, color: Colors.light.muted, lineHeight: 20 },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  courtName: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  courtSports: { fontSize: 12, color: Colors.light.muted, textTransform: 'capitalize' },
  courtPrice: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  unavailable: { fontSize: 11, color: Colors.light.destructive },
  similarRow: { gap: 12, paddingBottom: 8 },
  address: { fontSize: 13, color: Colors.light.muted, marginBottom: 10 },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
  },
  directionsText: { fontSize: 13, fontWeight: '600', color: Colors.light.tint },
  peakLines: { marginTop: 3, gap: 1 },
  peakLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  peakLineText: { fontSize: 11, color: Colors.light.warning, fontWeight: '600' },
});
