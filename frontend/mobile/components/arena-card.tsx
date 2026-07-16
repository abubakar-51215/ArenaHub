import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Shadow } from '@/constants/theme';
import type { Arena } from '@/types';

export function ArenaCard({ arena, width }: { arena: Arena; width?: number }) {
  return (
    <Pressable
      style={[styles.card, width ? { width } : undefined]}
      onPress={() => router.push(`/arena/${arena.id}`)}>
      <Image
        source={arena.images[0] ? { uri: arena.images[0] } : undefined}
        style={styles.image}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {arena.name}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={Colors.light.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {arena.area ? `${arena.area}, ${arena.city}` : arena.city}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {arena.sports_offered.slice(0, 2).map((sport) => (
            <View key={sport} style={styles.sportPill}>
              <Text style={styles.sportPillText}>{sport}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  image: { width: '100%', height: 110, backgroundColor: Colors.light.card },
  body: { padding: 10, gap: 4 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: Colors.light.muted, flexShrink: 1 },
  sportPill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sportPillText: { fontSize: 10, color: Colors.light.tint, fontWeight: '600', textTransform: 'capitalize' },
});
