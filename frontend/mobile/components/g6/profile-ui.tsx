import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { TapBox } from '@/components/ui/tap-box';

/** The small blocks of the account frames (arena-hub-player-app-account.html), shared by Profile, Settings and the rest. */

/** A rounded tile with an icon (the left of a menu row). */
export function IconTile({ children, tone = 'idle' }: { children: ReactNode; tone?: 'idle' | 'ok' | 'wait' | 'off' }) {
  const bg = { idle: Colors.light.lineSoft, ok: Colors.light.limeWash, wait: Colors.light.amberWash, off: Colors.light.redWash }[tone];
  return <View style={[styles.tile, { backgroundColor: bg }]}>{children}</View>;
}

/** One row of a menu card: icon tile, title, a grey line under it, and a chevron. At least 44 high. */
export function MenuRow({
  icon,
  title,
  sub,
  onPress,
  last,
  tone,
  danger,
  right,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  onPress?: () => void;
  last?: boolean;
  tone?: 'idle' | 'ok' | 'wait' | 'off';
  danger?: boolean;
  right?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={[styles.row, !last && styles.rowLine]}>
      <IconTile tone={tone}>{icon}</IconTile>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && { color: Colors.light.destructive }]}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right ?? <Icon name="chev" size={15} color={Colors.light.muted} />}
    </Pressable>
  );
}

/** A white rounded card that holds rows. */
export function MenuCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** The small capital label above a group (NOTIFICATIONS, ACCOUNT). */
export function GroupLabel({ children }: { children: string }) {
  return (
    <Text style={styles.label} accessibilityRole="header">
      {children}
    </Text>
  );
}

const W = 52;
const H = 32;
const KNOB = 26;

/**
 * An on/off switch, 52 x 32 (the frames): the lime track and the knob slide in 150 ms (instant with "reduce motion").
 * The whole box is the touch target (at least 44 high).
 */
export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = reduce ? (value ? 1 : 0) : withTiming(value ? 1 : 0, { duration: 150, easing: Easing.out(Easing.cubic) });
  }, [value, reduce, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (W - KNOB - 6) }] }));
  const track = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * x.value }));
  return (
    <TapBox
      onPress={() => {
        if (disabled) return;
        tapHaptic();
        onChange(!value);
      }}
      slop={6}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      inner={[styles.switchBox, disabled && { opacity: 0.5 }]}>
      <Animated.View style={[styles.switchTrack, { backgroundColor: value ? Colors.light.limeDeep : Colors.light.line }, track]} />
      <Animated.View style={[styles.knob, knob]} />
    </TapBox>
  );
}

const styles = StyleSheet.create({
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, paddingHorizontal: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  rowSub: { fontSize: 14, color: Colors.light.muted, marginTop: 1 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 18, marginBottom: 8 },
  switchBox: { width: W, height: H, justifyContent: 'center' },
  switchTrack: { ...StyleSheet.absoluteFillObject, borderRadius: H / 2 },
  knob: { position: 'absolute', left: 3, top: 3, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FFFFFF' },
});
