import { useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { OFFLINE_TEXT, OFFLINE_TITLE, useNetwork } from '@/lib/network';

/**
 * The small pieces every admin screen is made of (frames: design/prototypes/arena-hub-admin-app.html). Text is 14 px or more
 * (the frames' 12.5 px rows are built at 14), taps are 44 px or more.
 */

// ---- icons (the frames' aIC set) ----------------------------------------------------------------

export type AdminIconName = 'overview' | 'approvals' | 'complaints' | 'more' | 'arena' | 'user' | 'pay' | 'bell' | 'search' | 'check' | 'wifi' | 'logout' | 'chev';

export function AIcon({ name, size = 22, color = Colors.light.text }: { name: AdminIconName; size?: number; color?: string }) {
  const p = { stroke: color, fill: 'none', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'overview' ? (
        <>
          <Rect x={3} y={3} width={7} height={9} rx={2} {...p} />
          <Rect x={14} y={3} width={7} height={5} rx={2} {...p} />
          <Rect x={14} y={12} width={7} height={9} rx={2} {...p} />
          <Rect x={3} y={16} width={7} height={5} rx={2} {...p} />
        </>
      ) : name === 'approvals' ? (
        <>
          <Path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6Z" {...p} />
          <Path d="m9 12 2 2 4-4" {...p} />
        </>
      ) : name === 'complaints' ? (
        <Path d="M4 5h16v11H9l-5 4Z" {...p} />
      ) : name === 'more' ? (
        <>
          <Circle cx={5} cy={12} r={1.2} {...p} />
          <Circle cx={12} cy={12} r={1.2} {...p} />
          <Circle cx={19} cy={12} r={1.2} {...p} />
        </>
      ) : name === 'arena' ? (
        <Path d="M3 10 12 4l9 6M5 10v9h14v-9M9 19v-5h6v5" {...p} />
      ) : name === 'user' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.6} {...p} />
          <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...p} />
        </>
      ) : name === 'pay' ? (
        <>
          <Rect x={2.5} y={6} width={19} height={13} rx={2.5} {...p} />
          <Path d="M2.5 10.5h19" {...p} />
        </>
      ) : name === 'bell' ? (
        <>
          <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" {...p} />
          <Path d="M13.7 21a2 2 0 0 1-3.4 0" {...p} />
        </>
      ) : name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={7} {...p} />
          <Path d="m20 20-3.5-3.5" {...p} />
        </>
      ) : name === 'check' ? (
        <Path d="M4 12.5 9.5 18 20 7" {...p} />
      ) : name === 'wifi' ? (
        <>
          <Path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0" {...p} />
          <Circle cx={12} cy={19} r={1} {...p} />
        </>
      ) : name === 'logout' ? (
        <Path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" {...p} />
      ) : (
        <Path d="m9 6 6 6-6 6" {...p} />
      )}
    </Svg>
  );
}

// ---- layout bits ----------------------------------------------------------------------------------

export type PillTone = 'ok' | 'wait' | 'off' | 'idle';
const PILL: Record<PillTone, { bg: string; fg: string }> = {
  ok: { bg: Colors.light.limeWash, fg: Colors.light.limeText },
  wait: { bg: Colors.light.amberWash, fg: Colors.light.amberText },
  off: { bg: Colors.light.redWash, fg: Colors.light.redText },
  idle: { bg: Colors.light.lineSoft, fg: Colors.light.muted },
};

/** The status pill of the admin frames (14 px). */
export function Pill({ label, tone }: { label: string; tone: PillTone }) {
  const c = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: c.fg }]} />
      <Text style={[styles.pillText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** One label and value line of a detail card (14 px; the value wraps and sits to the right). */
export function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={styles.kvV}>{v}</Text>
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <Text variant="archivo" style={styles.eyebrow}>
      {children}
    </Text>
  );
}

/** The big title of a tab's first screen, with something on the right (the bell). */
export function BigTitle({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bigTitle, { paddingTop: insets.top + 8 }]}>
      <Text variant="archivo" style={styles.bigTitleText} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

/** A tappable card in a list: a title, a line under it and something on the right (a pill, an amount). */
export function ListCard({ title, sub, right, extra, onPress, label }: { title: string; sub?: string; right?: ReactNode; extra?: ReactNode; onPress?: () => void; label?: string }) {
  const inner = (
    <>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {sub ? (
            <Text style={styles.cardSub} numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {extra}
    </>
  );
  if (!onPress) return <View style={[styles.card, styles.listCard]}>{inner}</View>;
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      style={({ pressed }) => [styles.card, styles.listCard, pressed && { opacity: 0.85 }]}>
      {inner}
    </Pressable>
  );
}

/** A row inside a grouped card (a number, a menu entry): an icon tile, a title, a line and a chevron. */
export function MenuRow({ icon, tone = 'idle', title, sub, last, onPress, right }: { icon: AdminIconName; tone?: PillTone; title: string; sub?: string; last?: boolean; onPress: () => void; right?: ReactNode }) {
  const c = PILL[tone];
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.menuRow, !last && styles.menuLine, pressed && { opacity: 0.8 }]}>
      <View style={[styles.tile, { backgroundColor: tone === 'idle' ? Colors.light.lineSoft : c.bg }]}>
        <AIcon name={icon} size={20} color={tone === 'idle' ? Colors.light.text2 : c.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
      </View>
      {right ?? <AIcon name="chev" size={18} color={Colors.light.muted} />}
    </Pressable>
  );
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={styles.search} accessible={false}>
      <AIcon name="search" size={18} color={Colors.light.muted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.light.muted}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
      />
    </Pressable>
  );
}

// ---- states ---------------------------------------------------------------------------------------------

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, styles.skRow]}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={14} width="70%" radius={7} />
            <Skeleton height={14} width="45%" radius={7} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Under a list that has more rows on the server: "Showing 50 of 120" and Show more (see hooks/useAdminPages). */
export function ShowMore({ shown, total, hasMore, loading, onMore }: { shown: number; total: number; hasMore: boolean; loading: boolean; onMore: () => void }) {
  if (!hasMore) return null;
  return (
    <View style={styles.more}>
      <Text style={styles.moreNote}>{`Showing ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`}</Text>
      <Button title="Show more" variant="ghost" loading={loading} onPress={onMore} />
    </View>
  );
}

/** "We could not load this." (or "No connection." offline) with Try again. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const online = useNetwork((s) => s.online);
  return (
    <View style={styles.state}>
      <View style={[styles.circle, { backgroundColor: Colors.light.redWash }]}>
        <AIcon name="wifi" size={32} color={Colors.light.destructive} />
      </View>
      <Text variant="archivo" style={styles.stateTitle}>
        {online ? 'We could not load this.' : OFFLINE_TITLE}
      </Text>
      <Text style={styles.stateText}>{online ? 'Check your connection and try again.' : OFFLINE_TEXT}</Text>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

/** Nothing to show: a lime tick ("All clear") or a plain search mark ("No arenas found"). */
export function Nothing({ title, text, search }: { title: string; text: string; search?: boolean }) {
  return (
    <View style={styles.state}>
      <View style={[styles.circle, { backgroundColor: search ? Colors.light.lineSoft : Colors.light.limeWash }]}>
        <AIcon name={search ? 'search' : 'check'} size={32} color={search ? Colors.light.text2 : Colors.light.limeDeep} />
      </View>
      <Text variant="archivo" style={styles.stateTitle}>
        {title}
      </Text>
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

// ---- the reason sheet -------------------------------------------------------------------------------------

/**
 * A red confirm sheet with a reason box (reject an arena, suspend an arena, suspend a user): the red button stays off until
 * the reason has text, the counter says "n / 500", the sheet follows the keyboard (BottomSheet), "Stay" closes it.
 */
export function ReasonSheet({
  visible,
  title,
  message,
  placeholder,
  confirmLabel,
  offlineLabel,
  loading,
  max = 500,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  placeholder: string;
  confirmLabel: string;
  offlineLabel: string;
  loading?: boolean;
  max?: number;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;
  return (
    <BottomSheet
      visible={visible}
      title={title}
      label={title}
      onClose={() => {
        setText('');
        onClose();
      }}>
      <Text style={styles.sheetText}>{message}</Text>
      <TextField kind="multiline" label="Reason" placeholder={placeholder} value={text} onChangeText={(t) => setText(t.slice(0, max))} maxLength={max} accessibilityLabel="Reason" />
      <Text style={styles.counter}>
        {text.length} / {max}
      </Text>
      <View style={{ gap: 8, marginTop: 6 }}>
        <Button title={confirmLabel} variant="danger" disabled={!ready} loading={loading} offlineLabel={offlineLabel} onPress={() => onConfirm(text.trim())} />
        <Button
          title="Stay"
          variant="ghost"
          onPress={() => {
            setText('');
            onClose();
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  more: { alignItems: 'center', gap: 6, paddingTop: 12 },
  moreNote: { fontSize: 14, color: Colors.light.muted },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20, alignSelf: 'flex-start', flexShrink: 0 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 18, padding: 12 },
  listCard: { paddingHorizontal: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, lineHeight: 21 },
  cardSub: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 2 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 6 },
  kvK: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, flexShrink: 0 },
  kvV: { fontSize: 14, lineHeight: 20, color: Colors.light.text, fontWeight: '600', textAlign: 'right', flex: 1 },
  eyebrow: { fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: Colors.light.muted, fontWeight: '600', marginBottom: 8 },
  bigTitle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10, gap: 10 },
  bigTitleText: { flex: 1, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  menuLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line },
  searchInput: { flex: 1, fontSize: 15, minHeight: 44, color: Colors.light.text, paddingVertical: 0 },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  state: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 10, gap: 0 },
  circle: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  stateTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text, textAlign: 'center' },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 20, textAlign: 'center' },
  sheetText: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 6, marginBottom: 12 },
  counter: { fontSize: 14, color: Colors.light.muted, textAlign: 'right', marginTop: 4, marginBottom: 6 },
});
