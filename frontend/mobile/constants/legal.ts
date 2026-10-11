/**
 * DRAFT Terms and Privacy text. This is the wording from the account frames (the Terms) plus a short draft Privacy text.
 * It is NOT final: replace it with the real wording before any Play Store or App Store upload (docs/BEFORE_GOING_LIVE.md).
 * The Terms and privacy screen only reads this file, so replacing the text here is all that is needed.
 */
export const LEGAL_DRAFT_NOTE = 'Draft text. Replace with your final wording before launch.';

export interface LegalSection {
  title: string;
  body: string;
}

export const TERMS: LegalSection[] = [
  {
    title: '1. Using Arena Hub',
    body: 'Arena Hub lets you find sports arenas and book time slots. You must give correct details and use the app fairly.',
  },
  {
    title: '2. Bookings and payment',
    body: 'A booking is confirmed when the arena accepts your payment. Each arena sets its own cancellation and refund rules, shown before you pay.',
  },
  {
    title: '3. Cancelling and refunds',
    body: 'Refunds follow the arena policy shown on your booking. Bank transfer refunds are sent by the arena.',
  },
];

export const PRIVACY: LegalSection[] = [
  {
    title: '1. What we keep',
    body: 'We keep your name, email, phone number, city, your bookings, your payments and the receipts you upload, and the reviews and complaints you write.',
  },
  {
    title: '2. Your location',
    body: 'If you allow it, your location is used on your phone to find arenas near you. It is sent with a search only to work out distances. We do not store it.',
  },
  {
    title: '3. Your choices',
    body: 'You can change your details in Personal information, turn notices on or off in Settings, and delete your account in Settings once your bookings are done.',
  },
];
