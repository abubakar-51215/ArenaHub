import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/booking/parts';
import { IconTile, MenuCard } from '@/components/g6/profile-ui';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconExtra } from '@/components/ui/icon-extra';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { FAQ } from '@/constants/support';
import { categoryLabel, complaintTitle, STATUS_LOOK } from '@/lib/complaints-ui';
import { timeAgo } from '@/lib/karachi';
import { listMyComplaints, type Complaint } from '@/services/complaints';

// Help and support, from arena-hub-player-app-account.html (frames 27 and 28): "Something went wrong?" with New complaint,
// my complaints (status and age) and three common questions. The "Contact us" block is left out until the real email and hours
// are decided (docs/BEFORE_GOING_LIVE.md).
const go = (path: string) => router.push(path as unknown as Href);

function ComplaintCard({ c }: { c: Complaint }) {
  const look = STATUS_LOOK[c.status];
  return (
    <Pressable onPress={() => go(`/support/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${complaintTitle(c.description)}, ${look.label}`} style={styles.complaint}>
      <View style={styles.cTop}>
        <Text style={styles.cTitle} numberOfLines={2}>
          {complaintTitle(c.description)}
        </Text>
        <StatusPill label={look.label} tone={look.tone} />
      </View>
      <Text style={styles.cSub}>
        {categoryLabel(c.category)} · {timeAgo(c.created_at)}
      </Text>
    </Pressable>
  );
}

export default function HelpScreen() {
  const q = useQuery({ queryKey: ['my-complaints'], queryFn: listMyComplaints, retry: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  const items = q.data?.items ?? [];
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Help and support" />
      <ScrollView
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}>
        <View style={styles.hero}>
          <IconTile tone="ok">
            <IconExtra name="lifebuoy" color={Colors.light.limeDeep} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Something went wrong?</Text>
            <Text style={styles.heroText}>Tell us and we will look into it.</Text>
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <Button title="New complaint" variant="lime" onPress={() => go('/support/new')} />
        </View>

        <Text style={styles.label} accessibilityRole="header">
          My complaints
        </Text>
        {q.isLoading ? (
          <View style={{ gap: 10 }}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.complaint, { gap: 10 }]}>
                <Skeleton height={14} width="60%" radius={7} />
                <Skeleton height={14} width="40%" radius={7} />
              </View>
            ))}
          </View>
        ) : q.isError && !q.data ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Could not load your complaints.</Text>
            <Pressable onPress={() => q.refetch()} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>You have not sent any complaints.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((c) => (
              <ComplaintCard key={c.id} c={c} />
            ))}
          </View>
        )}

        <Text style={styles.label} accessibilityRole="header">
          Common questions
        </Text>
        <MenuCard>
          {FAQ.map((f, i) => (
            <Pressable key={f.question} onPress={() => go(`/support/faq?i=${i}`)} accessibilityRole="button" accessibilityLabel={f.question} style={[styles.faq, i < FAQ.length - 1 && styles.faqLine]}>
              <Text style={styles.faqText}>{f.question}</Text>
              <Icon name="chev" size={15} color={Colors.light.muted} />
            </Pressable>
          ))}
        </MenuCard>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 28 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 14 },
  heroTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  heroText: { fontSize: 14, color: Colors.light.muted, marginTop: 1 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 20, marginBottom: 8 },
  complaint: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 14, minHeight: 60 },
  cTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  cSub: { fontSize: 14, color: Colors.light.muted, marginTop: 6 },
  empty: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 14, color: Colors.light.muted, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  retryText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeText },
  faq: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 56, paddingVertical: 8 },
  faqLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  faqText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
});
