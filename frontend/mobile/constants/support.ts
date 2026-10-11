/** Help and support content. (The contact email and hours are decided at the very end and are not shown yet: docs/BEFORE_GOING_LIVE.md.) */

export interface FaqItem {
  question: string;
  answer: string;
  note?: string;
}

/** The three common questions. The first answer is the wording of the frame; the other two are plain draft answers to check. */
export const FAQ: FaqItem[] = [
  {
    question: 'How do I cancel a booking?',
    answer: 'Open My bookings, tap the booking, then tap Cancel booking. You will see how much comes back before you confirm.',
    note: 'Refunds follow the arena policy shown on your booking.',
  },
  {
    question: 'When do I get my refund?',
    answer: 'A refund is started as soon as you cancel. Card refunds are sent back by the payment service. Bank transfer refunds are sent by the arena, so they can take a few working days. You will get a notice when it is done.',
    note: 'You can follow every refund in Profile, Payment history.',
  },
  {
    question: 'How does bank transfer work?',
    answer: 'Pick Bank transfer when you pay, send the exact amount to the arena account shown, then upload a photo of your receipt. The arena checks it and confirms your booking.',
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
