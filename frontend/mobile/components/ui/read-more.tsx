import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/**
 * A long text cut to three lines with "Read more" (and "Show less" once open).
 * The link only appears for a text long enough to be cut.
 */
export function ReadMore({ text, lines = 3, threshold = 150 }: { text: string; lines?: number; threshold?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;
  return (
    <View>
      <Text style={styles.text} numberOfLines={open || !long ? undefined : lines}>
        {text}
      </Text>
      {long ? (
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={open ? 'Show less' : 'Read more'} accessibilityState={{ expanded: open }} style={styles.link}>
          <Text style={styles.linkText}>{open ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 21, color: Colors.light.text2 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeDeep },
});
