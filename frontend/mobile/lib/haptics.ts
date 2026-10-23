import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Touch feedback for the app's motion rules (docs/MOBILE_QA_GATE.md, standing
// rule c): a light tap on primary presses, a stronger buzz on success and on
// error. Never throws. On web there is no motor, and a buzz asked for before the
// first tap makes the browser print an error, so web does nothing at all.
const hasMotor = Platform.OS !== 'web';

export function tapHaptic() {
  if (hasMotor) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successHaptic() {
  if (hasMotor) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function errorHaptic() {
  if (hasMotor) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
