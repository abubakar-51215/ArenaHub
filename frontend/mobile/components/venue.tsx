import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { CourtArt } from '@/components/ui/court-art';
import { ArenaImage } from '@/components/ui/arena-image';
import { Text } from '@/components/ui/text';
import { Colors, Font } from '@/constants/theme';
import { sportLabel } from '@/constants/sports';
import { useLikedIds, useToggleLike } from '@/hooks/useLiked';
import { tapHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import type { Arena } from '@/types';
import { TapBox } from '@/components/ui/tap-box';

// The cards and rows of arena-hub-player-app-home-search.html (vCard / vRow).
// Rating, review count and price show only when the server sent them: an arena
// with no reviews shows "New" and one with no price shows none. No distance,
// no promo.

/** The arena's first listed sport (what its picture and tag show). */
const firstSport = (a: Arena) => a.sports_offered[0];

function RatingBit({ arena }: { arena: Arena }) {
  const rated = arena.avg_rating != null && (arena.review_count ?? 0) > 0;
  if (!rated)
    return (
      <View style={styles.newTag}>
        <Text style={styles.newTagText}>New</Text>
      </View>
    );
  return (
    <View style={styles.ratingRow}>
      <Icon name="star" size={11} color={Colors.light.amber} />
      <Text style={styles.ratingNum}>{arena.avg_rating}</Text>
      <Text style={styles.meta}>({arena.review_count})</Text>
    </View>
  );
}

/** "0.8 km" (one decimal under 10 km, whole km above). */
export const formatKm = (km: number): string => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);

function Where({ arena }: { arena: Arena }) {
  return (
    // two lines at most, so a narrow card wraps the area instead of cutting it short
    <Text style={[styles.meta, styles.flex]} numberOfLines={2}>
      {arena.area ?? arena.city}
      {arena.distance_km != null ? ` · ${formatKm(arena.distance_km)}` : ''}
    </Text>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

/** The heart on a picture: fills with a small pop and a light haptic; no toast unless it fails. */
export function HeartButton({ arenaId, hero }: { arenaId: string; hero?: boolean }) {
  const liked = useLikedIds().data?.has(arenaId) ?? false;
  const toggle = useToggleLike();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (liked && !reduceMotion) scale.value = withSequence(withTiming(1.3, { duration: 110 }), withTiming(1, { duration: 140 }));
  }, [liked, reduceMotion, scale]);

  return (
    <TapBox
      slop={hero ? 4 : 10}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Remove from liked arenas' : 'Add to liked arenas'}
      accessibilityState={{ selected: liked }}
      onPress={() => {
        tapHaptic();
        toggle.mutate({ arenaId, liked });
      }}
      style={hero ? styles.heroPlace : styles.pinPlace}
      inner={hero ? styles.heroPin : styles.pin}>
      <Animated.View style={pop}>
        <Icon name="heart" size={hero ? 16 : 13} color={liked ? Colors.light.lime : '#FFFFFF'} fill={liked ? Colors.light.lime : undefined} />
      </Animated.View>
    </TapBox>
  );
}

function Vis({ arena, height, width }: { arena: Arena; height: number; width?: number }) {
  return (
    <ArenaImage photo={arena.images[0]} sport={firstSport(arena)} style={{ height, width: width ?? '100%' }} />
  );
}

/** A card for the horizontal row and the 2-column grid. The heart sits over the picture as a sibling of the pressable (a button never sits inside a button). */
export function VenueCard({ arena, width }: { arena: Arena; width?: number }) {
  const sport = firstSport(arena);
  return (
    <View style={[styles.card, width ? { width } : styles.flex]}>
      <PressableScale onPress={() => router.push(`/arena/${arena.id}`)} accessibilityRole="button" accessibilityLabel={arena.name}>
        <Vis arena={arena} height={82} />
        <View style={styles.cb}>
          <Text style={styles.name} numberOfLines={1}>
            {arena.name}
          </Text>
          <View style={[styles.line, { marginTop: 3, marginBottom: 6 }]}>
            <RatingBit arena={arena} />
            <Text style={styles.meta}>·</Text>
            <Where arena={arena} />
          </View>
          <View style={[styles.line, styles.between]}>
            {sport ? <Tag label={sportLabel(sport)} /> : <View />}
            {arena.min_price != null ? (
              <Text style={styles.price}>
                {formatRs(arena.min_price)}
                <Text style={styles.unit}>/hr</Text>
              </Text>
            ) : null}
          </View>
        </View>
      </PressableScale>
      <HeartButton arenaId={arena.id} />
    </View>
  );
}

/** A list row (Recommended for you, search results). */
export function VenueRow({ arena }: { arena: Arena }) {
  const sport = firstSport(arena);
  return (
    <PressableScale
      style={styles.rowBox}
      contentStyle={styles.rowCard}
      onPress={() => router.push(`/arena/${arena.id}`)}
      accessibilityRole="button"
      accessibilityLabel={arena.name}>
      <View style={styles.rowPic}>
        {arena.images[0] ? <ArenaImage photo={arena.images[0]} style={StyleSheet.absoluteFill} /> : <CourtArt sport={sport} />}
      </View>
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {arena.name}
        </Text>
        <View style={[styles.line, { marginTop: 3 }]}>
          <RatingBit arena={arena} />
          <Text style={styles.meta}>·</Text>
          <Where arena={arena} />
        </View>
        {sport ? (
          <View style={[styles.line, { marginTop: 4 }]}>
            <Tag label={sportLabel(sport)} />
          </View>
        ) : null}
      </View>
      {arena.min_price != null ? (
        <View style={styles.rowPrice}>
          <Text style={styles.price}>{formatRs(arena.min_price)}</Text>
          <Text style={styles.unit}>per hour</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
    borderRadius: 15,
    overflow: 'hidden',
  },
  cb: { paddingVertical: 10, paddingHorizontal: 12 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { justifyContent: 'space-between' },
  meta: { fontSize: 14, color: Colors.light.muted },
  // "/hr" and "per hour": part of the price, 14px
  unit: { fontSize: 14, fontWeight: '500', color: Colors.light.muted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingNum: { fontSize: 14, color: Colors.light.text },
  // .tag: a sport tag, 14px (it carries information)
  tag: { backgroundColor: Colors.light.lineSoft, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  newTag: { backgroundColor: Colors.light.limeWash, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  newTagText: { fontSize: 14, fontWeight: '600', color: Colors.light.limeText },
  price: { fontFamily: Font.display, fontSize: 15, color: Colors.light.text },
  pinPlace: { position: 'absolute', top: 8, right: 8 },
  heroPlace: { position: 'absolute', top: 10, right: 14 },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // the card box, and inside it the row: picture left, name and tag in the middle, price right
  rowBox: { backgroundColor: Colors.light.card, borderColor: Colors.light.line, borderWidth: 1, borderRadius: 15 },
  // the heart over the Arena screen's photo: a 36px glass square at the top right
  heroPin: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9 },
  rowPic: { width: 60, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: Colors.light.ink },
  rowPrice: { alignItems: 'flex-end' },
});
