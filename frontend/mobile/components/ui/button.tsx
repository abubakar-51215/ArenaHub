import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Brand, Colors, Shadow } from '@/constants/theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'outline' | 'ghost';
  loading?: boolean;
}

export function Button({ title, variant = 'primary', loading, disabled, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;

  const label = loading ? (
    <ActivityIndicator color={variant === 'primary' ? '#fff' : Colors.light.tint} />
  ) : (
    <Text
      style={[
        styles.text,
        variant === 'primary' && styles.textPrimary,
        variant !== 'primary' && styles.textOther,
      ]}>
      {title}
    </Text>
  );

  // Primary uses a real brand gradient with soft elevation; other variants stay flat.
  if (variant === 'primary') {
    return (
      <Pressable
        {...props}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          Shadow.brand,
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
        ]}>
        <LinearGradient
          colors={Brand.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}>
          {label}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles.padded,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}>
      {label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  padded: { paddingHorizontal: 16 },
  fill: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outline: { borderWidth: 1.5, borderColor: Colors.light.tint, backgroundColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  text: { fontSize: 16, fontWeight: '600' },
  textPrimary: { color: '#fff' },
  textOther: { color: Colors.light.tint },
});
