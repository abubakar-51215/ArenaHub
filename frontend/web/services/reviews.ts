/** Review API calls (backend modules/review) — owner-facing slice: list an
 * arena's reviews and respond to one. */
import { api } from "@/services/api";
import type { Page, RatingSummary, Review } from "@/types";

export function listArenaReviews(arenaId: string, page = 1, pageSize = 20): Promise<Page<Review>> {
  return api.get<Page<Review>>(`/arenas/${arenaId}/reviews?page=${page}&page_size=${pageSize}`);
}

export function getRatingSummary(arenaId: string): Promise<RatingSummary> {
  return api.get<RatingSummary>(`/arenas/${arenaId}/reviews/summary`);
}

export function respondToReview(reviewId: string, responseText: string): Promise<Review> {
  return api.post<Review>(`/owner/reviews/${reviewId}/response`, { response_text: responseText });
}
