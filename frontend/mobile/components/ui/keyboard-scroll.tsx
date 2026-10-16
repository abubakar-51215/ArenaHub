import { useFocusEffect } from 'expo-router';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { keyboardNow, keyboardOverlap, onKeyboardChange, scrollDeltaToReveal, scrollDeltaToRevealTop } from '@/lib/keyboard';

/**
 * THE screen body for every screen with a text box (rule: docs/MOBILE_QA_GATE.md "Keyboard"). `KeyboardArea` does the
 * work; `KeyboardScroll` is KeyboardArea around a ScrollView (use `KeyboardArea` with a FlatList):
 *  - the screen rises above the keyboard: the part of the area the keyboard covers (measured in window coordinates, so
 *    nothing is added twice when Android already shrank the window) becomes bottom padding, animated, and `footer`
 *    (a sticky bottom button) sits above it;
 *  - the focused field is scrolled into view with 24 px under it (every field in components/ui/text-input.tsx asks for
 *    this when it gets focus, and again when the keyboard has finished appearing);
 *  - tapping an empty area (keyboardShouldPersistTaps="handled"), scrolling (on-drag; interactive on iOS) and leaving
 *    the screen close the keyboard.
 */
type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

interface KeyboardScrollContextValue {
  /** Scroll so this input (a ref to a TextInput) is fully visible above the keyboard. */
  ensureVisible: (input: Measurable | null) => void;
}

export const KeyboardScrollContext = createContext<KeyboardScrollContextValue | null>(null);
export const useKeyboardScroll = () => useContext(KeyboardScrollContext);

/** What a scroll view (or list) inside a KeyboardArea must be given. */
export interface KeyboardScrollProps {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  keyboardShouldPersistTaps: 'handled';
  keyboardDismissMode: 'interactive' | 'on-drag' | 'none';
  automaticallyAdjustKeyboardInsets: false;
}

/** The text box that has focus now (on the web, the focused page element, so the same logic can be tested in a browser). */
function focusedInput(): Measurable | null {
  if (Platform.OS === 'web') {
    const el = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    if (!el || el === document.body) return null;
    return {
      measureInWindow: (cb) => {
        const r = el.getBoundingClientRect();
        cb(r.left, r.top, r.width, r.height);
      },
    };
  }
  return (TextInput.State.currentlyFocusedInput?.() as unknown as Measurable | null) ?? null;
}

/** Anything that can scroll to a position: a ScrollView or a FlatList. */
interface Scrollable {
  scrollTo?: (o: { y: number; animated?: boolean }) => void;
  scrollToOffset?: (o: { offset: number; animated?: boolean }) => void;
}

interface AreaProps {
  scrollRef: RefObject<Scrollable | null>;
  children: (scrollProps: KeyboardScrollProps) => ReactNode;
  /** A sticky bottom area (button bar). It stays above the keyboard. */
  footer?: ReactNode;
  wrapStyle?: StyleProp<ViewStyle>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function KeyboardArea({ scrollRef, children, footer, wrapStyle, onScroll }: AreaProps) {
  const wrap = useRef<View>(null);
  const offset = useRef(0);
  const inset = useRef(new Animated.Value(0)).current;

  const scrollToY = useCallback(
    (y: number) => {
      const s = scrollRef.current;
      if (!s) return;
      if (s.scrollTo) s.scrollTo({ y, animated: true });
      else s.scrollToOffset?.({ offset: y, animated: true });
    },
    [scrollRef],
  );

  const reveal = useCallback(
    (input: Measurable | null) => {
      const kb = keyboardNow();
      if (!input || kb.top == null) return;
      const top = kb.top;
      input.measureInWindow((_x, y, _w, h) => {
        const down = scrollDeltaToReveal(y + h, top);
        if (down > 0) {
          scrollToY(Math.max(0, offset.current + down));
          return;
        }
        wrap.current?.measureInWindow((_wx, wy) => {
          const up = scrollDeltaToRevealTop(y, wy);
          if (up < 0) scrollToY(Math.max(0, offset.current + up));
        });
      });
    },
    [scrollToY],
  );

  // follow the keyboard: padding = the part of this area the keyboard covers
  useEffect(() => {
    const apply = () => {
      const kb = keyboardNow();
      // bring the focused field into view only once the padding has finished growing: until then the scroll area is
      // still tall and could not scroll far enough
      const revealFocused = () => {
        const focused = focusedInput();
        if (focused) reveal(focused);
      };
      const animateTo = (px: number, after?: () => void) =>
        Animated.timing(inset, {
          toValue: px,
          duration: Platform.OS === 'ios' ? kb.duration : 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start(() => after?.());
      if (kb.top == null) {
        animateTo(0);
        return;
      }
      const top = kb.top;
      wrap.current?.measureInWindow((_x, y, _w, h) => {
        animateTo(keyboardOverlap(y + h, top), () => setTimeout(revealFocused, 40));
      });
    };
    apply();
    return onKeyboardChange(apply);
  }, [inset, reveal]);

  // leaving the screen closes the keyboard
  useFocusEffect(
    useCallback(
      () => () => {
        Keyboard.dismiss();
      },
      [],
    ),
  );

  const ctx = useMemo<KeyboardScrollContextValue>(
    () => ({
      ensureVisible: (i) => {
        // again after a field's own grow/shrink animation (300 ms) has finished
        setTimeout(() => reveal(i), 30);
        setTimeout(() => reveal(i), 380);
      },
    }),
    [reveal],
  );

  const scrollProps: KeyboardScrollProps = {
    onScroll: (e) => {
      offset.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    scrollEventThrottle: 16,
    keyboardShouldPersistTaps: 'handled',
    keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'android' ? 'on-drag' : 'none',
    automaticallyAdjustKeyboardInsets: false,
  };

  return (
    <KeyboardScrollContext.Provider value={ctx}>
      <Animated.View ref={wrap as never} collapsable={false} style={[styles.wrap, wrapStyle, { paddingBottom: inset }]}>
        {children(scrollProps)}
        {footer}
      </Animated.View>
    </KeyboardScrollContext.Provider>
  );
}

interface Props extends Omit<ScrollViewProps, 'keyboardShouldPersistTaps' | 'keyboardDismissMode'> {
  children: ReactNode;
  footer?: ReactNode;
  wrapStyle?: StyleProp<ViewStyle>;
}

export const KeyboardScroll = forwardRef<ScrollView, Props>(function KeyboardScroll(
  { children, footer, wrapStyle, onScroll, ...props },
  ref,
) {
  const scroll = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => scroll.current as ScrollView);
  return (
    <KeyboardArea scrollRef={scroll} footer={footer} wrapStyle={wrapStyle} onScroll={onScroll}>
      {(sp) => (
        <ScrollView ref={scroll} showsVerticalScrollIndicator={false} {...props} {...sp}>
          {children}
        </ScrollView>
      )}
    </KeyboardArea>
  );
});

const styles = StyleSheet.create({ wrap: { flex: 1 } });
