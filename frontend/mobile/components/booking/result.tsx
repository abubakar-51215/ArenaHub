import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/**
 * The layout the result screens of arena-hub-player-app-booking-payment.html
 * share (Awaiting approval, Payment failed, Slot lost, Booking confirmed): a
 * round mark, an Archivo title, a short text, optional detail below and the
 * buttons stuck to the bottom.
 */
export function ResultScreen({
  mark,
  title,
  text,
  top = 44,
  children,
  buttons,
}: {
  mark: ReactNode;
  title: string;
  text: string;
  top?: number;
  children?: ReactNode;
  buttons: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.body, { paddingTop: top }]}>
        <View style={styles.markWrap}>{mark}</View>
        <Text variant="archivo" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.text}>{text}</Text>
        {children}
      </ScrollView>
      <StickyBar>{buttons}</StickyBar>
    </SafeAreaView>
  );
}

/** The 74px coloured circle that holds the mark. */
export function Circle({ bg, children }: { bg: string; children: ReactNode }) {
  return <View style={[styles.circle, { backgroundColor: bg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  body: { paddingHorizontal: 18, alignItems: 'stretch', paddingBottom: 20 },
  markWrap: { alignItems: 'center', marginBottom: 18 },
  circle: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text, textAlign: 'center' },
  text: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, textAlign: 'center', marginTop: 6, marginBottom: 20 },
});
