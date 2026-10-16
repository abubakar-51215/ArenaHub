import { type PressableProps, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { TapBox } from '@/components/ui/tap-box';
import { Colors } from '@/constants/theme';

// Values from .m-back / .m-back svg. Drawn 30 px, a real 44 px tap box (TapBox), the same space on the screen.
export function BackButton({ hitSlop: _unused, ...props }: Omit<PressableProps, 'style'>) {
  return (
    <TapBox {...props} slop={7} inner={styles.base} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel ?? 'Back'}>
      <Icon name="back" size={15} color={Colors.light.text} />
    </TapBox>
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
