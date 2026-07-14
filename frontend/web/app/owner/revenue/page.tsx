"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { PageHeader } from "@/components/owner/page-header";
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
import { useRevenue } from "@/hooks/useDashboard";
import { listCourts } from "@/services/courts";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function RevenuePage() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const arenaNames = useMemo(() => new Map(arenas.map((a) => [a.id, a.name])), [arenas]);

  const [arenaId, setArenaId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: revenue, isLoading } = useRevenue({
    arenaId: arenaId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  // Court names are needed for the by-court breakdown, which can span every
  // owned arena when no single arena is selected — fetch all of them.
  const courtQueries = useQueries({
    queries: arenas.map((a) => ({ queryKey: ["courts", a.id], queryFn: () => listCourts(a.id) })),
  });
  const courtNames = useMemo(() => {
    const map = new Map<string, string>();
    courtQueries.forEach((q) => (q.data ?? []).forEach((c) => map.set(c.id, c.name)));
    return map;
  }, [courtQueries]);

  return (
    <>
      <PageHeader title="Revenue & Earnings" />
      <div className="space-y-6 p-8">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Arena</label>
            <Select value={arenaId} onChange={(e) => setArenaId(e.target.value)} className="w-64">
              <option value="">All arenas</option>
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
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-44"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Total Revenue"
            value={isLoading ? "—" : `Rs. ${revenue?.total_revenue ?? "0.00"}`}
          />
          <StatCard
            label="Pending Settlements"
            value={isLoading ? "—" : `Rs. ${revenue?.pending_settlements ?? "0.00"}`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">By Arena</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arena</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!revenue || revenue.breakdown_by_arena.length === 0) && (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={2}>
                      {isLoading ? "Loading…" : "No revenue in this range yet."}
                    </TableCell>
                  </TableRow>
                )}
                {revenue?.breakdown_by_arena.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-foreground">
                      {arenaNames.get(row.id) ?? row.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right">Rs. {row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">By Court</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Court</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!revenue || revenue.breakdown_by_court.length === 0) && (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={2}>
                      {isLoading ? "Loading…" : "No revenue in this range yet."}
                    </TableCell>
                  </TableRow>
                )}
                {revenue?.breakdown_by_court.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-foreground">
                      {courtNames.get(row.id) ?? row.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right">Rs. {row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
