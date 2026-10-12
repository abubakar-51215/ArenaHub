/** Help and support content. (The contact email and hours are decided at the very end and are not shown yet: docs/BEFORE_GOING_LIVE.md.) */

export interface FaqItem {
  question: string;
  answer: string;
  note?: string;
}

/** The three common questions. Every sentence is checked against the app and the backend rules in docs/G6_CONTENT_CHECK.md. */
export const FAQ: FaqItem[] = [
  {
    question: 'How do I cancel a booking?',
    answer: 'Open My bookings, tap the booking, then tap Cancel booking. You will see how much comes back before you confirm.',
    note: 'Refunds follow the arena policy shown on your booking.',
  },
  {
    question: 'When do I get my refund?',
    answer: 'When you cancel, we show how much comes back before you confirm. If it is more than nothing, the refund starts at once. You pay by bank transfer, so the arena sends the money back to you itself. We tell you here when the arena marks it as sent.',
    note: 'How long it takes depends on the arena. You can follow it on the booking and in Profile, Payment history.',
  },
  {
    question: 'How does bank transfer work?',
    answer: 'Pick Bank transfer when you pay. Send the exact amount to the arena account shown, with the reference shown, then upload a photo of your receipt (JPG or PNG, up to 5 MB). The arena checks it and confirms or turns down your booking.',
    note: 'Your time is only booked once the arena confirms your receipt.',
  },
];

/** The category chips of a new complaint, in the order of the frame. */
export const COMPLAINT_CATEGORIES = [
  { value: 'booking_issue', label: 'Booking issue' },
  { value: 'payment_issue', label: 'Payment issue' },
  { value: 'arena_quality', label: 'Arena quality' },
  { value: 'owner_behavior', label: 'Owner behaviour' },
  { value: 'technical_problem', label: 'Technical problem' },
  { value: 'other', label: 'Other' },
] as const;
