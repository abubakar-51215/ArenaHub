import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingGroupCard } from '@/components/booking/booking-group-card';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { ErrorCopy } from '@/components/ui/state-view';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Colors, Shadow } from '@/constants/theme';
import { listBookingGroups, type BookingTab } from '@/services/bookings';

// My bookings, from arena-hub-player-app-bookings.html (frames Upcoming, Past, Cancelled, Empty,
// Loading, Could not load). One card per booking; the server decides which tab a booking is on.
const TABS: { value: BookingTab; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];
const EMPTY: Record<BookingTab, { title: string; text: string; button: boolean }> = {
  upcoming: { title: 'No upcoming games.', text: 'Pick an arena and a time. Your next booking will show up here.', button: true },
  past: { title: 'No past games yet.', text: 'Games you have played will show up here.', button: false },
  cancelled: { title: 'No cancelled bookings.', text: 'Bookings you cancel will show up here.', button: false },
};

function SkeletonCard() {
  return (
    <View style={styles.skCard}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Skeleton width={50} height={54} radius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={14} width="60%" radius={7} />
          <Skeleton height={14} width="40%" radius={7} />
        </View>
      </View>
      <View style={styles.skLine}>
        <Skeleton height={14} width="35%" radius={7} />
      </View>
    </View>
  );
}

export default function BookingsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<BookingTab>('upcoming');
  useEffect(() => {
    if (tabParam === 'past' || tabParam === 'cancelled' || tabParam === 'upcoming') setTab(tabParam);
  }, [tabParam]);

  const q = useQuery({ queryKey: ['booking-groups', tab], queryFn: () => listBookingGroups(tab), retry: 1 });
  const items = q.data?.items ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  const empty = EMPTY[tab];
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="My bookings" back={false} />
      <View style={styles.segWrap}>
        <View style={styles.seg} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = t.value === tab;
            return (
              <Pressable
                key={t.value}
                onPress={() => setTab(t.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.segBtn, on && styles.segOn]}>
                <Text style={[styles.segText, { color: on ? Colors.light.text : Colors.light.muted }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {q.isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : q.isError && !q.data ? (
        <View style={styles.state}>
          <View style={{ marginBottom: 14 }}>
            <BrandMark mode="offline" size={74} />
          </View>
          <ErrorCopy title="Could not load your bookings." titleStyle={styles.stateTitle} textStyle={styles.stateText} />
          <View style={styles.stateButton}>
            <Button title="Try again" onPress={() => q.refetch()} />
          </View>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.booking_group_id}
          renderItem={({ item }) => <BookingGroupCard item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
          ListEmptyComponent={
            <View style={styles.state}>
              <View style={styles.circle}>
                <Icon name="cal" size={32} color={Colors.light.limeDeep} />
              </View>
              <Text variant="archivo" style={styles.stateTitle}>
                {empty.title}
              </Text>
              <Text style={styles.stateText}>{empty.text}</Text>
              {empty.button ? (
                <View style={styles.stateButton}>
                  <Button title="Find an arena" variant="lime" onPress={() => router.push('/(tabs)/search' as Href)} />
                </View>
              ) : null}
            </View>
          }
          ListFooterComponent={tab === 'past' && items.length > 0 ? <Text style={styles.footer}>That is all your past bookings.</Text> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  segWrap: { paddingHorizontal: 18 },
  seg: { flexDirection: 'row', gap: 3, backgroundColor: Colors.light.lineSoft, borderRadius: 11, padding: 3 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.light.card, ...Shadow.segmentActive },
  segText: { fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24, flexGrow: 1 },
  skCard: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 12, marginBottom: 10 },
  skLine: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.light.line, borderStyle: 'dashed' },
  state: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 10 },
  circle: { width: 74, height: 74, borderRadius: 37, backgroundColor: Colors.light.limeWash, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stateTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text, textAlign: 'center' },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 20, textAlign: 'center' },
  stateButton: { width: '100%' },
  footer: { fontSize: 14, color: Colors.light.muted, textAlign: 'center', marginTop: 14 },
});
