"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
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
import { useCourts } from "@/hooks/useCourts";
import { useCalendar } from "@/hooks/useDashboard";

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const { data: arenaPage } = useMyArenas();
  const arenas = arenaPage?.items ?? [];

  const [arenaId, setArenaId] = useState("");
  const activeArena = arenaId || arenas[0]?.id || "";

  const today = useMemo(() => new Date(), []);
  const weekAhead = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 6);
    return d;
  }, [today]);

  const [from, setFrom] = useState(toDateInput(today));
  const [to, setTo] = useState(toDateInput(weekAhead));

  const { data: bookings, isLoading } = useCalendar(activeArena || null, from, to);
  const rows = bookings ?? [];

  const { data: courts } = useCourts(activeArena || null);
  const courtNames = useMemo(() => new Map((courts ?? []).map((c) => [c.id, c.name])), [courts]);

  return (
    <>
      <PageHeader title="Booking Calendar" />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Arena</label>
            <Select
              value={activeArena}
              onChange={(e) => setArenaId(e.target.value)}
              className="w-64"
            >
              {arenas.length === 0 && <option value="">No arenas yet</option>}
              {arenas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!activeArena && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    Add an arena first.
                  </TableCell>
                </TableRow>
              )}
              {activeArena && isLoading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {activeArena && !isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    No bookings in this date range.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium text-foreground">{b.booking_date}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {b.start_time.slice(0, 5)} – {b.end_time.slice(0, 5)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {courtNames.get(b.court_id) ?? b.court_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>Rs. {b.total_amount}</TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
