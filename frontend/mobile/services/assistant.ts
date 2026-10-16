/** The ArenaHub assistant (POST /assistant/ask): checked answers and the player's own data, no outside AI. */
import { api } from '../lib/api';

export type AssistantActionKind = 'open_booking' | 'open_payments' | 'open_new_complaint' | 'open_my_matches' | 'open_search';

export interface AssistantAnswer {
  intent: string;
  answer: string;
  actions: { kind: AssistantActionKind; label: string; target: string | null }[];
  suggestions: { id: string; label: string }[];
}

/** Ten seconds at most (frame 8: the typing dots never wait longer); then the screen offers Try again. */
export function askAssistant(body: { text: string } | { suggestion: string }): Promise<AssistantAnswer> {
  return api.post<AssistantAnswer>('/assistant/ask', body, { timeoutMs: 10_000 });
}
