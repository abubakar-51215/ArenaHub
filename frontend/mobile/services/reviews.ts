/** Player-facing review API calls. */
import { api } from '../lib/api';
import type { Page, RatingSummary, Review } from '../types';

export function listArenaReviews(arenaId: string): Promise<Page<Review>> {
  return api.get<Page<Review>>(`/arenas/${arenaId}/reviews?page_size=50`);
}

export function getRatingSummary(arenaId: string): Promise<RatingSummary> {
  return api.get<RatingSummary>(`/arenas/${arenaId}/reviews/summary`);
}

export function submitReview(
  arenaId: string,
  data: { booking_id: string; rating: number; review_text?: string },
): Promise<Review> {
  return api.post<Review>(`/arenas/${arenaId}/reviews`, data);
}

export function updateReview(
  reviewId: string,
  data: { rating?: number; review_text?: string },
): Promise<Review> {
  return api.put<Review>(`/reviews/${reviewId}`, data);
}

export function deleteReview(reviewId: string): Promise<null> {
  return api.del<null>(`/reviews/${reviewId}`);
}

export function reportReview(reviewId: string, reason: string): Promise<Review> {
  return api.post<Review>(`/reviews/${reviewId}/report`, { reason });
}
