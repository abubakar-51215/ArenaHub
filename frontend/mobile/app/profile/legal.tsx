import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHead } from '@/components/ui/screen-head';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { LEGAL_DRAFT_NOTE, PRIVACY, TERMS } from '@/constants/legal';

// Terms and privacy, from arena-hub-player-app-account.html (frame 15): two tabs and the text. The words live in
// constants/legal.ts (draft text), so replacing them is a one-file change.
type Tab = 'terms' | 'privacy';

export default function LegalScreen() {
  const [tab, setTab] = useState<Tab>('terms');
  const sections = tab === 'terms' ? TERMS : PRIVACY;
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Terms and privacy" />
      <View style={styles.seg}>
        <Segmented
          options={[
            { value: 'terms', label: 'Terms' },
            { value: 'privacy', label: 'Privacy' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <Text style={styles.draft}>{LEGAL_DRAFT_NOTE}</Text>
        {sections.map((s) => (
          <View key={s.title}>
            <Text style={styles.title} accessibilityRole="header">
              {s.title}
            </Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  seg: { paddingHorizontal: 18, paddingBottom: 12 },
  pad: { paddingHorizontal: 18, paddingBottom: 28 },
  draft: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 14, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 22, color: Colors.light.text },
});
