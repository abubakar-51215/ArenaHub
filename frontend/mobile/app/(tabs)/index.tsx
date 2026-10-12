import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NearMePrompt, useNearMe } from '@/components/g6/near-me-prompt';
import { SportChips } from '@/components/home/sport-chips';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { LightStatusBar, useDarkTop } from '@/components/ui/light-status-bar';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { VenueCard, VenueRow } from '@/components/venue';
import { HOME_CALL_TIMEOUT_MS } from '@/constants/brand';
import { Colors } from '@/constants/theme';
import { useArenaSearch } from '@/hooks/useArenas';
import { getRecommendations } from '@/services/ai';
import { getTrendingArenas } from '@/services/arenas';
import { getUnreadCount } from '@/services/notifications';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import { useSearchFilters } from '@/store/search-filters';

// Home, from the frames of arena-hub-player-app-home-search.html: the dark
// hero, the sport chips, and three sections that each load on their own
// (their own shimmer; a small inline "Could not load" when one fails; hidden
// when empty). The whole-screen error shows only if all three fail.
// Home's "See all" links and sport chips open the Results screen with a preset
const results = (preset: Parameters<ReturnType<typeof useSearchFilters.getState>['open']>[0]) => {
  useSearchFilters.getState().open(preset);
  router.push('/results' as unknown as Href);
};

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={14} accessibilityRole="link" accessibilityLabel={`See all ${title}`}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>Could not load.</Text>
      <Pressable onPress={onRetry} hitSlop={14} accessibilityRole="button" accessibilityLabel="Try again">
        <Text style={styles.inlineErrorLink}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const darkTop = useDarkTop(insets.top + 150); // the dark hero is about 300 px tall
  const user = useAuthStore((s) => s.user);
  const { city, detect } = useLocationStore();
  const nearMe = useNearMe();
  const [refreshing, setRefreshing] = useState(false);

  const trending = useQuery({
    queryKey: ['trending-arenas', city],
    queryFn: () => getTrendingArenas({ days: 7, city: city ?? undefined, limit: 8, timeoutMs: HOME_CALL_TIMEOUT_MS }),
  });
  const recommended = useQuery({
    queryKey: ['recommendations', city],
    queryFn: () => getRecommendations({ city: city ?? undefined, limit: 8, timeoutMs: HOME_CALL_TIMEOUT_MS }),
  });
  const popular = useArenaSearch({ sort: 'rating_desc', page_size: 10 }, { timeoutMs: HOME_CALL_TIMEOUT_MS });
  const unread = useQuery({ queryKey: ['unread-count'], queryFn: () => getUnreadCount({ timeoutMs: HOME_CALL_TIMEOUT_MS }), staleTime: 15_000 });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([trending.refetch(), recommended.refetch(), popular.refetch(), unread.refetch()]);
    setRefreshing(false);
  }, [trending, recommended, popular, unread]);

  const allFailed = trending.isError && recommended.isError && popular.isError;
  const first = user?.full_name?.split(' ')[0] ?? 'there';
  // the detected city, else the first city saved in the profile, else "All cities": never a permission message
  const savedCity = user?.preferred_locations?.[0] ?? 'All cities';

  return (
    <View style={styles.page}>
      <LightStatusBar light={darkTop.onTop} />
      <ScrollView
        onScroll={darkTop.onScroll}
        scrollEventThrottle={darkTop.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
        contentContainerStyle={{ paddingBottom: 28 }}>
        {/* the dark hero */}
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 300 200" preserveAspectRatio="none" opacity={0.4} pointerEvents="none">
            <Rect width={300} height={200} fill="#0F1A15" />
            <Circle cx={250} cy={20} r={90} fill="#C4F546" fillOpacity={0.08} />
            <Path d="M0 150h300M0 110h300" stroke="#C4F546" strokeOpacity={0.08} />
          </Svg>
          <View style={styles.heroPad}>
            <View style={styles.heroTop}>
              <Pressable onPress={detect} hitSlop={10} style={styles.where} accessibilityRole="button" accessibilityLabel="Detect my location">
                <Icon name="pin" size={13} color="#8FA096" />
                <Text style={styles.whereText}>{city ?? savedCity}</Text>
              </Pressable>
              <View style={styles.heroMark} pointerEvents="none">
                <BrandMark mode="still" tone="dark" size={30} />
              </View>
              <Pressable
                onPress={() => router.push('/notifications')}
                hitSlop={7}
                style={styles.bell}
                accessibilityRole="button"
                accessibilityLabel={unread.data ? `Notifications, ${unread.data} unread` : 'Notifications'}>
                <Icon name="bell" size={15} color="#8FA096" />
                {unread.data ? <View style={styles.dot} /> : null}
              </Pressable>
            </View>
            <Text variant="archivo" style={styles.heroTitle} accessibilityRole="header">
              {`Salaam, ${first}.\nWhere are you playing?`}
            </Text>
            <PressableScale onPress={() => router.push('/(tabs)/search')} accessibilityRole="search" accessibilityLabel="Search arenas, sports, areas">
              <View style={styles.search}>
                <Icon name="search" size={15} color="#8FA096" />
                <Text style={styles.searchText}>Search arenas, sports, areas</Text>
              </View>
            </PressableScale>
          </View>
        </View>

        <View style={{ paddingTop: 14 }}>
          <SportChips onSelect={(s) => (s === 'all' ? null : results({ sport: s }))} />
        </View>

        {allFailed ? (
          <View style={styles.errorBox}>
            <View style={{ marginBottom: 10 }}>
<BrandMark mode="offline" size={72} />
</View>
            <Text variant="archivo" style={styles.errorTitle}>
              Could not load arenas
            </Text>
            <Text style={styles.errorText}>Check your connection and try again.</Text>
            <View style={styles.errorButton}>
              <Button title="Try again" onPress={onRefresh} />
            </View>
          </View>
        ) : (
          <>
            {/* Trending now */}
            {trending.isLoading ? (
              <View style={styles.pad}>
                <View style={{ marginTop: 20 }}>
                  <Skeleton width={120} height={14} radius={6} />
                </View>
                <View style={styles.hRow}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={{ width: 158 }}>
                      <Skeleton height={82} radius={12} />
                      <View style={{ height: 8 }} />
                      <Skeleton width={110} height={12} radius={6} />
                      <View style={{ height: 6 }} />
                      <Skeleton width={80} height={10} radius={6} />
                    </View>
                  ))}
                </View>
              </View>
            ) : trending.isError ? (
              <View style={styles.pad}>
                <SectionHeader title="Trending now" />
                <InlineError onRetry={() => trending.refetch()} />
              </View>
            ) : trending.data?.items.length ? (
              <View>
                <View style={styles.pad}>
                  <SectionHeader title="Trending now" onSeeAll={() => results({ sort: 'newest', title: 'Trending now' })} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
                  {trending.data.items.map((a) => (
                    <VenueCard key={a.id} arena={a} width={158} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Recommended for you (no "See all") */}
            {recommended.isLoading ? (
              <View style={styles.pad}>
                <View style={{ marginTop: 20, marginBottom: 10 }}>
                  <Skeleton width={150} height={14} radius={6} />
                </View>
                {[0, 1].map((i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <Skeleton width={60} height={52} radius={10} />
                    <View style={{ flex: 1 }}>
                      <Skeleton width="70%" height={12} radius={6} />
                      <View style={{ height: 8 }} />
                      <Skeleton width="50%" height={10} radius={6} />
                    </View>
                  </View>
                ))}
              </View>
            ) : recommended.isError ? (
              <View style={styles.pad}>
                <SectionHeader title="Recommended for you" />
                <InlineError onRetry={() => recommended.refetch()} />
              </View>
            ) : recommended.data?.items.length ? (
              <View style={styles.pad}>
                <SectionHeader title="Recommended for you" />
                <View style={{ gap: 10 }}>
                  {recommended.data.items.map((a) => (
                    <VenueRow key={a.id} arena={a} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Popular arenas: 2-column grid */}
            {popular.isLoading ? (
              <View style={styles.pad}>
                <View style={{ marginTop: 20, marginBottom: 10 }}>
                  <Skeleton width={130} height={14} radius={6} />
                </View>
                <View style={styles.grid}>
                  {[0, 1].map((i) => (
                    <View key={i} style={{ flex: 1 }}>
                      <Skeleton height={82} radius={12} />
                      <View style={{ height: 8 }} />
                      <Skeleton width="70%" height={12} radius={6} />
                    </View>
                  ))}
                </View>
              </View>
            ) : popular.isError ? (
              <View style={styles.pad}>
                <SectionHeader title="Popular arenas" />
                <InlineError onRetry={() => popular.refetch()} />
              </View>
            ) : popular.data?.items.length ? (
              <View style={styles.pad}>
                <SectionHeader title="Popular arenas" onSeeAll={() => results({ sort: 'rating_desc', title: 'Popular arenas' })} />
                <View style={styles.grid}>
                  {popular.data.items.map((a) => (
                    <View key={a.id} style={styles.gridCell}>
                      <VenueCard arena={a} />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <NearMePrompt visible={nearMe.visible} onAllow={nearMe.allow} onNotNow={nearMe.notNow} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  hero: { backgroundColor: Colors.light.ink, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden' },
  heroPad: { paddingHorizontal: 18 },
  heroMark: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30 },
  whereText: { fontSize: 14, color: '#8FA096' },
  bell: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#1C2B23', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.light.lime },
  heroTitle: { fontSize: 25, lineHeight: 27, fontWeight: '700', letterSpacing: -0.75, color: '#FFFFFF', marginBottom: 3 },
  search: {
    marginTop: 14,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    backgroundColor: '#1C2B23',
    borderColor: '#26362D',
    borderWidth: 1,
    borderRadius: 12,
  },
  searchText: { fontSize: 14, color: '#8FA096' },
  pad: { paddingHorizontal: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 9 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  seeAll: { fontSize: 14, fontWeight: '600', color: Colors.light.limeDeep },
  hRow: { gap: 11, paddingHorizontal: 18, paddingBottom: 4, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  gridCell: { width: '48.4%' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  inlineErrorText: { fontSize: 14, color: Colors.light.muted },
  inlineErrorLink: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  errorBox: { alignItems: 'center', paddingTop: 44, paddingHorizontal: 18 },
  errorIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.light.redWash, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  errorText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 18, textAlign: 'center' },
  errorButton: { width: 200 },
});
