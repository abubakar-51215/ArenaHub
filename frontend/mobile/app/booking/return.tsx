import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

// Where Stripe's card page sends the player back (arenahub://booking/return). In the browser build
// the card page runs in a pop-up: this tells the waiting app it is done and the pop-up closes. On a
// phone the card page closes itself and the waiting screen is already open behind it; if the link
// opens the app on its own, it goes back to that screen, or to My bookings.
const finished = WebBrowser.maybeCompleteAuthSession();

export default function PaymentReturn() {
  useEffect(() => {
    if (finished.type === 'success') return; // the pop-up closes itself
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/bookings');
  }, []);
  return null;
}
