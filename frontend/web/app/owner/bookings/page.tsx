"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { ReceiptReviewDialog } from "@/components/owner/receipt-review-dialog";
import { StatusBadge } from "@/components/owner/status-badge";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { useApprovePayment, useOwnerBookings, useRejectPayment } from "@/hooks/useDashboard";
import { formatDate, formatRs, formatTime } from "@/lib/format";
import { ApiError } from "@/services/api";
import { listCourts } from "@/services/courts";
import type { BookingStatus, OwnerBookingRow } from "@/types";

const PAGE_SIZE = 10;

const STATUSES: BookingStatus[] = [
  "pending_payment",
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
];

function exportCsv(rows: OwnerBookingRow[]) {
  const header = "Booking ID,Date,Time,Arena,Court,Customer,Amount,Status";
  const lines = rows.map((r) =>
    [
      r.booking_id,
      r.booking_date,
      `${r.start_time} - ${r.end_time}`,
      `"${r.arena_name}"`,
      `"${r.court_name}"`,
      `"${r.player_name}"`,
      r.total_amount,
      r.status,
    ].join(","),
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bookings.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BookingsPage() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  const [arenaId, setArenaId] = useState("");
  const [courtId, setCourtId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Court filter options: the selected arena's courts, or every court when
  // "All Arenas" is active.
  const courtScope = arenaId ? arenas.filter((a) => a.id === arenaId) : arenas;
  const courtQueries = useQueries({
    queries: courtScope.map((a) => ({
      queryKey: ["courts", a.id],
      queryFn: () => listCourts(a.id),
    })),
  });
  const courts = courtQueries.flatMap((q) => q.data ?? []);

  const { data, isLoading } = useOwnerBookings({
    arenaId: arenaId || undefined,
    courtId: courtId || undefined,
    status: (status || undefined) as BookingStatus | undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const [rejecting, setRejecting] = useState<OwnerBookingRow | null>(null);
  const [reviewing, setReviewing] = useState<OwnerBookingRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApprove(row: OwnerBookingRow) {
    if (!row.payment_id) return;
    setError(null);
    try {
      await approve.mutateAsync(row.payment_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not approve this payment.");
    }
  }

  async function onReject(reason: string) {
    if (!rejecting?.payment_id) return;
    setError(null);
    try {
      await reject.mutateAsync({ paymentId: rejecting.payment_id, reason });
      setRejecting(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject this payment.");
    }
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }
  const setArena = resetPage<string>((v) => {
    setArenaId(v);
    setCourtId("");
  });

  return (
    <>
      <PageHeader title="Booking Management" />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={arenaId} onChange={(e) => setArena(e.target.value)} className="w-44">
            <option value="">All Arenas</option>
            {arenas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select
            value={courtId}
            onChange={(e) => resetPage(setCourtId)(e.target.value)}
            className="w-40"
          >
            <option value="">All Courts</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value)}
            className="w-44"
          >
            <option value="">All Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => resetPage(setDateFrom)(e.target.value)}
            className="w-38"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => resetPage(setDateTo)(e.target.value)}
            className="w-38"
          />
          <div className="ml-auto">
            <Button variant="outline" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
              <Download className="size-4" /> Export
            </Button>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="shadow-card overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={9}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={9}>
                    No bookings match these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.booking_id}>
                  <TableCell className="font-medium text-foreground">
                    #BK-{row.booking_id.slice(0, 4).toUpperCase()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.booking_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTime(row.start_time)} – {formatTime(row.end_time)}
                  </TableCell>
                  <TableCell>{row.arena_name}</TableCell>
                  <TableCell>{row.court_name}</TableCell>
                  <TableCell>{row.player_name}</TableCell>
                  <TableCell>{formatRs(row.total_amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {row.receipt_proof_url && (
                        <button
                          type="button"
                          onClick={() => setReviewing(row)}
                          title="Verify receipt against bank details"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="size-4" />
                        </button>
                      )}
                      {row.status === "pending_approval" && row.payment_id && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Approve"
                            disabled={approve.isPending}
                            onClick={() => onApprove(row)}
                          >
                            <CheckCircle2 className="size-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Reject"
                            disabled={reject.isPending}
                            onClick={() => setRejecting(row)}
                          >
                            <XCircle className="size-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-sm text-muted-foreground">
              Showing {showingFrom} to {showingTo} of {total} entries
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="icon-sm"
                  className={
                    p === page
                      ? "bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
                      : ""
                  }
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              {pageCount > 5 && <span className="px-1 text-sm text-muted-foreground">…</span>}
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ReceiptReviewDialog row={reviewing} onOpenChange={(v) => !v && setReviewing(null)} />

      <TextInputDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title="Reject this receipt?"
        description={
          rejecting
            ? `${rejecting.player_name}'s slot will be released and the booking marked rejected.`
            : undefined
        }
        placeholder="Reason for rejection (e.g. receipt amount doesn't match)."
        confirmLabel="Reject"
        destructive
        pending={reject.isPending}
        onSubmit={onReject}
      />
    </>
  );
}
