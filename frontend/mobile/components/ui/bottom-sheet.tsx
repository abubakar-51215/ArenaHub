import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { keyboardNow, keyboardOverlap, onKeyboardChange } from '@/lib/keyboard';

/**
 * A bottom sheet that holds anything (the write-a-review sheet, the review menu, the report sheet): same look and motion
 * as the confirm sheet (dim and blur behind it, rises in 340 ms, closes in 200 ms; by a tap outside, a swipe down or the
 * Android back button). A sheet with a text box rises with the keyboard (rule: docs/MOBILE_QA_GATE.md "Keyboard"): its
 * bottom edge follows the part of the screen the keyboard covers.
 */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const OPEN_MS = 340;
const CLOSE_MS = 200;
const TRAVEL = 40;

export function BottomSheet({ visible, title, onClose, children, label }: { visible: boolean; title?: string; onClose: () => void; children: ReactNode; label?: string }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const root = useRef<View>(null);
  const lift = useRef(new RNAnimated.Value(0)).current;

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

  // follow the keyboard
  useEffect(() => {
    if (!mounted) return;
    const apply = () => {
      const kb = keyboardNow();
      const to = (px: number) => RNAnimated.timing(lift, { toValue: px, duration: Platform.OS === 'ios' ? kb.duration : 140, easing: RNEasing.out(RNEasing.cubic), useNativeDriver: false }).start();
      if (kb.top == null) return to(0);
      const top = kb.top;
      root.current?.measureInWindow((_x, y, _w, h) => to(keyboardOverlap(y + h, top)));
    };
    apply();
    return onKeyboardChange(apply);
  }, [mounted, lift]);

  const swipe = Gesture.Pan()
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 70 || e.velocityY > 800) runOnJS(onClose)();
      else drag.value = withTiming(0, { duration: 160 });
    });

  const dimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * TRAVEL + drag.value }],
  }));

  if (!mounted) return null;
  const base = Math.max(26, insets.bottom + 12);

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View ref={root} collapsable={false} style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
          {Platform.OS !== 'android' ? <BlurView intensity={12} tint="dark" style={StyleSheet.absoluteFill} /> : null}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <RNAnimated.View style={[styles.liftWrap, { bottom: RNAnimated.add(lift, base) }]} pointerEvents="box-none">
          <GestureDetector gesture={swipe}>
            <Animated.View style={[styles.sheet, sheetStyle]} accessibilityViewIsModal accessibilityLabel={label ?? title} role="dialog">
              <View style={styles.grab} />
              {title ? (
                <Text variant="archivo" style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
              ) : null}
              {children}
            </Animated.View>
          </GestureDetector>
        </RNAnimated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dim: { backgroundColor: 'rgba(15,26,21,0.45)' },
  liftWrap: { position: 'absolute', left: 14, right: 14 },
  sheet: { backgroundColor: Colors.light.card, borderRadius: 26, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 18 },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.light.line, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38, color: Colors.light.text },
});
