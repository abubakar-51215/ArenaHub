import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

// Small pieces the booking and payment frames share (arena-hub-player-app-booking-payment.html).

/** .eyebrow: a small uppercase label above a block (exempt from the 14px rule). */
export function Eyebrow({ children, top = 16 }: { children: ReactNode; top?: number }) {
  return (
    <Text style={[styles.eyebrow, { marginTop: top }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** .m-line: a label on the left, a value on the right. `bold` is the closing total line. */
export function Line({ label, value, tone, bold }: { label: string; value: ReactNode; tone?: 'lime'; bold?: boolean }) {
  const color = tone === 'lime' ? Colors.light.limeDeep : undefined;
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, bold && styles.lineBold, color ? { color } : null]}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.lineBold, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** .m-note: the pale lime note (cancellation rules, bank instructions). */
export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** .m-ico: the rounded 32px icon tile. */
export function IconTile({ children, tone }: { children: ReactNode; tone?: 'lime' | 'red' | 'amber' }) {
  const bg = tone === 'lime' ? Colors.light.limeWash : tone === 'red' ? Colors.light.redWash : tone === 'amber' ? Colors.light.amberWash : Colors.light.lineSoft;
  return <View style={[styles.tile, { backgroundColor: bg }]}>{children}</View>;
}

const stroke = { fill: 'none', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function BankIcon({ color = Colors.light.text2, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" stroke={color} {...stroke} />
    </Svg>
  );
}

export function PhoneIcon({ color = Colors.light.text2, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={7} y={3} width={10} height={18} rx={2.5} stroke={color} {...stroke} />
      <Path d="M11 18h2" stroke={color} {...stroke} />
    </Svg>
  );
}

export function CardIcon({ color = Colors.light.text2, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2.5} y={6} width={19} height={13} rx={2.5} stroke={color} {...stroke} />
      <Path d="M2.5 10.5h19" stroke={color} {...stroke} />
    </Svg>
  );
}

export function UploadIcon({ color = Colors.light.limeDeep, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke={color} {...stroke} />
    </Svg>
  );
}

export function ClockIcon({ color = Colors.light.amber, size = 34 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} strokeWidth={2.2} />
      <Path d="M12 7v5l3 2" stroke={color} {...stroke} strokeWidth={2.2} />
    </Svg>
  );
}

export function CrossIcon({ color = Colors.light.red, size = 34 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6 6 18" stroke={color} {...stroke} strokeWidth={2.4} />
    </Svg>
  );
}

export function LockIcon({ color = Colors.light.limeDeep, size = 10 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={10} width={16} height={10} rx={2.5} stroke={color} {...stroke} />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={color} {...stroke} />
    </Svg>
  );
}

export function CalendarMark({ color = Colors.light.text2, size = 32 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={16} rx={2.5} stroke={color} {...stroke} />
      <Path d="M8 3v4M16 3v4M3 10h18" stroke={color} {...stroke} />
    </Svg>
  );
}

/** A small status pill with a dot, text at 14px (the shared Badge is 11.5px). */
export type PillTone = 'wait' | 'ok' | 'off' | 'idle';
const PILL: Record<PillTone, { bg: string; fg: string }> = {
  ok: { bg: Colors.light.limeWash, fg: Colors.light.limeText },
  wait: { bg: Colors.light.amberWash, fg: Colors.light.amberText },
  off: { bg: Colors.light.redWash, fg: Colors.light.redText },
  idle: { bg: Colors.light.lineSoft, fg: Colors.light.muted },
};
export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const { bg, fg } = PILL[tone];
  return (
    <View style={[styles.secure, { backgroundColor: bg }]}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: fg }} />
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** The green "Secure" badge with a lock, top right of Payment. */
export function SecureBadge() {
  return (
    <View style={styles.secure}>
      <LockIcon />
      <Text style={styles.secureText}>Secure</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  secure: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2.5, paddingHorizontal: 8, borderRadius: 20, backgroundColor: Colors.light.limeWash },
  secureText: { fontSize: 14, fontWeight: '600', color: Colors.light.limeText },
  pillText: { fontSize: 14, fontWeight: '600' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginBottom: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 5 },
  lineLabel: { fontSize: 14, color: Colors.light.muted, flexShrink: 1 },
  lineValue: { fontSize: 14, fontWeight: '600', color: Colors.light.text, flexShrink: 1, textAlign: 'right' },
  lineBold: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  note: { padding: 12, borderRadius: 11, backgroundColor: Colors.light.limeWash, borderWidth: 1, borderColor: Colors.light.limeDeep },
  noteText: { fontSize: 14, lineHeight: 20, color: Colors.light.noteText },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
