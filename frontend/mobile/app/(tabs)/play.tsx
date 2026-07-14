import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

/**
 * Matchmaking is out of scope for this FYP (explicitly listed under
 * "Excluded Features (Future Scope)" in docs/01_PROJECT_OVERVIEW.md and
 * docs/Requirements.txt, and never mentioned in MASTER_DEVELOPMENT_PLAN.md).
 * The tab stays in the nav to match design/wireframes/Users.PNG's layout,
 * but only as an honest "coming soon" placeholder — no backend behind it.
 */
export default function PlayScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <Ionicons name="game-controller-outline" size={56} color={Colors.light.tint} />
        <Text style={styles.title}>Play</Text>
        <Text style={styles.subtitle}>Coming Soon</Text>
        <Text style={styles.body}>
          Matchmaking will let you find players and join open matches. It&apos;s planned for a
          future release.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.light.text, marginTop: 12 },
  subtitle: { fontSize: 15, fontWeight: '600', color: Colors.light.tint },
  body: { fontSize: 14, color: Colors.light.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
