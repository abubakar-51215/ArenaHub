"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportedReviews, useReviewModeration } from "@/hooks/useAdmin";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { ModerationReview } from "@/types";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="text-muted-foreground/40">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function AdminReviewsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useReportedReviews(page);
  const { dismiss, remove } = useReviewModeration();

  const [deleting, setDeleting] = useState<ModerationReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviews = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  async function onDismiss(review: ModerationReview) {
    setError(null);
    try {
      await dismiss.mutateAsync(review.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not dismiss the report.");
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setError(null);
    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the review.");
    }
  }

  return (
    <>
      <PageHeader title="Review Moderation" subtitle="Moderate user reviews and ratings" />

      <div className="animate-fade-in space-y-4 p-4 sm:p-6 lg:p-8">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="shadow-card overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reviewer</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="w-1/3">Review</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Reported On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={7}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && reviews.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={7}>
                    No reported reviews — the queue is clear.
                  </TableCell>
                </TableRow>
              )}
              {reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.reviewer_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.arena_name}</TableCell>
                  <TableCell>
                    <Stars rating={r.rating} />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-foreground">{r.review_text ?? "(no text)"}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-foreground">{r.flag_reason}</p>
                    {r.reporter_name && (
                      <p className="mt-0.5 text-xs text-muted-foreground">by {r.reporter_name}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.flagged_at ? formatDate(r.flagged_at.slice(0, 10)) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={dismiss.isPending}
                        onClick={() => onDismiss(r)}
                      >
                        Dismiss
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * data.page_size + 1}–
              {Math.min(page * data.page_size, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this review?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The review by <span className="font-medium">{deleting?.reviewer_name}</span> on{" "}
            <span className="font-medium">{deleting?.arena_name}</span> will be permanently removed
            and the arena&apos;s rating recomputed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={onDelete}
            >
              {remove.isPending ? "Deleting…" : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
