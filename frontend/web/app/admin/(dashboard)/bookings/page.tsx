"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { AdminBadge, AdminEmpty, AdminPerson, AdminTableFoot, statusLabel } from "@/components/admin/ui";
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
      <PageHeader title="Booking monitoring" subtitle="Every booking on the network">
        <Select
          value={status}
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
                <TableHead>Player</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead className="ah-r">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={6}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <AdminEmpty>No bookings found.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {bookings.map((b) => (
                <TableRow key={b.id}>
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
    </>
  );
}
