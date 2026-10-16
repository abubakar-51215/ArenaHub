import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Light status-bar icons for a screen whose top is dark (the Home hero, an arena photo). The app default is dark icons on
 * the pale page; without this, the clock and battery vanish on the dark top. Only the screen in front sets it, so it
 * goes back to dark when the person leaves; `light` turns it back to dark once the dark top has scrolled away
 * (rule: docs/MOBILE_QA_GATE.md "Status bar").
 */
export function LightStatusBar({ light = true }: { light?: boolean }) {
  const focused = useIsFocused();
  return focused ? <StatusBar style={light ? 'light' : 'dark'} /> : null;
}

/** For a ScrollView whose dark top is `height` px tall: `onScroll` + whether the dark top is still behind the status bar. */
export function useDarkTop(height: number) {
  const [onTop, setOnTop] = useState(true);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const v = e.nativeEvent.contentOffset.y < height;
      setOnTop((cur) => (cur === v ? cur : v));
    },
    [height],
  );
  return { onTop, onScroll, scrollEventThrottle: 32 };
}
