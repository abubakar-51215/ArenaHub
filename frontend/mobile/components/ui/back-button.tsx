import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';

// Values from .m-back / .m-back svg.
export function BackButton(props: Omit<PressableProps, 'style'>) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? 'Back'}
      style={styles.base}>
      <Icon name="back" size={15} color={Colors.light.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.light.line,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
