import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/** The thin rule with a word in the middle between the two ways in ("or", "or sign up with email"). */
export function OrRule({ label = 'or' }: { label?: string }) {
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.line} />
      <Text style={styles.text}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: Colors.light.line },
  text: { fontSize: 14, color: Colors.light.muted },
});
