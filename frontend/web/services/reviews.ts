/** Review API calls (backend modules/review) — owner slice (list an arena's
 * reviews, respond) plus the admin moderation slice (reported-review queue,
 * dismiss, delete). */
import { api } from "@/services/api";
import type { ModerationReview, Page, RatingSummary, Review } from "@/types";

export function listArenaReviews(arenaId: string, page = 1, pageSize = 20): Promise<Page<Review>> {
  return api.get<Page<Review>>(`/arenas/${arenaId}/reviews?page=${page}&page_size=${pageSize}`);
}

/** Owner view of one of their own arenas. Includes deactivated arenas, which the public list hides. */
export function listOwnerArenaReviews(
  arenaId: string,
  page = 1,
  pageSize = 20,
): Promise<Page<Review>> {
  return api.get<Page<Review>>(
    `/owner/arenas/${arenaId}/reviews?page=${page}&page_size=${pageSize}`,
  );
}

export function getRatingSummary(arenaId: string): Promise<RatingSummary> {
  return api.get<RatingSummary>(`/arenas/${arenaId}/reviews/summary`);
}

/** Reviews on the owner's arenas with no reply yet (the Reviews badge in the owner nav). */
export async function countUnansweredReviews(): Promise<number> {
  const res = await api.get<{ count: number }>("/owner/reviews/unanswered-count");
  return res.count;
}

export function respondToReview(reviewId: string, responseText: string): Promise<Review> {
  return api.post<Review>(`/owner/reviews/${reviewId}/response`, { response_text: responseText });
}

// ---- admin moderation ----

export function listReportedReviews(page = 1, pageSize = 20): Promise<Page<ModerationReview>> {
  return api.get<Page<ModerationReview>>(`/admin/reviews?page=${page}&page_size=${pageSize}`);
}

export function dismissReviewReport(reviewId: string): Promise<null> {
  return api.post<null>(`/admin/reviews/${reviewId}/dismiss`);
}

export function deleteReview(reviewId: string): Promise<null> {
  return api.del<null>(`/reviews/${reviewId}`);
}
