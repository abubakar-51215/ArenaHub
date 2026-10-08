"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { AdminEmpty, AdminPerson, AdminTableFoot } from "@/components/admin/ui";
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
import { formatDate, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { ModerationReview } from "@/types";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="ah-stars" aria-label={`${rating} out of 5`}>
      <span aria-hidden="true">
        {"★".repeat(rating)}
        <span className="ah-stars-off">{"★".repeat(5 - rating)}</span>
      </span>
      <span className="ah-stars-num" aria-hidden="true">
        {rating}/5
      </span>
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
      <PageHeader
        title="Reviews"
        subtitle={
          data
            ? plural(data.total, "reported review")
            : "Reported reviews waiting for a decision"
        }
      />

      <div className="animate-fade-in ah-stack">
        {error && (
          <p role="alert" className="ah-auth-error">
            {error}
          </p>
        )}
        <section className="ah-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reviewer</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="w-1/3">Review</TableHead>
                <TableHead>Report</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead className="ah-r">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={7}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && reviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <AdminEmpty>No reported reviews — the queue is clear.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <AdminPerson name={r.reviewer_name} />
                  </TableCell>
                  <TableCell>{r.arena_name}</TableCell>
                  <TableCell>
                    <Stars rating={r.rating} />
                  </TableCell>
                  <TableCell>
                    <div>{r.review_text ?? "(no text)"}</div>
                  </TableCell>
                  <TableCell>
                    <div>{r.flag_reason}</div>
                    {r.reporter_name && <div className="ah-sub">by {r.reporter_name}</div>}
                  </TableCell>
                  <TableCell className="ah-t2 tabular-nums">
                    {r.flagged_at ? formatDate(r.flagged_at.slice(0, 10)) : "—"}
                  </TableCell>
                  <TableCell className="ah-r">
                    <div className="ah-row-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={dismiss.isPending}
                        onClick={() => onDismiss(r)}
                      >
                        Dismiss
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleting(r)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data && data.total > 0 && (
            <AdminTableFoot
              from={(page - 1) * data.page_size + 1}
              to={Math.min(page * data.page_size, data.total)}
              total={data.total}
              page={page}
              pageCount={totalPages}
              onPage={setPage}
            />
          )}
        </section>
      </div>

      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this review?</DialogTitle>
          </DialogHeader>
          <p className="ah-mute" style={{ margin: 0, fontSize: 13 }}>
            The review by <span className="ah-strong">{deleting?.reviewer_name}</span> on{" "}
            <span className="ah-strong">{deleting?.arena_name}</span> will be permanently removed
            and the arena&apos;s rating recomputed. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={onDelete}>
              {remove.isPending ? "Deleting…" : "Delete Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
