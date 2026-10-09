"use client";

/**
 * Owner Reviews, laid out as the owner prototype's Reviews screen: an
 * average-rating card with the 5-to-1 star breakdown, and the review list
 * with "Needs reply" / "Replied" badges and the existing reply flow. The
 * average and count come from the rating summary endpoint (per arena, and
 * combined by review count under "All arenas"); that endpoint has no
 * breakdown, so the 5-to-1 bars are counted from the reviews loaded here,
 * leaving out reported ones as the summary does.
 * The arena comes from the top bar picker. Left out: "What people mention
 * most" (no data for it).
 */
import { Suspense, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { AdminAvatar, AdminBadge, AdminEmpty } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMyArenas } from "@/hooks/useArenas";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatDateShort, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import { getRatingSummary, listOwnerArenaReviews, respondToReview } from "@/services/reviews";
import type { Review } from "@/types";

const PAGE_SIZE_STEP = 50;

type Filter = "" | "reply" | "low";

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className="ah-stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={i < Math.round(rating) ? undefined : "off"}
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
          />
        </svg>
      ))}
    </span>
  );
}

interface TaggedReview extends Review {
  arena_name: string;
}

function ReviewsInner() {
  const qc = useQueryClient();
  const { data: arenaPage, isLoading: arenasLoading } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [arenaId] = useArenaParam();
  const picked = arenas.find((a) => a.id === arenaId);
  const scope = picked ? [picked] : arenas;

  // fetched per arena and merged; "load more" raises one shared page size
  const [pageSize, setPageSize] = useState(PAGE_SIZE_STEP);
  const reviewQueries = useQueries({
    queries: scope.map((a) => ({
      queryKey: ["reviews", a.id, pageSize],
      queryFn: async (): Promise<{ items: TaggedReview[]; total: number }> => {
        const page = await listOwnerArenaReviews(a.id, 1, pageSize);
        return { items: page.items.map((r) => ({ ...r, arena_name: a.name })), total: page.total };
      },
    })),
  });
  const summaryQueries = useQueries({
    queries: scope.map((a) => ({ queryKey: ["rating-summary", a.id], queryFn: () => getRatingSummary(a.id) })),
  });

  const loading = arenasLoading || reviewQueries.some((q) => q.isLoading);
  const failed = reviewQueries.some((q) => q.isError);
  const reviews = reviewQueries
    .flatMap((q) => q.data?.items ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const allLoaded = reviewQueries.every((q) => (q.data?.total ?? 0) <= (q.data?.items.length ?? 0));
  const canLoadMore = !allLoaded;

  // average and count: the summaries, combined by review count
  const summaries = summaryQueries.map((q) => q.data).filter((s) => !!s);
  const count = summaries.reduce((n, s) => n + s.review_count, 0);
  const weighted = summaries.reduce((n, s) => n + (s.average_rating ?? 0) * s.review_count, 0);
  const average = count ? weighted / count : null;
  const summaryLoading = summaryQueries.some((q) => q.isLoading);

  // like the summary, the breakdown leaves out reviews that were reported
  const counted = reviews.filter((r) => !r.is_flagged);
  const dist = [5, 4, 3, 2, 1].map((star) => {
    const n = counted.filter((r) => r.rating === star).length;
    return { star, n, pct: counted.length ? Math.round((n / counted.length) * 100) : 0 };
  });
  const waiting = reviews.filter((r) => !r.owner_response).length;

  const [filter, setFilter] = useState<Filter>("");
  const shown = reviews.filter((r) =>
    filter === "reply" ? !r.owner_response : filter === "low" ? r.rating <= 2 : true,
  );

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
      <PageHeader
        title="Reviews"
        subtitle={
          loading
            ? undefined
            : waiting
              ? `${plural(waiting, "review")} ${waiting === 1 ? "is" : "are"} waiting on a reply`
              : "Every review has a reply"
        }
      >
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Show">
          <option value="">All reviews</option>
          <option value="reply">Needs reply</option>
          <option value="low">1–2 stars</option>
        </Select>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {error && (
          <div className="ah-card-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        <div className="ah-grid ah-g-23">
          <section className="ah-card">
            <div className="ah-card-body">
              <p className="ah-eyebrow">Average rating</p>
              <div className="ah-score-big">
                <span className="ah-metric is-lg">{summaryLoading ? "—" : average != null ? average.toFixed(1) : "—"}</span>
                {average != null && <Stars rating={average} size={16} />}
              </div>
              <p className="ah-score-note">
                {summaryLoading
                  ? " "
                  : count
                    ? `Based on ${plural(count, "review")}${picked ? "" : " across your arenas"}`
                    : "No reviews yet"}
              </p>
              {counted.length > 0 && (
                <div className="ah-score-rows">
                  {dist.map((d) => (
                    <div key={d.star} className="ah-score-row" title={plural(d.n, "review")}>
                      <span className="tabular-nums">{d.star}★</span>
                      <div className="ah-score-track" aria-hidden="true">
                        <i style={{ width: `${d.pct}%` }} />
                      </div>
                      <span className="tabular-nums ah-r">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
              {!allLoaded && counted.length > 0 && (
                <p className="ah-score-note" style={{ marginTop: 12, marginBottom: 0 }}>
                  Breakdown of the latest {plural(counted.length, "review")}.
                </p>
              )}
            </div>
          </section>

          <section className="ah-card">
            <div className="ah-card-head">
              <h2 className="ah-h2">Recent reviews</h2>
              {waiting > 0 && filter !== "reply" && (
                <Button variant="ghost" size="sm" style={{ marginLeft: "auto" }} onClick={() => setFilter("reply")}>
                  Needs reply ({waiting})
                </Button>
              )}
            </div>
            {loading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
            {!loading && failed && (
              <div className="ah-card-body">
                <div className="ah-card-error" role="alert">
                  <span>Could not load the reviews.</span>
                  <button type="button" className="ah-link" onClick={() => reviewQueries.forEach((q) => void q.refetch())}>
                    Try again
                  </button>
                </div>
              </div>
            )}
            {!loading && !failed && shown.length === 0 && (
              <AdminEmpty>
                {reviews.length === 0 ? "No reviews yet." : "No reviews match this filter."}
              </AdminEmpty>
            )}
            {shown.map((r) => (
              <article key={r.id} className="ah-review">
                <AdminAvatar name={r.reviewer_name} />
                <div className="ah-review-b">
                  <div className="ah-review-top">
                    <b>{r.reviewer_name}</b>
                    <Stars rating={r.rating} />
                    <span className="ah-review-meta">
                      {r.arena_name} · {formatDateShort(r.created_at.slice(0, 10))}
                    </span>
                    {r.is_flagged && <AdminBadge tone="off">Reported</AdminBadge>}
                    <span className="ah-review-badge">
                      {r.owner_response ? <AdminBadge tone="idle">Replied</AdminBadge> : <AdminBadge tone="wait">Needs reply</AdminBadge>}
                    </span>
                  </div>
                  <p className="ah-review-text">{r.review_text ?? "No written review."}</p>
                  {r.owner_response && (
                    <p className="ah-review-reply">
                      <b>Your reply:</b> {r.owner_response}
                    </p>
                  )}
                  {!r.owner_response && (
                    <Button variant="outline" size="sm" className="ah-review-btn" onClick={() => setResponding(r)}>
                      Write a reply
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {canLoadMore && !loading && (
              <div className="ah-tbl-foot">
                <span>Showing the latest {plural(reviews.length, "review")}</span>
                <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + PAGE_SIZE_STEP)}>
                  Load more
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      <TextInputDialog
        open={!!responding}
        onOpenChange={(v) => !v && setResponding(null)}
        title="Reply to this review"
        description={
          responding ? `Shown publicly under ${responding.reviewer_name}'s review of ${responding.arena_name}.` : undefined
        }
        placeholder="Thanks for the feedback! We're always working to improve…"
        confirmLabel="Post reply"
        pending={pending}
        onSubmit={onRespond}
      />
    </>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={null}>
      <ReviewsInner />
    </Suspense>
  );
}
