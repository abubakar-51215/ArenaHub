import { COMPLAINT_CATEGORIES } from '@/constants/support';
import type { Complaint } from '@/services/complaints';

/** The complaint form has no title, so the list shows the first words of what the player wrote. */
export function complaintTitle(description: string): string {
  const first = description.trim().split(/\n/)[0].trim();
  const firstSentence = first.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? first;
  const cut = firstSentence.length > 42 ? `${firstSentence.slice(0, 40).trimEnd()}…` : firstSentence;
  return cut || 'Complaint';
}

export const categoryLabel = (c: Complaint['category']) => COMPLAINT_CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';

export const STATUS_LOOK: Record<Complaint['status'], { label: string; tone: 'ok' | 'wait' | 'off' | 'idle' }> = {
  open: { label: 'Open', tone: 'wait' },
  under_review: { label: 'Under review', tone: 'wait' },
  resolved: { label: 'Resolved', tone: 'ok' },
};
