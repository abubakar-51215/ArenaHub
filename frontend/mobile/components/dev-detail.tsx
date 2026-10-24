import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { useDevLine } from '@/lib/dev-detail';

/** One small grey line under an error, in a development build only (see lib/dev-detail.ts). */
export function DevDetail({ keys }: { keys: string[] }) {
  const line = useDevLine(keys);
  if (!line) return null;
  return (
    <Text style={styles.line} accessibilityLabel={line}>
      {line}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 12, color: Colors.light.muted, marginTop: 4 },
});
