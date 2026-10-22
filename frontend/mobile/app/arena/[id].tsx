import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoGallery } from '@/components/arena/photo-gallery';
import { LightStatusBar, useDarkTop } from '@/components/ui/light-status-bar';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { ErrorCopy } from '@/components/ui/state-view';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ReadMore } from '@/components/ui/read-more';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { Colors, Font } from '@/constants/theme';
import { sportLabel } from '@/constants/sports';
import { useArena, useArenaCourts, useArenaRating } from '@/hooks/useArenas';
import { useSlotsToday } from '@/hooks/useSlotsInfo';
import { ApiError } from '@/lib/api';
import { openDirections } from '@/lib/directions';
import { formatRs } from '@/lib/money';
import { openTillLabel } from '@/lib/slots';
import { listArenaReviews } from '@/services/reviews';
import type { Court } from '@/types';
import { TapBox } from '@/components/ui/tap-box';

// Arena details, from arena-hub-player-app-arena-slots.html: the photo area,
// the name and rating, the sports and "Open till" tags, the description (with
// Read more), what you get, the Courts rows ("N open tonight" and the from
// price), a recent review, and a sticky "Choose a court". Each section that
// can fail shows its own "Could not load. Try again". A missing or suspended
// arena shows "This arena is not available".
const AMENITY_ICON: Record<string, IconName> = {
  parking: 'park',
  changing: 'shirt',
  'changing room': 'shirt',
  floodlights: 'light',
  cafe: 'cafe',
};
const amenityIcon = (name: string): IconName => AMENITY_ICON[name.trim().toLowerCase()] ?? 'tick'; // unknown amenities get a plain tick

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={styles.eyebrow} accessibilityRole="header">
      {children}
    </Text>
  );
}

function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.inlineError}>
      <Text style={styles.muted}>Could not load.</Text>
      <TapBox onPress={onRetry} slop={14} accessibilityRole="button" accessibilityLabel="Try again">
        <Text style={styles.inlineLink}>Try again</Text>
      </TapBox>
    </View>
  );
}

function CourtRow({ court, open, lowest, onPress }: { court: Court; open: number | undefined; lowest: string | null | undefined; onPress: () => void }) {
  const meta = [court.sport_types.map(sportLabel).join(' · '), court.capacity ? `up to ${court.capacity} players` : null].filter(Boolean).join(' · ');
  return (
    <PressableScale
      style={styles.courtBox}
      contentStyle={styles.courtRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${court.name}, choose a time`}>
      <View style={styles.courtIcon}>
        <Icon name="ball" size={16} color={Colors.light.limeDeep} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.courtName}>{court.name}</Text>
        <Text style={[styles.muted, { marginTop: 2 }]} numberOfLines={1}>
          {meta}
        </Text>
        {open === undefined ? null : (
          <Text style={[styles.openLine, open > 0 ? styles.openYes : styles.muted]}>{open > 0 ? `${open} open tonight` : 'Fully booked tonight'}</Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{formatRs(lowest ?? court.base_price)}</Text>
        <Text style={styles.unit}>from /hr</Text>
      </View>
    </PressableScale>
  );
}

export default function ArenaDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const arena = useArena(id);
  const courts = useArenaCourts(id);
  const today = useSlotsToday(id);
  const rating = useArenaRating(id);
  const reviews = useQuery({ queryKey: ['arena-reviews-preview', id], queryFn: () => listArenaReviews(id as string), enabled: !!id });
  const scroll = useRef<ScrollView>(null);
  const darkTop = useDarkTop(120); // the photo is about 200 px tall
  const courtsY = useRef(0);

  const missing = arena.error instanceof ApiError && arena.error.status === 404;

  if (missing) {
    return (
      <View style={styles.page}>
        <View style={[styles.plainHead, { paddingTop: insets.top + 8 }]}>
          <TapBox onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} slop={7} inner={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="back" size={15} color={Colors.light.text} />
          </TapBox>
        </View>
        <View style={styles.centerBox}>
          <View style={[styles.stateIcon, { backgroundColor: Colors.light.lineSoft }]}>
            <Icon name="pin" size={26} color={Colors.light.text2} />
          </View>
          <Text variant="archivo" style={styles.stateTitle}>
            This arena is not available
          </Text>
          <Text style={styles.stateText}>It may be closed for now or no longer listed.</Text>
          <View style={styles.stateButton}>
            <Button title="Back to search" variant="ghost" onPress={() => router.replace('/(tabs)/search')} />
          </View>
        </View>
      </View>
    );
  }

  if (arena.isError) {
    return (
      <View style={styles.page}>
        <View style={[styles.plainHead, { paddingTop: insets.top + 8 }]}>
          <TapBox onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} slop={7} inner={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="back" size={15} color={Colors.light.text} />
          </TapBox>
        </View>
        <View style={styles.centerBox}>
          <View style={{ marginBottom: 10 }}>
<BrandMark mode="offline" size={72} />
</View>
          <ErrorCopy title="Could not load this arena" titleStyle={styles.stateTitle} textStyle={styles.stateText} />
          <View style={styles.stateButton}>
            <Button title="Try again" onPress={() => arena.refetch()} />
          </View>
        </View>
      </View>
    );
  }

  if (arena.isLoading || !arena.data) {
    return (
      <View style={styles.page}>
        <Skeleton height={176 + insets.top} radius={0} />
        <View style={styles.pad}>
          <View style={{ height: 16 }} />
          <Skeleton width="60%" height={20} radius={6} />
          <View style={{ height: 8 }} />
          <Skeleton width="40%" height={12} radius={6} />
          <View style={{ height: 14 }} />
          <View style={styles.row}>
            <Skeleton width={60} height={22} radius={6} />
            <Skeleton width={60} height={22} radius={6} />
          </View>
          <View style={{ height: 16 }} />
          <Skeleton height={12} radius={6} />
          <View style={{ height: 6 }} />
          <Skeleton height={12} radius={6} />
          <View style={{ height: 6 }} />
          <Skeleton width="70%" height={12} radius={6} />
          <View style={{ height: 22 }} />
          <View style={styles.row}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.flex}>
                <Skeleton height={58} radius={11} />
              </View>
            ))}
          </View>
          <View style={{ height: 22 }} />
          <Skeleton height={74} radius={14} />
          <View style={{ height: 9 }} />
          <Skeleton height={74} radius={14} />
        </View>
      </View>
    );
  }

  const a = arena.data;
  const sports = a.sports_offered.slice(0, 3);
  const open = openTillLabel(a.operating_hours);
  const courtList = courts.data ?? [];
  const todayBy = new Map((today.data ?? []).map((t) => [t.court_id, t]));
  const prices = courtList.map((c) => Number(todayBy.get(c.id)?.lowest_price ?? c.base_price));
  const fromPrice = prices.length ? Math.min(...prices) : null;
  const goToCourt = (courtId: string) => router.push({ pathname: '/court/[id]/slots', params: { id: courtId, arenaId: a.id } });
  const chooseCourt = () => {
    if (courtList.length === 1) goToCourt(courtList[0].id);
    else scroll.current?.scrollTo({ y: Math.max(0, courtsY.current - 12), animated: true });
  };
  const summary = rating.data;
  const first = reviews.data?.items[0];
  const initials = (first?.reviewer_name ?? '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.page}>
      <LightStatusBar light={darkTop.onTop} />
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }} onScroll={darkTop.onScroll} scrollEventThrottle={darkTop.scrollEventThrottle}>
        <PhotoGallery arenaId={a.id} photos={a.images} sport={a.sports_offered[0]} />
        <View style={styles.pad}>
          <View style={styles.headRow}>
            <View style={styles.flex}>
              <Text variant="archivo" style={styles.title} accessibilityRole="header">
                {a.name}
              </Text>
              <View style={styles.where}>
                <Icon name="pin" size={12} color={Colors.light.muted} />
                <Text style={styles.muted}>{a.area ? `${a.area}, ${a.city}` : a.city}</Text>
              </View>
              <TapBox onPress={() => openDirections(a)} slop={10} style={styles.directions} inner={styles.directionsInner} accessibilityRole="button" accessibilityLabel="Get directions">
                <Icon name="pin" size={12} color={Colors.light.limeText} />
                <Text style={styles.directionsText}>Get Directions</Text>
              </TapBox>
            </View>
            {summary && summary.review_count > 0 && summary.average_rating != null ? (
              <Badge status="ok" label={`${summary.average_rating} · ${summary.review_count}`} />
            ) : (
              <Badge status="ok" label="New" />
            )}
          </View>

          <View style={styles.tags}>
            {sports.map((s) => (
              <View key={s} style={styles.tag}>
                <Text style={styles.tagText}>{sportLabel(s)}</Text>
              </View>
            ))}
            {open ? (
              <View style={[styles.tag, styles.tagOpen]}>
                <Text style={[styles.tagText, { color: Colors.light.limeText }]}>{open}</Text>
              </View>
            ) : null}
          </View>

          {a.description ? (
            <View style={{ marginTop: 12 }}>
              <ReadMore text={a.description} />
            </View>
          ) : null}

          {a.amenities.length ? (
            <>
              <SectionLabel>What you get</SectionLabel>
              <View style={styles.amen}>
                {a.amenities.map((m) => (
                  <View key={m.id} style={styles.amenCell}>
                    <Icon name={amenityIcon(m.name)} size={16} color={Colors.light.limeDeep} />
                    <Text style={styles.amenText} numberOfLines={1}>
                      {m.name}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View onLayout={(e) => (courtsY.current = e.nativeEvent.layout.y)}>
            <SectionLabel>Courts</SectionLabel>
            {courts.isLoading ? (
              <View style={{ gap: 9 }}>
                <Skeleton height={74} radius={14} />
                <Skeleton height={74} radius={14} />
              </View>
            ) : courts.isError ? (
              <InlineError onRetry={() => courts.refetch()} />
            ) : courtList.length === 0 ? (
              <Text style={styles.muted}>No courts are open for booking yet.</Text>
            ) : (
              <View style={{ gap: 9 }}>
                {courtList.map((c) => (
                  <CourtRow key={c.id} court={c} open={today.isError ? undefined : todayBy.get(c.id)?.open_count} lowest={todayBy.get(c.id)?.lowest_price} onPress={() => goToCourt(c.id)} />
                ))}
              </View>
            )}
          </View>

          <View style={styles.reviewsHead}>
            <SectionLabel>Recent reviews</SectionLabel>
            {summary && summary.review_count > 0 ? (
              <TapBox onPress={() => router.push({ pathname: '/arena/[id]/reviews', params: { id: a.id } })} slop={14} accessibilityRole="link" accessibilityLabel={`See all ${summary.review_count} reviews`}>
                <Text style={styles.seeAll}>See all {summary.review_count}</Text>
              </TapBox>
            ) : null}
          </View>
          {reviews.isLoading ? (
            <Skeleton height={74} radius={14} />
          ) : reviews.isError ? (
            <InlineError onRetry={() => reviews.refetch()} />
          ) : first ? (
            <View style={styles.review}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <Text style={styles.reviewer}>{first.reviewer_name}</Text>
                <View style={styles.stars} accessibilityLabel={`${first.rating} out of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Icon key={i} name="star" size={12} color={i < first.rating ? Colors.light.amber : Colors.light.line} />
                  ))}
                </View>
              </View>
              {first.review_text ? <Text style={styles.reviewText}>{first.review_text}</Text> : null}
            </View>
          ) : (
            <Text style={styles.muted}>No reviews yet.</Text>
          )}
        </View>
      </ScrollView>

      <StickyBar style={{ paddingBottom: Math.max(14, insets.bottom) }}>
        {fromPrice != null ? (
          <View style={styles.fromRow}>
            <Text style={styles.muted}>From</Text>
            <Text>
              <Text style={styles.fromPrice}>{formatRs(fromPrice)}</Text>
              <Text style={styles.unit}> / hour</Text>
            </Text>
          </View>
        ) : null}
        <Button title="Choose a court" disabled={courts.isLoading || courtList.length === 0} onPress={chooseCourt} />
      </StickyBar>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 18, paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: 14, color: Colors.light.muted },
  plainHead: { paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row' },
  back: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card, alignItems: 'center', justifyContent: 'center' },
  centerBox: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 18 },
  stateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 18, textAlign: 'center' },
  stateButton: { width: 200 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 17, lineHeight: 20, fontWeight: '700', letterSpacing: -0.34, color: Colors.light.text },
  where: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  directions: { marginTop: 8 },
  directionsInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  directionsText: { fontSize: 14, fontWeight: '600', color: Colors.light.limeText },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { backgroundColor: Colors.light.lineSoft, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  tagOpen: { backgroundColor: Colors.light.limeWash },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  // a decorative uppercase label: 12px (the floor for micro labels; information text is 14px)
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 16, marginBottom: 8 },
  amen: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  amenCell: { width: '23.4%', alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 11, borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card },
  amenText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  courtBox: { backgroundColor: Colors.light.card, borderColor: Colors.light.line, borderWidth: 1, borderRadius: 15 },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, minHeight: 74 },
  courtIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.light.limeWash, alignItems: 'center', justifyContent: 'center' },
  courtName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  openLine: { fontSize: 14, fontWeight: '600', marginTop: 3 },
  openYes: { color: Colors.light.limeText },
  right: { alignItems: 'flex-end' },
  price: { fontFamily: Font.display, fontSize: 15, color: Colors.light.text },
  unit: { fontSize: 14, color: Colors.light.muted },
  reviewsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seeAll: { fontSize: 14, fontWeight: '600', color: Colors.light.limeText, marginTop: 10 },
  review: { backgroundColor: Colors.light.card, borderColor: Colors.light.line, borderWidth: 1, borderRadius: 15, padding: 11 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700', color: Colors.light.text2 },
  reviewer: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  stars: { flexDirection: 'row', gap: 1, marginLeft: 'auto' },
  reviewText: { fontSize: 14, lineHeight: 20, color: Colors.light.text2, marginTop: 6 },
  fromRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  fromPrice: { fontFamily: Font.display, fontSize: 19, color: Colors.light.text },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  inlineLink: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
});
