import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHead } from '@/components/ui/screen-head';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { FAQ } from '@/constants/support';

// A common question and its answer, from arena-hub-player-app-account.html (frame 33).
export default function FaqScreen() {
  const { i } = useLocalSearchParams<{ i?: string }>();
  const item = FAQ[Math.min(Math.max(Number(i) || 0, 0), FAQ.length - 1)];
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Common questions" />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <Text style={styles.q} accessibilityRole="header">
          {item.question}
        </Text>
        <Text style={styles.a}>{item.answer}</Text>
        {item.note ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{item.note}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 28 },
  q: { fontSize: 17, fontWeight: '700', color: Colors.light.text, marginBottom: 8 },
  a: { fontSize: 15, lineHeight: 24, color: Colors.light.text, marginBottom: 12 },
  note: { backgroundColor: Colors.light.limeWash, borderWidth: 1, borderColor: Colors.light.limeDeep, borderRadius: 11, padding: 12 },
  noteText: { fontSize: 14, lineHeight: 20, color: Colors.light.noteText },
});
