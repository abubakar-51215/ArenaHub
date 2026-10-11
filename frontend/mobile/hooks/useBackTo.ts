import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * The Android back button on an end-of-flow screen (booking confirmed, awaiting approval, failed, slot lost) goes to
 * `href` instead of back into the payment screens behind it, where the booking is already settled.
 */
export function useBackTo(href: Href) {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace(href);
        return true;
      });
      return () => sub.remove();
    }, [href]),
  );
}
