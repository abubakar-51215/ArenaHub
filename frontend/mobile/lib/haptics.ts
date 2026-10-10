import * as Haptics from 'expo-haptics';

// Touch feedback for the app's motion rules (docs/MOBILE_QA_GATE.md, standing
// rule c): a light tap on primary presses, a stronger buzz on success and on
// error. Never throws: web and devices without a motor just do nothing.
export function tapHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function errorHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
