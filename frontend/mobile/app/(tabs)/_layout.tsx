import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Redirect, Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodyLetterSpacing, Colors, Font } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/store/auth';

const BAR_HEIGHT = 60.25;
const ICON_SIZE = 19;

// design/mobile-spec.md "Tab bar". @react-navigation/bottom-tabs' own web
// layout subtracts tabBarStyle padding from a fixed internal height budget
// instead of adding to it — confirmed by bisection (docs/RESTYLE_LOG.md
// "Tab bar label layout bug"), it collapses the label to 0 height. So
// tabBarStyle below only carries what's safe to hand the library
// (background/border/explicit height/horizontal padding); this button draws
// its own icon, 3px gap and label, with its own 7px-top/16px-bottom padding,
// bypassing the library's icon/label slot math entirely. Same component on
// web, Android and iOS — nothing here is web-only.
function makeTabButton(iconName: IconName, label: string, theme: (typeof Colors)['light']) {
  return function TabButton(props: BottomTabBarButtonProps) {
    // `rest` still carries `children` (the library's own broken icon+label
    // composition, see the comment above) — spread onto PlatformPressable
    // but never rendered; our own View below is passed as children instead.
    const { style, ...rest } = props;
    const insets = useSafeAreaInsets();
    const focused = props['aria-selected'] === true;
    const iconColor = focused ? theme.limeDeep : theme.tabIconDefault;
    const labelColor = focused ? theme.tabIconSelected : theme.tabIconDefault;

    return (
      <PlatformPressable
        {...rest}
        style={[style, styles.button, { paddingBottom: Math.max(16, insets.bottom) }]}
        onPressIn={(ev) => {
          if (process.env.EXPO_OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          props.onPressIn?.(ev);
        }}>
        <View style={styles.content}>
          <Icon name={iconName} size={ICON_SIZE} color={iconColor} />
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </PlatformPressable>
    );
  };
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    paddingTop: 7,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontFamily: Font.bodySemi,
    fontSize: 9.5,
    lineHeight: 14.25,
    letterSpacing: BodyLetterSpacing,
  },
});

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role);

  // an admin signed in earlier (a saved session) opens the admin screen, not the player tabs
  if (role === 'admin') return <Redirect href="/admin" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // The prototype's 16px bottom padding stands in for the phone's
          // home-indicator safe area (a browser mock has none); on device the
          // inset replaces that space rather than stacking on top of it. The
          // 7px top / 16px bottom padding itself lives in the button above,
          // not here — see the comment on makeTabButton.
          height: BAR_HEIGHT + Math.max(0, insets.bottom - 16),
          paddingHorizontal: 6,
          backgroundColor: theme.card,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarButton: makeTabButton('home', 'Home', theme) }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarButton: makeTabButton('search', 'Search', theme) }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarButton: makeTabButton('cal', 'Bookings', theme),
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: 'Play',
          tabBarButton: makeTabButton('play', 'Play', theme),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarButton: makeTabButton('user', 'Profile', theme) }}
      />
    </Tabs>
  );
}
