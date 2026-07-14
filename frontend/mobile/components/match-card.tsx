import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import type { Match } from '@/types';

const SPORT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  futsal: 'football-outline',
  football: 'football-outline',
  cricket: 'baseball-outline',
  badminton: 'tennisball-outline',
  tennis: 'tennisball-outline',
  padel: 'tennisball-outline',
};

const STATUS_LABEL: Record<Match['status'], string> = {
  open: 'Open',
  full: 'Full',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const STATUS_COLOR: Record<Match['status'], string> = {
  open: Colors.light.success,
  full: Colors.light.warning,
  cancelled: Colors.light.destructive,
  completed: Colors.light.muted,
};

export function MatchCard({
  match,
  onJoin,
  joining,
  showStatus,
}: {
  match: Match;
  onJoin?: (match: Match) => void;
  joining?: boolean;
  showStatus?: boolean;
}) {
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/play/[matchId]', params: { matchId: match.id } })}>
      <View style={styles.icon}>
        <Ionicons
          name={SPORT_ICONS[match.sport] ?? 'game-controller-outline'}
          size={22}
          color={Colors.light.tint}
        />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {match.sport} · {match.max_players} players
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {match.arena_name} · {match.match_date}, {match.start_time.slice(0, 5)}
        </Text>
        <Text style={styles.players}>
          {match.players_joined} / {match.max_players} Players
        </Text>
      </View>
      {showStatus ? (
        <View style={[styles.badge, { backgroundColor: `${STATUS_COLOR[match.status]}22` }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[match.status] }]}>
            {STATUS_LABEL[match.status]}
          </Text>
        </View>
      ) : (
        <Button
          title="Join"
          variant="outline"
          loading={joining}
          onPress={() => onJoin?.(match)}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: '700', color: Colors.light.text, textTransform: 'capitalize' },
  meta: { fontSize: 12, color: Colors.light.muted },
  players: { fontSize: 12, fontWeight: '600', color: Colors.light.tint },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
