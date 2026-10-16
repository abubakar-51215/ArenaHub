/**
 * Wording for paying by card or mobile wallet, kept in one place for the owner to approve
 * (placeholders until approved). Bank transfer keeps its approved wording in its own screens.
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
