import { create } from 'zustand';

/**
 * The checkout in progress. The booking is made when the person taps Pay, so
 * this remembers it: going back from the bank-transfer screen and paying again
 * reuses the same booking instead of asking for the same times twice.
 * `key` is the court and the chosen slot ids.
 */
interface CheckoutState {
  group: { key: string; groupId: string } | null;
  remember: (key: string, groupId: string) => void;
  forget: () => void;
}

export const useCheckout = create<CheckoutState>()((set) => ({
  group: null,
  remember: (key, groupId) => set({ group: { key, groupId } }),
  forget: () => set({ group: null }),
}));

export const checkoutKey = (courtId: string, slotIds: string[]) => `${courtId}|${slotIds.join(',')}`;
