import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A control whose drawn size is smaller than 44 px but whose tap box is a real 44 px (rule: docs/MOBILE_QA_GATE.md "Taps").
 * The outer pressable grows by `slop` on every side and gives that room back with a negative margin, so the screen lays out
 * exactly as before; the drawn part (`inner`) sits in the middle. Unlike `hitSlop`, this box is really that big on every
 * platform, so it can be measured (react-native-web ignores `hitSlop`).
 */
export function TapBox({
  slop,
  inner,
  style,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  slop: number | { x?: number; y?: number };
  /** The drawn part: the circle, the pill, the text. */
  inner?: StyleProp<ViewStyle>;
  /** Where the box sits (flex, position). */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const x = typeof slop === 'number' ? slop : (slop.x ?? 0);
  const y = typeof slop === 'number' ? slop : (slop.y ?? 0);
  return (
    <Pressable
      {...props}
      style={[{ paddingHorizontal: x, paddingVertical: y, marginHorizontal: -x, marginVertical: -y }, style]}>
      <View style={inner}>{children}</View>
    </Pressable>
  );
}
