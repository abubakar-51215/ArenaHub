"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import {
  AdminBadge,
  AdminEmpty,
  AdminPerson,
  AdminTableFoot,
  statusLabel,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { AdminBooking, BookingStatus } from "@/types";

const STATUSES: BookingStatus[] = [
  "pending_payment",
  "pending_approval",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
];

type Period = "" | "today" | "7d" | "30d";

/** Calendar dates are Asia/Karachi dates, as on the backend. */
function karachiDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d);
}

/** The period filters the slot date (booking_date), up to and including today. */
function periodRange(period: Period): { date_from?: string; date_to?: string } {
  if (!period) return {};
  const today = karachiDate();
  if (period === "today") return { date_from: today, date_to: today };
  return { date_from: karachiDate(period === "7d" ? -6 : -29), date_to: today };
}

/** The owner panel's booking reference, so one booking reads the same in both. */
function bookingRef(id: string): string {
  return `#BK-${id.slice(0, 4).toUpperCase()}`;
}

export default function AdminBookingsPage() {
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [period, setPeriod] = useState<Period>("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<AdminBooking | null>(null);
  const { data, isLoading } = useAllBookings({
    status: status || undefined,
    ...periodRange(period),
    page,
  });

  const bookings = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader title="Booking monitoring" subtitle="Every booking on the network">
        <Select
          value={period}
          aria-label="Period"
          onChange={(e) => {
            setPeriod(e.target.value as Period);
            setPage(1);
          }}
        >
          <option value="">Any date</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </Select>
        <Select
          value={status}
          aria-label="Status"
          onChange={(e) => {
            setStatus(e.target.value as BookingStatus | "");
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="animate-fade-in">
        <section className="ah-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead className="ah-r">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="ah-r">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={8}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <AdminEmpty>No bookings found.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="ah-strong tabular-nums">{bookingRef(b.id)}</TableCell>
                  <TableCell>
                    <AdminPerson name={b.player_name} />
                  </TableCell>
                  <TableCell>{b.arena_name}</TableCell>
                  <TableCell className="ah-t2">{b.court_name}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(b.booking_date)} · {formatTime(b.start_time)}
                  </TableCell>
                  <TableCell className="ah-r ah-money">{formatRs(b.total_amount)}</TableCell>
                  <TableCell>
                    <AdminBadge status={b.status} />
                  </TableCell>
                  <TableCell className="ah-r">
                    <div className="ah-row-actions">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(b)}>
                        View
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

      {/* everything shown is on the row already: no extra request */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing ? `Booking ${bookingRef(viewing.id)}` : ""}</DialogTitle>
            <DialogDescription>{viewing?.arena_name}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="ah-detail">
              <dt>Status</dt>
              <dd>
                <AdminBadge status={viewing.status} />
              </dd>
              <dt>Player</dt>
              <dd>{viewing.player_name}</dd>
              <dt>Court</dt>
              <dd>{viewing.court_name}</dd>
              <dt>Slot</dt>
              <dd className="tabular-nums">
                {formatDate(viewing.booking_date)} · {formatTime(viewing.start_time)}–
                {formatTime(viewing.end_time)}
              </dd>
              <dt>Amount</dt>
              <dd className="tabular-nums">{formatRs(viewing.total_amount)}</dd>
              <dt>Payment</dt>
              <dd>
                {viewing.payment_type === "full" ? "Paid in full" : "Advance, rest at the arena"}
              </dd>
              <dt>Booked on</dt>
              <dd className="tabular-nums">{formatDate(viewing.created_at.slice(0, 10))}</dd>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
