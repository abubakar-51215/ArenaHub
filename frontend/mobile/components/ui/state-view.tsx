import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { OFFLINE_TEXT, OFFLINE_TITLE, useNetwork } from '@/lib/network';

/**
 * The three whole-screen states every list screen has (same look as My bookings): "could not load" with the broken-ring
 * mark and Try again, and "nothing here yet" with a round icon and an optional button.
 */
export function ErrorState({ title, text = 'Check your connection and try again.', onRetry }: { title: string; text?: string; onRetry: () => void }) {
  const online = useNetwork((s) => s.online);
  if (!online) {
    // offline and nothing saved to show: one plain state for every screen
    title = OFFLINE_TITLE;
    text = OFFLINE_TEXT;
  }
  return (
    <View style={styles.state}>
      <View style={{ marginBottom: 14 }}>
        <BrandMark mode="offline" size={74} />
      </View>
      <Text variant="archivo" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.text}>{text}</Text>
      <View style={styles.button}>
        <Button title="Try again" onPress={onRetry} />
      </View>
    </View>
  );
}

/** The title and line of a whole-screen "could not load" state; offline it says "No connection." instead (one wording everywhere). */
export function ErrorCopy({ title, text = 'Check your connection and try again.', titleStyle, textStyle }: { title: string; text?: string; titleStyle: StyleProp<TextStyle>; textStyle: StyleProp<TextStyle> }) {
  const online = useNetwork((s) => s.online);
  return (
    <>
      <Text variant="archivo" style={titleStyle}>
        {online ? title : OFFLINE_TITLE}
      </Text>
      <Text style={textStyle}>{online ? text : OFFLINE_TEXT}</Text>
    </>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  buttonTitle,
  onButton,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  buttonTitle?: string;
  onButton?: () => void;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.circle}>{icon}</View>
      <Text variant="archivo" style={styles.title}>
        {title}
      </Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {buttonTitle && onButton ? (
        <View style={styles.button}>
          <Button title={buttonTitle} variant="lime" onPress={onButton} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 10 },
  circle: { width: 74, height: 74, borderRadius: 37, backgroundColor: Colors.light.limeWash, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text, textAlign: 'center' },
  text: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 20, textAlign: 'center' },
  button: { width: '100%' },
});
