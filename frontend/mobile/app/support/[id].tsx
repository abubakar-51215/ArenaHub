import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/booking/parts';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { categoryLabel, complaintTitle, STATUS_LOOK } from '@/lib/complaints-ui';
import { formatDate } from '@/lib/karachi';
import { getMyComplaint } from '@/services/complaints';

// Complaint detail, from arena-hub-player-app-account.html (frames 31 and 32): the complaint with its status, and either the
// reply from Arena Hub or "We are looking into this" while there is none.
export default function ComplaintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['complaint', id], queryFn: () => getMyComplaint(id), enabled: !!id, retry: 1 });
  const c = q.data;
  const look = c ? STATUS_LOOK[c.status] : null;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Complaint" />
      {q.isLoading ? (
        <View style={[styles.card, { margin: 18, gap: 10 }]}>
          <Skeleton height={16} width="60%" radius={8} />
          <Skeleton height={14} width="40%" radius={7} />
          <Skeleton height={14} radius={7} />
        </View>
      ) : q.isError || !c || !look ? (
        <ErrorState title="Could not load this complaint." onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.title} accessibilityRole="header">
                {complaintTitle(c.description)}
              </Text>
              <StatusPill label={look.label} tone={look.tone} />
            </View>
            <Text style={styles.sub}>
              {categoryLabel(c.category)} · {formatDate(c.created_at)}
            </Text>
            <Text style={styles.body}>{c.description}</Text>
          </View>

          {c.admin_response ? (
            <>
              <Text style={styles.label} accessibilityRole="header">
                Reply from Arena Hub
              </Text>
              <View style={styles.reply}>
                <Text style={styles.replyText}>{c.admin_response}</Text>
                <Text style={styles.replyMeta}>
                  {c.updated_at ? `${formatDate(c.updated_at)} · ` : ''}Arena Hub support
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.waiting}>
              <Text style={styles.waitingText}>We are looking into this. We will tell you here and by notification when we reply.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 28 },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 14, color: Colors.light.muted, marginTop: 4, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, color: Colors.light.text },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 18, marginBottom: 8 },
  reply: { backgroundColor: Colors.light.limeWash, borderWidth: 1, borderColor: '#D9EBA0', borderRadius: 15, padding: 14 },
  replyText: { fontSize: 14, lineHeight: 21, color: Colors.light.text },
  replyMeta: { fontSize: 14, color: Colors.light.muted, marginTop: 8 },
  waiting: { marginTop: 12, backgroundColor: Colors.light.lineSoft, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 13, padding: 12 },
  waitingText: { fontSize: 14, lineHeight: 20, color: Colors.light.text },
});
