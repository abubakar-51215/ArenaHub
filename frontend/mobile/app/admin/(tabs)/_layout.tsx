import { PlatformPressable } from '@react-navigation/elements';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AIcon, type AdminIconName } from '@/components/admin/kit';
import { CountBadge } from '@/components/ui/count-badge';
import { Text } from '@/components/ui/text';
import { BodyLetterSpacing, Colors, Font } from '@/constants/theme';
import { useOverview } from '@/hooks/useAdmin';

// The admin tab bar: Overview, Approvals, Complaints, More (frames of arena-hub-admin-app.html). Same bar as the player's
// (61 px, 12 px labels), with a number on Approvals (arenas waiting) and Complaints (open complaints), "9+" above nine.
const BAR_HEIGHT = 61;

function makeButton(icon: AdminIconName, label: string, count: () => number) {
  return function AdminTabButton(props: BottomTabBarButtonProps) {
    const { style, ...rest } = props;
    const insets = useSafeAreaInsets();
    const focused = props['aria-selected'] === true;
    const color = focused ? Colors.light.limeDeep : Colors.light.tabIconDefault;
    const n = count();
    return (
      <PlatformPressable
        {...rest}
        accessibilityLabel={n > 0 ? `${label}, ${n} waiting` : label}
        style={[style, styles.button, { paddingBottom: Math.max(16, insets.bottom) }]}
        onPressIn={(ev) => {
          if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          props.onPressIn?.(ev);
        }}>
        <View style={styles.content}>
          <View style={styles.iconBox}>
            <AIcon name={icon} size={20} color={color} />
            <CountBadge count={n} />
          </View>
          <Text style={[styles.label, { color: focused ? Colors.light.text : Colors.light.tabIconDefault }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </PlatformPressable>
    );
  };
}

function useCounts() {
  const q = useOverview();
  return { approvals: q.data?.pending_arenas ?? 0, complaints: q.data?.open_complaints ?? 0 };
}

// The button components read the counts through a hook inside, so they update when the Overview numbers do.
function Approvals(props: BottomTabBarButtonProps) {
  const { approvals } = useCounts();
  return makeButton('approvals', 'Approvals', () => approvals)(props);
}
function Complaints(props: BottomTabBarButtonProps) {
  const { complaints } = useCounts();
  return makeButton('complaints', 'Complaints', () => complaints)(props);
}

export default function AdminTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: BAR_HEIGHT + Math.max(0, insets.bottom - 16),
          paddingHorizontal: 6,
          backgroundColor: Colors.light.card,
          borderTopWidth: 1,
          borderTopColor: Colors.light.border,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarButton: makeButton('overview', 'Overview', () => 0) }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarButton: (p) => <Approvals {...p} /> }} />
      <Tabs.Screen name="complaints" options={{ title: 'Complaints', tabBarButton: (p) => <Complaints {...p} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarButton: makeButton('more', 'More', () => 0) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  button: { flex: 1, paddingTop: 7 },
  content: { flex: 1, alignItems: 'center', gap: 3 },
  // 20 (icon) + 3 (gap) + 14 (label line) fit the 37 px left inside the 61 px bar (1 px border, 7 px top, 16 px bottom padding)
  iconBox: { width: 44, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Font.bodySemi, fontSize: 12, lineHeight: 14, letterSpacing: BodyLetterSpacing },
});
