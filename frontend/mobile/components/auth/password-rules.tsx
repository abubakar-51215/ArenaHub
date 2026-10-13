import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

// The live rule list under a new-password field: .chk-row / .chk-dot in
// arena-hub-player-app-auth.html. The four rules are the backend's own
// (validate_password_strength): 8+ characters, an uppercase letter, a number,
// and a special (non letter/number) character.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordMeetsRules(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}

export function PasswordRules({ password }: { password: string }) {
  return (
    <View style={styles.list} accessibilityLabel="Password rules">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <View key={rule.label} style={styles.row} accessible accessibilityLabel={`${rule.label}: ${met ? 'met' : 'not met'}`}>
            <View style={[styles.dot, met && styles.dotMet]}>
              {met ? <Icon name="tick" size={9} color={Colors.light.limeDeep} strokeWidth={3} /> : <Text style={styles.bullet}>•</Text>}
            </View>
            <Text style={[styles.label, met && styles.labelMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 5, paddingTop: 2, paddingHorizontal: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: Colors.light.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotMet: { backgroundColor: Colors.light.limeWash },
  bullet: { fontSize: 9, lineHeight: 11, color: Colors.light.muted },
  label: { fontSize: 14, color: Colors.light.muted },
  labelMet: { color: Colors.light.limeText },
});
