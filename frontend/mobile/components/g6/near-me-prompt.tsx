import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { IconExtra } from '@/components/ui/icon-extra';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { karachiToday } from '@/lib/karachi';
import { promptDue, readLastNotNow, rememberNotNow } from '@/lib/nearme';
import { useLocationStore } from '@/store/location';

/**
 * The "Find arenas near you" pop-up (arena-hub-player-app-play.html, frame 01) and the rule for when it shows: when the app is
 * opened, unless location is already allowed; after "Not now" (or a refusal) not again on the same calendar day in Asia/Karachi,
 * but again on the next day the app is opened, until location is allowed. Only the date of the last "Not now" is stored on the
 * phone. While it is not shown the app stays on the saved city (or "All cities") and the detect button on Home still works.
 * When location is already allowed, it is used silently (no pop-up, no dialog).
 */
export function useNearMe() {
  const refreshPermission = useLocationStore((s) => s.refreshPermission);
  const detect = useLocationStore((s) => s.detect);
  const [visible, setVisible] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      const granted = await refreshPermission();
      if (cancelled) return;
      if (granted) {
        detect(); // already allowed: no dialog, no pop-up
        return;
      }
      const last = await readLastNotNow();
      if (!cancelled && promptDue({ granted: false, lastNotNow: last, today: karachiToday() })) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPermission, detect]);

  const notNow = () => {
    setVisible(false);
    void rememberNotNow();
  };
  const allow = async () => {
    setVisible(false);
    await detect();
    // a refusal counts as "Not now" for today
    if (useLocationStore.getState().status === 'denied') void rememberNotNow();
  };

  return { visible, notNow, allow };
}

export function NearMePrompt({ visible, onAllow, onNotNow }: { visible: boolean; onAllow: () => void; onNotNow: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onNotNow} label="Find arenas near you">
      <View style={styles.circle}>
        <IconExtra name="locate" size={26} color={Colors.light.limeDeep} />
      </View>
      <Text variant="archivo" style={styles.title} accessibilityRole="header">
        Find arenas near you
      </Text>
      <Text style={styles.text}>Allow your location to see how far each arena is and sort by distance. We only use it while you use the app.</Text>
      <View style={styles.buttons}>
        <Button title="Use my location" variant="lime" onPress={onAllow} />
        <Button title="Not now" variant="ghost" onPress={onNotNow} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  circle: { width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.light.limeWash, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: Colors.light.text, textAlign: 'center' },
  text: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  buttons: { gap: 8 },
});
