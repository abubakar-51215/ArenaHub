"use client";

import { useState } from "react";
import { Flag, Star } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMyArenas } from "@/hooks/useArenas";
import { useArenaReviews, useRatingSummary, useRespondToReview } from "@/hooks/useReviews";
import { ApiError } from "@/services/api";
import type { Review } from "@/types";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={
            i < rating ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground/30"
          }
        />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { data: arenaPage } = useMyArenas();
  const arenas = arenaPage?.items ?? [];

  const [arenaId, setArenaId] = useState("");
  const activeArena = arenaId || arenas[0]?.id || "";

  const { data: reviewPage, isLoading } = useArenaReviews(activeArena || null, 1, 50);
  const { data: summary } = useRatingSummary(activeArena || null);
  const respond = useRespondToReview(activeArena);

  const reviews = reviewPage?.items ?? [];
  const [responding, setResponding] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRespond(text: string) {
    if (!responding) return;
    setError(null);
    try {
      await respond.mutateAsync({ reviewId: responding.id, responseText: text });
      setResponding(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post the response.");
    }
  }

  return (
    <>
      <PageHeader title="Reviews" />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Arena</label>
            <Select
              value={activeArena}
              onChange={(e) => setArenaId(e.target.value)}
              className="w-64"
            >
              {arenas.length === 0 && <option value="">No arenas yet</option>}
              {arenas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          {summary && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Stars rating={Math.round(summary.average_rating ?? 0)} />
              <span>
                {summary.average_rating != null ? summary.average_rating.toFixed(1) : "—"} (
                {summary.review_count} review{summary.review_count === 1 ? "" : "s"})
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="space-y-4">
          {!activeArena && <p className="text-sm text-muted-foreground">Add an arena first.</p>}
          {activeArena && isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {activeArena && !isLoading && reviews.length === 0 && (
            <p className="text-sm text-muted-foreground">No reviews yet for this arena.</p>
          )}
          {reviews.map((review) => (
            <div key={review.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{review.reviewer_name}</p>
                    {review.is_flagged && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <Flag className="size-3" /> Flagged
                      </span>
                    )}
                  </div>
                  <Stars rating={review.rating} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(review.created_at).toLocaleDateString()}
                </span>
              </div>

              {review.review_text && (
                <p className="mt-3 text-sm text-foreground">{review.review_text}</p>
              )}

              {review.owner_response ? (
                <div className="mt-4 rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Your response</p>
                  <p className="mt-1 text-sm text-foreground">{review.owner_response}</p>
                </div>
              ) : (
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={() => setResponding(review)}>
                    Respond
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <TextInputDialog
        open={!!responding}
        onOpenChange={(v) => !v && setResponding(null)}
        title="Respond to review"
        description={
          responding ? `Publicly visible under ${responding.reviewer_name}'s review.` : undefined
        }
        placeholder="Thanks for the feedback! We're always working to improve…"
        confirmLabel="Post Response"
        pending={respond.isPending}
        onSubmit={onRespond}
      />
    </>
  );
}
