"use client";

/**
 * Owner Bookings, laid out as the owner prototype's Bookings screen: page
 * head with filters and Export, then one card with the bookings table and
 * the pager (the API pages). The arena comes from the top bar's picker
 * (`?arena=`). Left out, as the API has no data for them: the KPI strip
 * totals, the customer's phone, the payment-method column and "Remind".
 */
import { Suspense, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { AdminBadge, AdminCard, AdminEmpty, AdminPerson, AdminTableFoot, statusLabel } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { ReceiptReviewDialog } from "@/components/owner/receipt-review-dialog";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { ActionButton } from "@/components/ui/action-button";
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
import { useArenaParam } from "@/hooks/useArenaParam";
import { useApprovePayment, useOwnerBookings, useRejectPayment } from "@/hooks/useDashboard";
import { formatDateShort, formatRs, formatTime, plural } from "@/lib/format";
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

function bookingRef(id: string): string {
  return `#BK-${id.slice(0, 4).toUpperCase()}`;
}

function rangeLine(from: string, to: string): string {
  if (from && to) return `${formatDateShort(from)} – ${formatDateShort(to)}`;
  if (from) return `from ${formatDateShort(from)}`;
  if (to) return `until ${formatDateShort(to)}`;
  return "all dates";
}

function Bookings() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [arenaId] = useArenaParam();

  // the court filter and the page belong to one arena choice: when the
  // picker changes, they fall back to "all courts" and page 1
  const [scoped, setScoped] = useState({ arena: arenaId, courtId: "", page: 1 });
  const courtId = scoped.arena === arenaId ? scoped.courtId : "";
  const page = scoped.arena === arenaId ? scoped.page : 1;
  const setCourtId = (v: string) => setScoped({ arena: arenaId, courtId: v, page: 1 });
  const setPage = (p: number) => setScoped({ arena: arenaId, courtId, page: p });

  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // court options: the chosen arena's courts, or every court for "All arenas"
  const courtScope = arenaId ? arenas.filter((a) => a.id === arenaId) : arenas;
  const courtQueries = useQueries({
    queries: courtScope.map((a) => ({
      queryKey: ["courts", a.id],
      queryFn: () => listCourts(a.id),
    })),
  });
  const courts = courtQueries.flatMap((q) => q.data ?? []);

  const { data, isLoading, isError, refetch } = useOwnerBookings({
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

  const filtered = !!(courtId || status || dateFrom || dateTo);

  const slotTime = (row: OwnerBookingRow) => `${formatTime(row.start_time)} – ${formatTime(row.end_time)}`;

  // the same buttons in the table row and the phone card
  const actions = (row: OwnerBookingRow) => (
    <div className="ah-row-actions">
      {row.receipt_proof_url && (
        <Button
          variant="ghost"
          size="sm"
          title="Check the receipt against your bank details"
          onClick={() => setReviewing(row)}
        >
          Receipt
        </Button>
      )}
      {row.status === "pending_approval" && row.payment_id && (
        <>
          <ActionButton
            tone="positive"
            size="sm"
            className="ah-lime"
            disabled={approve.isPending}
            busy={approve.isPending && approve.variables === row.payment_id}
            failed={approve.isError}
            onClick={() => onApprove(row)}
          >
            Approve
          </ActionButton>
          <ActionButton
            tone="negative"
            variant="destructive"
            size="sm"
            disabled={reject.isPending}
            onClick={() => setRejecting(row)}
          >
            Reject
          </ActionButton>
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle={data ? `${plural(total, "booking")} · ${rangeLine(dateFrom, dateTo)}` : undefined}
      >
        <Select value={courtId} onChange={(e) => setCourtId(e.target.value)} aria-label="Court">
          <option value="">All courts</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          aria-label="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          aria-label="To"
        />
        <Button variant="outline" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {error && (
          <div className="ah-card-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <AdminCard>
          {isLoading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
          {isError && !data && (
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load your bookings.</span>
                <button type="button" className="ah-link" onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {data && rows.length === 0 && (
            <AdminEmpty>{filtered ? "No bookings match these filters." : "No bookings yet."}</AdminEmpty>
          )}
          {rows.length > 0 && (
            <>
              <div className="ah-only-wide">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Court</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead className="ah-r">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="ah-r">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.booking_id}>
                        <TableCell className="ah-strong tabular-nums">{bookingRef(row.booking_id)}</TableCell>
                        <TableCell>
                          <AdminPerson name={row.player_name} />
                        </TableCell>
                        <TableCell>
                          <div className="ah-strong">{row.court_name}</div>
                          <div className="ah-sub">{row.arena_name}</div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          <div>{formatDateShort(row.booking_date)}</div>
                          <div className="ah-sub">{slotTime(row)}</div>
                        </TableCell>
                        <TableCell className="ah-r ah-money">{formatRs(row.total_amount)}</TableCell>
                        <TableCell>
                          <AdminBadge status={row.status} />
                        </TableCell>
                        <TableCell className="ah-r">{actions(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="ah-cards">
                {rows.map((row) => (
                  <li key={row.booking_id}>
                    <div className="ah-card-line">
                      <span className="ah-strong tabular-nums">{bookingRef(row.booking_id)}</span>
                      <AdminBadge status={row.status} />
                    </div>
                    <AdminPerson name={row.player_name} />
                    <div>
                      <div>
                        {row.court_name} · {row.arena_name}
                      </div>
                      <div className="ah-sub tabular-nums">
                        {formatDateShort(row.booking_date)} · {slotTime(row)}
                      </div>
                    </div>
                    <div className="ah-card-line">
                      <span className="ah-money">{formatRs(row.total_amount)}</span>
                      {actions(row)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {total > 0 && (
            <AdminTableFoot
              from={(page - 1) * PAGE_SIZE + 1}
              to={Math.min(page * PAGE_SIZE, total)}
              total={total}
              page={page}
              pageCount={pageCount}
              onPage={setPage}
            />
          )}
        </AdminCard>
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
        motion
        pending={reject.isPending}
        onSubmit={onReject}
      />
    </>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <Bookings />
    </Suspense>
  );
}
