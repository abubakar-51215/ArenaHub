"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAllBookings } from "@/hooks/useAdmin";
import { formatDate, formatRs, formatTime } from "@/lib/format";
import type { BookingStatus } from "@/types";

const STATUSES: BookingStatus[] = [
  "pending_payment",
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
];

export default function AdminBookingsPage() {
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAllBookings({ status: status || undefined, page });

  const bookings = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader title="Booking Monitoring">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as BookingStatus | "");
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="space-y-4 p-8">
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && bookings.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No bookings found.
                  </TableCell>
                </TableRow>
              )}
              {bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-foreground">{b.player_name}</TableCell>
                  <TableCell className="text-muted-foreground">{b.arena_name}</TableCell>
                  <TableCell className="text-muted-foreground">{b.court_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(b.booking_date)}, {formatTime(b.start_time)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRs(b.total_amount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
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
    </>
  );
}
