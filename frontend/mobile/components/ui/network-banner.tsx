import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { useNetwork } from '@/lib/network';

/**
 * The offline and back-online banner (arena-hub-player-app-states.html, frames 01 and 04). It wraps the app: when it shows, the
 * screens are pushed down by exactly its height and the banner fills the band that opens (it also covers the status-bar strip,
 * whose icons turn light on the dark bar), and when it goes the screens slide back up, so nothing jumps. It never covers a
 * screen's own header. With "reduce motion" the change is instant.
 *  - offline: dark, "You are offline. Showing what we saved earlier." (or just "You are offline." when nothing was saved)
 *  - back online: lime, "Back online. Updating…", for about two seconds.
 */
const BAR = 44; // the height of the band below the status bar
const MS = 220;

export function NetworkShell({ children }: { children: ReactNode }) {
  const phase = useNetwork((s) => s.phase);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const p = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<'offline' | 'back'>('offline');
  const [saved, setSaved] = useState(false);
  const visible = phase !== 'online';

  useEffect(() => {
    if (phase !== 'online') {
      setShown(phase === 'back' ? 'back' : 'offline');
      setSaved(qc.getQueryCache().getAll().some((q) => q.state.data !== undefined));
    }
    const to = visible ? 1 : 0;
    if (reduce) p.setValue(to);
    else Animated.timing(p, { toValue: to, duration: MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [phase, visible, reduce, p, qc]);

  const top = insets.top;
  const height = p.interpolate({ inputRange: [0, 1], outputRange: [0, top + BAR] });
  const push = p.interpolate({ inputRange: [0, 1], outputRange: [0, BAR] });
  const lime = shown === 'back';

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.fill, { paddingTop: push }]}>{children}</Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.bar, { height, backgroundColor: lime ? Colors.light.lime : Colors.light.ink }]}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}>
        <View style={[styles.row, { height: BAR }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {lime ? <Icon name="tick" size={16} color={Colors.light.ink} strokeWidth={2.6} /> : <OfflineIcon />}
          <Text style={[styles.text, { color: lime ? Colors.light.ink : '#FFFFFF' }]} numberOfLines={2}>
            {lime ? 'Back online. Updating…' : saved ? 'You are offline. Showing what we saved earlier.' : 'You are offline.'}
          </Text>
        </View>
      </Animated.View>
      {visible ? <StatusBar style={lime ? 'dark' : 'light'} /> : null}
    </View>
  );
}

function OfflineIcon() {
  // a small Wi-Fi mark with a slash
  return (
    <View style={styles.icon}>
      <View style={styles.arc1} />
      <View style={styles.arc2} />
      <View style={styles.dot} />
      <View style={styles.slash} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  fill: { flex: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  text: { flex: 1, fontSize: 14, lineHeight: 19 },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  arc1: { position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF', borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  arc2: { position: 'absolute', top: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#FFFFFF', borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  dot: { position: 'absolute', bottom: 3, width: 3, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  slash: { position: 'absolute', width: 22, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF', transform: [{ rotate: '-45deg' }] },
});
