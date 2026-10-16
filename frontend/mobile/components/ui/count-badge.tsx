import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/**
 * The number badge that sits on a corner of an icon button (Filters, and any future bell, tab or cart count).
 * Rules (docs/MOBILE_QA_GATE.md "Badges"): at least 20 x 20, 14 px bold text centred, grows for two digits, shows
 * "9+" above nine, and lies INSIDE its 44 px icon button (top: 1, right: 1), so no parent that clips (a ScrollView, a
 * card) and no screen edge can cut it. The text follows the phone's font size up to 1.2x; the badge grows with it.
 */
export const COUNT_BADGE_MIN = 20;

export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

export function CountBadge({ count }: { count: number }) {
  if (!count || count < 1) return null;
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.text} maxFontSizeMultiplier={1.2} numberOfLines={1}>
        {badgeText(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: COUNT_BADGE_MIN,
    minHeight: COUNT_BADGE_MIN,
    borderRadius: COUNT_BADGE_MIN / 2,
    paddingHorizontal: 5,
    backgroundColor: Colors.light.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: Colors.light.lime, textAlign: 'center', includeFontPadding: false },
});
