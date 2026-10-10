import { useEffect, useState } from 'react';
import { Platform, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { BlurView } from 'expo-blur';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

// Frame 10 of arena-hub-player-app-auth-2.html: the back goes dim, the sheet
// rises in 340 ms (ease-out) and closes in 200 ms. The destructive action is
// the red button and always sits next to a plain "Stay" / "Cancel". It closes
// by that button, by a tap outside, by a swipe down, or by the Android back
// button. The back is dimmed and blurred (expo-blur). The dim alone is the safe
// fallback: Android's blur is experimental, so there it is not used, and
// "reduce transparency" users see the dim only.
interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** True: the confirm button is red. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const OPEN_MS = 340;
const CLOSE_MS = 200;
const TRAVEL = 40;

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Stay',
  destructive = true,
  loading,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0); // 0 = closed, 1 = open
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      progress.value = reduceMotion ? 1 : withTiming(1, { duration: OPEN_MS, easing: EASE });
    } else if (mounted) {
      progress.value = reduceMotion
        ? 0
        : withTiming(0, { duration: CLOSE_MS, easing: EASE }, (done) => {
            if (done) runOnJS(setMounted)(false);
          });
      if (reduceMotion) setMounted(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const swipe = Gesture.Pan()
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 70 || e.velocityY > 800) runOnJS(onCancel)();
      else drag.value = withTiming(0, { duration: 160 });
    });

  const dimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * TRAVEL + drag.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
          {Platform.OS !== 'android' ? <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          />
        </Animated.View>
        <GestureDetector gesture={swipe}>
          <Animated.View
            style={[styles.sheet, { bottom: Math.max(26, insets.bottom + 12) }, sheetStyle]}
            accessibilityViewIsModal
            accessibilityLabel={title}
            role="dialog">
            <View style={styles.grab} />
            <Text variant="archivo" style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.message}>{message}</Text>
            <View style={styles.row}>
              <View style={styles.cell}>
                <Button title={cancelLabel} variant="ghost" hitSlop={2} onPress={onCancel} />
              </View>
              <View style={styles.cell}>
                <Button
                  title={confirmLabel}
                  variant={destructive ? 'danger' : 'ink'}
                  hitSlop={2}
                  loading={loading}
                  onPress={onConfirm}
                />
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { backgroundColor: 'rgba(15,26,21,0.45)' },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: Colors.light.card,
    borderRadius: 26,
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.light.line, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38, color: Colors.light.text },
  message: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cell: { flex: 1 },
});
