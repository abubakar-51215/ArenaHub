import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand/brand-mark';

/** The full-screen wait of a first load: the 72 px loader (a ball laps the ring). Button spinners stay as they are. */
export function ScreenLoader({ top = 56 }: { top?: number }) {
  return (
    <View style={[styles.wrap, { paddingTop: top }]}>
      <BrandMark mode="loader" tone="light" size={72} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center' } });
