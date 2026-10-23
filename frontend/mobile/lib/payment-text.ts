/**
 * Wording for paying by card or mobile wallet, kept in one place for the owner to approve
 * (approved by the owner on 2026-10-16). Bank transfer keeps its approved wording in its own screens.
 */
export type WalletName = 'JazzCash' | 'EasyPaisa';

export const PAY_TEXT = {
  walletLabel: (w: WalletName) => `Your ${w} number`,
  walletPlaceholder: '03XX XXXXXXX',
  walletHint: (w: WalletName) => `We send the payment request to this ${w} account.`,
  walletMissing: (w: WalletName) => `Enter your ${w} number.`,
  walletInvalid: 'Enter a Pakistani mobile number, like 0300 1234567.',
  cardTitle: 'Finish paying on the card page.',
  cardText: 'Your booking is confirmed as soon as the card payment goes through.',
  cardReopen: 'Open the card page again',
  walletTitle: (w: WalletName) => `Approve the payment in ${w}.`,
  walletText: (w: WalletName, masked: string) =>
    `We sent a payment request to ${masked}. Open your ${w} app, approve it, then come back here. Your booking is confirmed as soon as the payment arrives.`,
  waiting: 'Waiting for payment',
  devApprove: 'Approve (development only)',
  devDecline: 'Decline (development only)',
};

/** Wording for paying the balance still owed on a confirmed booking (waiting for the owner's approval). */
export const BALANCE_TEXT = {
  button: 'Pay balance',
  title: 'Pay balance',
  due: 'Balance to pay',
  paid: 'Balance paid',
  paidPill: 'Paid',
  fixedHint: 'This is what is still owed on your booking. The amount cannot be changed.',
  bankNote: 'Your balance is paid once the arena confirms your receipt. Send the exact amount, then upload the receipt.',
  awaitingPill: 'Awaiting approval',
  awaitingNote: 'The arena is checking your balance payment. We will tell you here and by email as soon as it is confirmed.',
  inProgressPill: 'Payment in progress',
  inProgressNote: 'A balance payment is already open. Finish it, or try again later.',
  receiptSent: 'Receipt sent. The arena will check it.',
  paidToast: 'Balance paid.',
  failedToast: 'The balance payment did not go through. You can try again.',
};

/** A fresh key for one tap of Pay: the same request sent twice is one payment, never two. */
export const newIdempotencyKey = () => `bal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** "0300 1234567" from any spelling of a Pakistani mobile number; null when it is not one. */
export function localMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('92') && d.length === 12) d = '0' + d.slice(2);
  return /^03\d{9}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4)}` : null;
}

/** "0300•••4567": shown on the waiting screen, never the whole number. */
export const maskMobile = (local: string) => {
  const d = local.replace(/\D/g, '');
  return `${d.slice(0, 4)}•••${d.slice(-4)}`;
};
