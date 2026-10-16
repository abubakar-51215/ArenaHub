import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/back-button';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/** .m-head of the frames: an optional back button, the Archivo title and something on the right. */
export function ScreenHead({
  title,
  back = true,
  right,
  onBack,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
      {back ? <BackButton onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')))} /> : null}
      <Text variant="archivo" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.24, color: Colors.light.text },
  right: { marginLeft: 'auto' },
});
