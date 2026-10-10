import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

// The prototype's .sk block: line-soft with a lighter band sweeping across
// every 1.4 s. Held still (a plain soft block) under "reduce motion".
export function Skeleton({
  width = '100%',
  height,
  radius = 8,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(x);
      return;
    }
    x.value = -1;
    x.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [reduceMotion, x]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }] }));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[styles.block, { width, height, borderRadius: radius }]}>
      {!reduceMotion && w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, band]}>
          <LinearGradient
            colors={[Colors.light.lineSoft, Colors.light.line, Colors.light.lineSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: Colors.light.lineSoft, overflow: 'hidden' },
});
