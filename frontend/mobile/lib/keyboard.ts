/**
 * Keyboard geometry. Pure functions (tested by scripts/keyboard-check.cjs) plus one tiny store of where the
 * on-screen keyboard is. Everything is measured in window coordinates, so it is right whether the system shrinks the
 * window for the keyboard (Android "resize") or leaves it alone (edge-to-edge, iOS):
 *  - the part of a screen the keyboard covers is `max(0, bottomOfScreenArea - keyboardTop)`; if the window was already
 *    shrunk that is 0 and nothing is added twice;
 *  - a focused field is scrolled until its bottom is `margin` above the keyboard.
 */
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/** Space kept between a focused field and the keyboard. */
export const KEYBOARD_MARGIN = 24;

/** How much of an area (its bottom edge in window coordinates) the keyboard covers. */
export function keyboardOverlap(areaBottom: number, keyboardTop: number | null): number {
  if (keyboardTop == null) return 0;
  return Math.max(0, Math.round(areaBottom - keyboardTop));
}

/** How far to scroll down so a field whose bottom edge is at `fieldBottom` ends `margin` above the keyboard (0 = already visible). */
export function scrollDeltaToReveal(fieldBottom: number, keyboardTop: number | null, margin = KEYBOARD_MARGIN): number {
  if (keyboardTop == null) return 0;
  return Math.max(0, Math.round(fieldBottom - (keyboardTop - margin)));
}

/** A field that is above the visible area of the scroll view (its top is under the top edge): how far to scroll back up (negative). */
export function scrollDeltaToRevealTop(fieldTop: number, areaTop: number, margin = KEYBOARD_MARGIN): number {
  return fieldTop < areaTop + margin ? Math.round(fieldTop - (areaTop + margin)) : 0;
}

type Listener = () => void;
const state: { top: number | null; height: number; duration: number } = { top: null, height: 0, duration: 200 };
const listeners = new Set<Listener>();
let attached = false;

function attach() {
  if (attached) return;
  attached = true;
  const show = (e: KeyboardEvent) => {
    state.top = e.endCoordinates.screenY;
    state.height = e.endCoordinates.height;
    state.duration = e.duration && e.duration > 0 ? e.duration : 180;
    listeners.forEach((l) => l());
  };
  const hide = (e?: KeyboardEvent) => {
    state.top = null;
    state.height = 0;
    state.duration = e?.duration && e.duration > 0 ? e.duration : 160;
    listeners.forEach((l) => l());
  };
  // iOS announces the keyboard before it moves (with its animation time); Android only after
  Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', show);
  if (Platform.OS === 'ios') Keyboard.addListener('keyboardWillChangeFrame', show);
  // development only: lets a browser test pretend the keyboard opened (a browser has none)
  if (__DEV__ && Platform.OS === 'web') {
    (globalThis as { __arenahubKeyboard?: unknown }).__arenahubKeyboard = {
      show: (top: number, height: number) => show({ endCoordinates: { screenY: top, height }, duration: 0 } as KeyboardEvent),
      hide: () => hide(),
    };
  }
  Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', hide);
}

/** Where the keyboard is now (window coordinates), and a way to hear about changes. */
export function keyboardNow() {
  attach();
  return state;
}

export function onKeyboardChange(l: Listener): () => void {
  attach();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
