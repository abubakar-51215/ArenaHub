import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { showToast } from '@/components/ui/toast';
import { releaseBookingGroup } from '@/services/bookings';
import { useCheckout } from '@/store/checkout';

/**
 * Leaving the payment screens once a booking exists. The Leave payment sheet
 * (frame 8 of arena-hub-player-app-booking-payment.html) asks first: "Leave and
 * release time" gives the times back and returns to the arena, "Stay" closes the
 * sheet. With no booking yet, going back is just going back. The Android back
 * button does the same as the on-screen one.
 */
export function useLeaveCheckout(groupId: string | undefined, arenaId: string | undefined): { back: () => void; sheet: ReactNode } {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const forget = useCheckout((s) => s.forget);

  const back = useCallback(() => {
    if (groupId) setOpen(true);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!groupId) return false;
        setOpen(true);
        return true;
      });
      return () => sub.remove();
    }, [groupId]),
  );

  const leave = async () => {
    if (busy || !groupId) return;
    setBusy(true);
    try {
      await releaseBookingGroup(groupId);
      forget();
      setOpen(false);
      if (arenaId) router.dismissTo({ pathname: '/arena/[id]', params: { id: arenaId } });
      else router.replace('/(tabs)');
    } catch {
      showToast('Could not release your time. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <ConfirmSheet
      visible={open}
      title="Leave payment?"
      message="Your time will be released and someone else can book it."
      confirmLabel="Leave and release time"
      cancelLabel="Stay"
      loading={busy}
      onConfirm={leave}
      onCancel={() => !busy && setOpen(false)}
    />
  );
  return { back, sheet };
}
