"use client";

import { useState } from "react";

import { AdminBadge, AdminTableFoot } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { useUserBookingHistory } from "@/hooks/useAdmin";
import { formatDate, formatRs, formatTime } from "@/lib/format";

const PAGE_SIZE = 5;

/** The read-only booking history inside a person's detail: a player's own bookings, or the
 *  bookings an owner's arenas received (with the booker's first name). Rows stack on a phone. */
export function BookingHistory({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useUserBookingHistory(userId, page, PAGE_SIZE);
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section aria-labelledby="booking-history-title" className="min-w-0 space-y-2">
      <h3 id="booking-history-title" className="text-sm font-semibold text-foreground">
        {isOwner ? "Bookings received" : "Booking history"}
      </h3>

      {isOwner && data && (
        <p className="ah-sub" style={{ margin: 0 }}>
          <span className="ah-strong">Arenas:</span>{" "}
          {data.arenas.length ? data.arenas.map((a) => a.name).join(", ") : "None yet"}
        </p>
      )}

      {isLoading && <p className="ah-mute">Loading…</p>}

      {isError && (
        <div className="ah-card-error" role="alert">
          <span>Could not load the bookings.</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && data.total === 0 && (
        <p className="ah-mute" style={{ margin: 0 }}>
          {isOwner ? "No bookings received yet." : "No bookings yet."}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.items.map((b) => (
            <li key={b.id} className="space-y-1 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium text-foreground">
                  {formatDate(b.booking_date)}, {formatTime(b.start_time)} –{" "}
                  {formatTime(b.end_time)}
                </p>
                <AdminBadge status={b.status} />
              </div>
              <p className="ah-sub break-words" style={{ margin: 0 }}>
                {b.arena_name} · {b.court_name}
                {b.player_first_name ? ` · ${b.player_first_name}` : ""}
              </p>
              <p className="ah-sub tabular-nums" style={{ margin: 0 }}>
                {formatRs(b.total_amount)} · {b.booking_code}
              </p>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > PAGE_SIZE && (
        <AdminTableFoot
          from={(page - 1) * data.page_size + 1}
          to={Math.min(page * data.page_size, data.total)}
          total={data.total}
          page={page}
          pageCount={pageCount}
          onPage={setPage}
        />
      )}
    </section>
  );
}
