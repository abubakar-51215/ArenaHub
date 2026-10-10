import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { successHaptic } from '@/lib/haptics';

// Frame 11 of arena-hub-player-app-auth-2.html: a dark pill with a lime tick
// dot that drops from the top (400 ms ease-out), stays about 3 seconds and
// slides away (250 ms). One ToastHost sits at the root; any screen calls
// `showToast("New code sent to a***@arenahub.pk")`. With "reduce motion" it
// just appears and disappears. Screen readers hear it (polite live region).
interface ToastState {
  message: string | null;
  id: number;
  show: (message: string) => void;
  clear: () => void;
}

const useToastStore = create<ToastState>()((set) => ({
  message: null,
  id: 0,
  show: (message) => set((s) => ({ message, id: s.id + 1 })),
  clear: () => set({ message: null }),
}));

export const showToast = (message: string) => useToastStore.getState().show(message);

// The auth screens' back button sits at 20 to 50 below the safe area; the
// toast starts below it so it never covers the back button.
const TOP_BELOW_BACK = 64;
const STAY_MS = 3000;
const IN_MS = 400;
const OUT_MS = 250;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const message = useToastStore((s) => s.message);
  const id = useToastStore((s) => s.id);
  const [shown, setShown] = useState<string | null>(null);
  const y = useSharedValue(-24);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    setShown(message);
    successHaptic();
    if (reduceMotion) {
      y.value = 0;
      opacity.value = 1;
    } else {
      y.value = -24;
      opacity.value = 0;
      y.value = withTiming(0, { duration: IN_MS, easing: EASE });
      opacity.value = withTiming(1, { duration: IN_MS, easing: EASE });
    }
    const leave = setTimeout(() => {
      if (reduceMotion) {
        opacity.value = 0;
      } else {
        y.value = withDelay(0, withTiming(-24, { duration: OUT_MS, easing: EASE }));
        opacity.value = withTiming(0, { duration: OUT_MS, easing: EASE });
      }
    }, IN_MS + STAY_MS);
    const clear = setTimeout(() => {
      setShown(null);
      useToastStore.getState().clear();
    }, IN_MS + STAY_MS + OUT_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(clear);
    };
  }, [id, message, reduceMotion, y, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  if (!shown) return null;

  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + TOP_BELOW_BACK }]}>
      <Animated.View
        style={[styles.toast, style]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={shown}>
        <View style={styles.dot}>
          <Icon name="tick" size={11} color={Colors.light.ink} strokeWidth={3} />
        </View>
        <Text style={styles.text}>{shown}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 20, right: 20, zIndex: 1000, elevation: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.light.ink,
    borderRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.light.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 14, color: '#FFFFFF' },
});
