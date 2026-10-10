import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

function Where({ arena }: { arena: Arena }) {
  return (
    <Text style={[styles.meta, styles.flex]} numberOfLines={1}>
      {arena.area ?? arena.city}
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
export function HeartButton({ arenaId }: { arenaId: string }) {
  const liked = useLikedIds().data?.has(arenaId) ?? false;
  const toggle = useToggleLike();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (liked && !reduceMotion) scale.value = withSequence(withTiming(1.3, { duration: 110 }), withTiming(1, { duration: 140 }));
  }, [liked, reduceMotion, scale]);

  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Remove from liked arenas' : 'Add to liked arenas'}
      accessibilityState={{ selected: liked }}
      onPress={() => {
        tapHaptic();
        toggle.mutate({ arenaId, liked });
      }}
      style={styles.pin}>
      <Animated.View style={pop}>
        <Icon name="heart" size={13} color={liked ? Colors.light.lime : '#FFFFFF'} fill={liked ? Colors.light.lime : undefined} />
      </Animated.View>
    </Pressable>
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
      style={styles.rowCard}
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
  // "/hr" and "per hour": unit labels (exempt from the 14px rule)
  unit: { fontSize: 12, fontWeight: '500', color: Colors.light.muted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingNum: { fontSize: 14, color: Colors.light.text },
  // .tag: a badge (11px, exempt from the 14px rule)
  tag: { backgroundColor: Colors.light.lineSoft, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  tagText: { fontSize: 11, fontWeight: '600', color: Colors.light.text2 },
  newTag: { backgroundColor: Colors.light.limeWash, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  newTagText: { fontSize: 11, fontWeight: '600', color: Colors.light.limeDeep },
  price: { fontFamily: Font.display, fontSize: 15, color: Colors.light.text },
  pin: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
    borderRadius: 15,
  },
  rowPic: { width: 60, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: Colors.light.ink },
  rowPrice: { alignItems: 'flex-end' },
});
