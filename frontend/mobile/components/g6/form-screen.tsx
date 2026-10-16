import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardScroll } from '@/components/ui/keyboard-scroll';
import { ScreenHead } from '@/components/ui/screen-head';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Colors } from '@/constants/theme';

/** A screen with a head, a form that scrolls above the keyboard, and an optional sticky button bar (the account frames). */
export function FormScreen({ title, children, footer, onBack, right }: { title: string; children: ReactNode; footer?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title={title} onBack={onBack} right={right} />
      <KeyboardScroll contentContainerStyle={styles.pad} footer={footer ? <StickyBar>{footer}</StickyBar> : undefined}>
        {children}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, gap: 14 },
});
