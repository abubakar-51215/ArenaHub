import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { formatRs } from '@/lib/money';

// The two-thumb price slider of the Filters frame: a 4px track in line-soft,
// the chosen part in lime-deep, two round thumbs (16px drawn, 44px to touch).
// Values move in `step`s. Each thumb is an "adjustable" for screen readers
// (swipe up/down changes it by one step).
const THUMB = 44;

export function RangeSlider({
  min,
  max,
  step,
  low,
  high,
  onChange,
  topLabel,
}: {
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  /** e.g. "5,000+" for the top of the range */
  topLabel?: (value: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const track = Math.max(1, width - THUMB);
  const toX = (v: number) => ((v - min) / (max - min)) * track;

  const lowX = useSharedValue(toX(low));
  const highX = useSharedValue(toX(high));
  const lowStart = useSharedValue(0);
  const highStart = useSharedValue(0);

  useEffect(() => {
    lowX.value = toX(low);
    highX.value = toX(high);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [low, high, width]);

  const commit = (l: number, h: number) => onChange(Math.min(l, h - step), Math.max(h, l + step));

  const lowGesture = Gesture.Pan()
    .onBegin(() => {
      lowStart.value = lowX.value;
    })
    .onUpdate((e) => {
      const x = Math.min(Math.max(lowStart.value + e.translationX, 0), highX.value - (step / (max - min)) * track);
      lowX.value = x;
      runOnJS(commit)(Math.round((x / track) * ((max - min) / step)) * step + min, high);
    });
  const highGesture = Gesture.Pan()
    .onBegin(() => {
      highStart.value = highX.value;
    })
    .onUpdate((e) => {
      const x = Math.max(Math.min(highStart.value + e.translationX, track), lowX.value + (step / (max - min)) * track);
      highX.value = x;
      runOnJS(commit)(low, Math.round((x / track) * ((max - min) / step)) * step + min);
    });

  const fill = useAnimatedStyle(() => ({ left: lowX.value + THUMB / 2, width: Math.max(0, highX.value - lowX.value) }));
  const lowThumb = useAnimatedStyle(() => ({ transform: [{ translateX: lowX.value }] }));
  const highThumb = useAnimatedStyle(() => ({ transform: [{ translateX: highX.value }] }));

  const label = (v: number) => (v >= max && topLabel ? topLabel(v) : formatRs(v));
  const adjust = (which: 'low' | 'high', dir: 1 | -1) =>
    which === 'low' ? commit(Math.max(min, Math.min(low + dir * step, high - step)), high) : commit(low, Math.min(max, Math.max(high + dir * step, low + step)));

  return (
    <View>
      <View style={styles.ends}>
        <Text style={styles.endText}>{formatRs(min)}</Text>
        <Text style={styles.endText}>{topLabel ? topLabel(max) : formatRs(max)}</Text>
      </View>
      <View style={styles.area} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fill]} />
        <GestureDetector gesture={lowGesture}>
          <Animated.View
            style={[styles.thumbHit, lowThumb]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Lowest price"
            accessibilityValue={{ text: label(low) }}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={low}
            aria-valuetext={label(low)}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => adjust('low', e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
            <View style={styles.thumb} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={highGesture}>
          <Animated.View
            style={[styles.thumbHit, highThumb]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Highest price"
            accessibilityValue={{ text: label(high) }}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={high}
            aria-valuetext={label(high)}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => adjust('high', e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
            <View style={styles.thumb} />
          </Animated.View>
        </GestureDetector>
      </View>
      <Text style={styles.chosen}>
        {formatRs(low)} – {label(high)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  endText: { fontSize: 14, color: Colors.light.muted },
  area: { height: THUMB, justifyContent: 'center' },
  track: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 4, borderRadius: 3, backgroundColor: Colors.light.lineSoft },
  fill: { position: 'absolute', height: 4, borderRadius: 3, backgroundColor: Colors.light.limeDeep },
  thumbHit: { position: 'absolute', left: 0, width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.light.card, borderColor: Colors.light.limeDeep, borderWidth: 2 },
  chosen: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: Colors.light.text },
});
