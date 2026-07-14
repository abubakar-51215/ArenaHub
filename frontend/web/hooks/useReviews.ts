/** TanStack Query hooks for owner-facing review browsing/response. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getRatingSummary, listArenaReviews, respondToReview } from "@/services/reviews";

export function useArenaReviews(arenaId: string | null, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["reviews", arenaId ?? "none", page, pageSize],
    queryFn: () => listArenaReviews(arenaId as string, page, pageSize),
    enabled: !!arenaId,
  });
}

export function useRatingSummary(arenaId: string | null) {
  return useQuery({
    queryKey: ["rating-summary", arenaId ?? "none"],
    queryFn: () => getRatingSummary(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useRespondToReview(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, responseText }: { reviewId: string; responseText: string }) =>
      respondToReview(reviewId, responseText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", arenaId] });
      qc.invalidateQueries({ queryKey: ["rating-summary", arenaId] });
    },
  });
}
