"use client";

import { useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Flag, MessageSquareReply, Star } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { listArenaReviews, respondToReview } from "@/services/reviews";
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

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
      {initials || "?"}
    </span>
  );
}

interface TaggedReview extends Review {
  arena_name: string;
}

export default function ReviewsPage() {
  const qc = useQueryClient();
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  // Fetched per-arena and merged client-side, so "load more" bumps a single
  // shared page_size across every arena's query rather than paging each
  // arena independently (simpler than per-arena cursors for a flattened,
  // globally-sorted list).
  const PAGE_SIZE_STEP = 50;
  const [pageSize, setPageSize] = useState(PAGE_SIZE_STEP);

  const reviewQueries = useQueries({
    queries: arenas.map((a) => ({
      queryKey: ["reviews", a.id, pageSize],
      queryFn: async (): Promise<{ items: TaggedReview[]; total: number }> => {
        const page = await listArenaReviews(a.id, 1, pageSize);
        return { items: page.items.map((r) => ({ ...r, arena_name: a.name })), total: page.total };
      },
    })),
  });
  const loading = arenas.length > 0 && reviewQueries.some((q) => q.isLoading);
  const reviews = useMemo(
    () =>
      reviewQueries
        .flatMap((q) => q.data?.items ?? [])
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [reviewQueries],
  );
  const canLoadMore = reviewQueries.some((q) => (q.data?.total ?? 0) > pageSize);

  const [responding, setResponding] = useState<TaggedReview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRespond(text: string) {
    if (!responding) return;
    setError(null);
    setPending(true);
    try {
      await respondToReview(responding.id, text);
      qc.invalidateQueries({ queryKey: ["reviews", responding.arena_id] });
      setResponding(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post the response.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader title="Reviews Management" />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="shadow-card overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="w-2/5">Review</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && reviews.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No reviews yet across your arenas.
                  </TableCell>
                </TableRow>
              )}
              {reviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={review.reviewer_name} />
                      <span className="font-medium text-foreground">{review.reviewer_name}</span>
                      {review.is_flagged && (
                        <span title="Reported by a user">
                          <Flag className="size-3.5 text-red-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{review.arena_name}</TableCell>
                  <TableCell>
                    <Stars rating={review.rating} />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-foreground">{review.review_text ?? "—"}</p>
                    {review.owner_response && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Your response:</span> {review.owner_response}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(review.created_at.slice(0, 10))}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {!review.owner_response && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Respond"
                          onClick={() => setResponding(review)}
                        >
                          <MessageSquareReply className="size-4 text-blue-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {canLoadMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setPageSize((n) => n + PAGE_SIZE_STEP)}
              disabled={loading}
            >
              Load More
            </Button>
          </div>
        )}
      </div>

      <TextInputDialog
        open={!!responding}
        onOpenChange={(v) => !v && setResponding(null)}
        title="Respond to review"
        description={
          responding
            ? `Publicly visible under ${responding.reviewer_name}'s review of ${responding.arena_name}.`
            : undefined
        }
        placeholder="Thanks for the feedback! We're always working to improve…"
        confirmLabel="Post Response"
        pending={pending}
        onSubmit={onRespond}
      />
    </>
  );
}
