import { useQueries, useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MenuCard, MenuRow } from '@/components/g6/profile-ui';
import { ArenaImage } from '@/components/ui/arena-image';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Icon } from '@/components/ui/icon';
import { IconExtra } from '@/components/ui/icon-extra';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { formatRs } from '@/lib/money';
import { listLikedArenas } from '@/services/arenas';
import { logout } from '@/services/auth';
import { listBookingGroups, type BookingTab } from '@/services/bookings';
import { listMyReviews } from '@/services/reviews';
import { useAuthStore } from '@/store/auth';

// Profile, from arena-hub-player-app-account.html (frames 05 and 06): who I am, two numbers counted from my bookings
// (Games played, Spent), the rows that lead to the rest of the account, and Log out behind a red sheet with a plain Stay.
// "Your rating" and "Payment methods" are not here (no data for them).

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

const go = (path: string) => router.push(path as unknown as Href);

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: BookingTab[] = ['upcoming', 'past', 'cancelled'];
  const groups = useQueries({ queries: tabs.map((t) => ({ queryKey: ['booking-groups', t, 'all'], queryFn: () => listBookingGroups(t, 1, 100), retry: 1 })) });
  const liked = useQuery({ queryKey: ['liked-arenas'], queryFn: listLikedArenas, retry: 1 });
  const reviews = useQuery({ queryKey: ['my-reviews'], queryFn: listMyReviews, retry: 1 });

  const loadingStats = groups.some((q) => q.isLoading);
  const stats = useMemo(() => {
    const items = groups.flatMap((q) => q.data?.items ?? []);
    const played = items.filter((b) => b.status === 'completed').length;
    // what was paid for bookings that were not lost, minus what came back
    const spent = items.reduce((s, b) => s + (b.payment_status === 'completed' ? Number(b.pay_now) : 0) - Number(b.refund_amount), 0);
    return { played, spent: Math.max(0, spent) };
  }, [groups]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([...groups.map((q) => q.refetch()), liked.refetch(), reviews.refetch()]);
    setRefreshing(false);
  }, [groups, liked, reviews]);

  async function doLogout() {
    if (busy) return;
    setBusy(true);
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // the server could not be told: the phone signs out anyway
    } finally {
      clear();
      setBusy(false);
      setSheet(false);
      router.replace('/(auth)/login');
    }
  }

  const savedCount = liked.data?.total ?? liked.data?.items.length;
  const reviewCount = reviews.data?.total ?? reviews.data?.items.length;
  const name = user?.full_name ?? '';

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}>
        <View style={styles.who}>
          <ArenaImage
            photo={user?.profile_picture}
            style={styles.avatar}
            fallback={
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text variant="archivo" style={styles.avatarText}>
                  {initials(name)}
                </Text>
              </View>
            }
          />
          <View style={{ flex: 1 }}>
            <Text variant="archivo" style={styles.name} numberOfLines={2} accessibilityRole="header">
              {name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            {loadingStats ? <Skeleton width={50} height={24} radius={7} /> : <Text variant="archivo" style={styles.statNum}>{stats.played}</Text>}
            <Text style={styles.statLabel}>Games played</Text>
          </View>
          <View style={styles.stat}>
            {loadingStats ? <Skeleton width={90} height={24} radius={7} /> : <Text variant="archivo" style={styles.statNum}>{formatRs(stats.spent)}</Text>}
            <Text style={styles.statLabel}>Spent</Text>
          </View>
        </View>

        <MenuCard>
          <MenuRow icon={<Icon name="user" size={18} color={Colors.light.text2} />} title="Personal information" sub="Name, photo, contact" onPress={() => go('/profile/edit')} />
          <MenuRow
            icon={<Icon name="heart" size={18} color={Colors.light.text2} />}
            title="Saved arenas"
            sub={savedCount == null ? undefined : `${savedCount} saved`}
            onPress={() => go('/profile/liked')}
          />
          <MenuRow icon={<IconExtra name="receipt" color={Colors.light.text2} />} title="Payment history" sub="Payments and refunds" onPress={() => go('/profile/payments')} />
          <MenuRow icon={<IconExtra name="doc" color={Colors.light.text2} />} title="Booking history" sub="Download your report" onPress={() => go('/profile/report')} />
          <MenuRow
            icon={<Icon name="star" size={18} color={Colors.light.text2} />}
            title="My reviews"
            sub={reviewCount == null ? undefined : `${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`}
            onPress={() => go('/profile/reviews')}
          />
          <MenuRow icon={<Icon name="bell" size={18} color={Colors.light.text2} />} title="Notifications" onPress={() => go('/notifications')} />
          <MenuRow icon={<Icon name="set" size={18} color={Colors.light.text2} />} title="Settings" onPress={() => go('/profile/settings')} />
          <MenuRow icon={<IconExtra name="lifebuoy" color={Colors.light.text2} />} title="Help and support" onPress={() => go('/support')} />
          <MenuRow icon={<IconExtra name="doc" color={Colors.light.text2} />} title="Terms and privacy" onPress={() => go('/profile/legal')} last />
        </MenuCard>

        <MenuCard style={{ marginTop: 14 }}>
          <MenuRow icon={<IconExtra name="close" color={Colors.light.destructive} />} title="Log out" tone="off" danger onPress={() => setSheet(true)} last right={<View />} />
        </MenuCard>
      </ScrollView>

      <ConfirmSheet
        visible={sheet}
        title="Log out?"
        message="You will need to sign in again to see your bookings."
        confirmLabel="Log out"
        loading={busy}
        stacked
        onConfirm={doLogout}
        onCancel={() => !busy && setSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden' },
  avatarFallback: { backgroundColor: Colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: Colors.light.lime },
  name: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: Colors.light.text },
  email: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stat: { flex: 1, minHeight: 84, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 8 },
  statNum: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: Colors.light.text },
  statLabel: { fontSize: 14, color: Colors.light.muted },
});
