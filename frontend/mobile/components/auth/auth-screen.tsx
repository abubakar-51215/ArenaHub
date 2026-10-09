import { router } from 'expo-router';
import { useRef } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, type ScrollView } from 'react-native';
import type { ReactNode } from 'react';

import { BackButton } from '@/components/ui/back-button';
import { FieldScrollContext } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

// The frame every auth screen shares (arena-hub-player-app-auth.html): paper
// page, 18px sides, back button, .m-title-xl title (Archivo 25 / 700, 1.08,
// -0.03em) and the 12.5px muted line under it. The back button is drawn 30px;
// hitSlop makes its touch area 44.
interface AuthScreenProps {
  title: string;
  subtitle?: ReactNode;
  /** Gap between the subtitle and the content: 22 under the code boxes, 18 above fields. */
  subtitleGap?: number;
  onBack?: () => void;
  children: ReactNode;
}

export function AuthScreen({ title, subtitle, subtitleGap = 18, onBack, children }: AuthScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}>
        <View style={styles.head}>
          <BackButton
            hitSlop={7}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login')))}
          />
        </View>
        <Text variant="archivo" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { marginBottom: subtitleGap }]}>{subtitle}</Text> : null}
        <FieldScrollContext.Provider value={{ scrollRef, contentRef }}>
          <View ref={contentRef} collapsable={false}>
            {children}
          </View>
        </FieldScrollContext.Provider>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  content: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 24 },
  head: { flexDirection: 'row', paddingBottom: 14 },
  title: {
    fontSize: 25,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.75,
    color: Colors.light.text,
    marginBottom: 3,
  },
  subtitle: { fontSize: 12.5, lineHeight: 18.75, color: Colors.light.muted },
});
