import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/booking/parts';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { matchPill, matchTitle, matchWhen, priceEach } from '@/lib/match-ui';
import type { Match } from '@/types';

/** A match card (arena-hub-player-app-play.html, frames 06 and 07): sport and arena, when, how full, and "about X each". */
export function MatchCard({ match, myId, showPill }: { match: Match; myId?: string; showPill?: boolean }) {
  const pill = matchPill(match, myId);
  const price = priceEach(match.booking_total, match.max_players);
  const pct = Math.min(100, Math.round((match.players_joined / Math.max(1, match.max_players)) * 100));
  return (
    <PressableScale
      style={styles.card}
      contentStyle={styles.content}
      onPress={() => router.push({ pathname: '/play/[matchId]', params: { matchId: match.id } } as unknown as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${matchTitle(match)}, ${matchWhen(match)}, ${match.players_joined} of ${match.max_players} players${price ? `, ${price}` : ''}`}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {matchTitle(match)}
        </Text>
        {showPill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
      </View>
      <Text style={styles.when}>{matchWhen(match)}</Text>
      <View style={styles.row}>
        <Text style={styles.count}>
          <Text style={styles.countStrong}>
            {match.players_joined} / {match.max_players}
          </Text>{' '}
          players
        </Text>
        {price ? <Text style={styles.price}>{price}</Text> : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }, match.status === 'cancelled' && { backgroundColor: Colors.light.line }]} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, marginBottom: 10 },
  content: { padding: 14, gap: 6, minHeight: 60 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  when: { fontSize: 14, color: Colors.light.muted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 },
  count: { fontSize: 14, color: Colors.light.muted },
  countStrong: { fontWeight: '700', color: Colors.light.text },
  price: { fontSize: 14, color: Colors.light.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.light.lineSoft, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, borderRadius: 3, backgroundColor: Colors.light.limeDeep },
});
