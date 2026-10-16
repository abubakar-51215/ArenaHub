"use client";

/**
 * Owner Arenas, laid out as the owner prototype's Arenas table: initials,
 * name and area, city, courts, this month's occupancy bar and revenue, a
 * status badge and the row actions. Courts come from each arena's court
 * list, revenue from the revenue breakdown by arena, occupancy from the
 * analytics for that arena, all for the month so far. Arenas an admin
 * suspended or removed show the admin's note and their actions stay
 * disabled. The list is not paged by the app, so there is no pager.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import {
  AdminAvatar,
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTableFoot,
} from "@/components/admin/ui";
import { ArenaForm } from "@/components/owner/arena-form";
import { PageHeader } from "@/components/owner/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormDialog } from "@/hooks/useFormDialog";
import { useDeactivateArena, useMyArenas, useResubmitArena } from "@/hooks/useArenas";
import { useRevenue } from "@/hooks/useDashboard";
import { formatRs, plural, toDateInput } from "@/lib/format";
import { listCourts } from "@/services/courts";
import { getDashboardAnalytics } from "@/services/dashboard";
import type { Arena } from "@/types";

type Lock = { removed: boolean; suspended: boolean; locked: boolean; title: string };

function lockOf(a: Arena): Lock {
  // set by an admin: a suspended arena is locked here until the admin lifts
  // it; a removed one is read-only for good
  const removed = !!a.deleted_at;
  const suspended = !removed && !!a.suspended_at;
  return {
    removed,
    suspended,
    locked: removed || suspended,
    title: removed ? "Removed by admin" : "Suspended by admin — changes are locked",
  };
}

function ArenaStatus({ a, lock }: { a: Arena; lock: Lock }) {
  if (lock.removed) return <AdminBadge tone="idle">Removed</AdminBadge>;
  if (lock.suspended) return <AdminBadge tone="off">Suspended</AdminBadge>;
  if (a.status === "pending") return <AdminBadge tone="wait">Awaiting review</AdminBadge>;
  if (a.status === "rejected") return <AdminBadge tone="off">Rejected</AdminBadge>;
  if (!a.is_active) return <AdminBadge tone="idle">Switched off</AdminBadge>;
  return <AdminBadge tone="ok">Taking bookings</AdminBadge>;
}

/** The admin's note, a rejection reason, or the switched-off line. */
function ArenaNote({ a, lock }: { a: Arena; lock: Lock }) {
  if (lock.removed)
    return (
      <div className="ah-note ah-note-off">
        Removed by admin{a.deleted_reason ? `: ${a.deleted_reason}` : ""}
      </div>
    );
  if (lock.suspended)
    return (
      <div className="ah-note ah-note-off">
        Suspended by admin{a.suspended_reason ? `: ${a.suspended_reason}` : ""}
      </div>
    );
  if (a.status === "rejected" && a.rejection_reason)
    return <div className="ah-note ah-note-off">Rejected: {a.rejection_reason}</div>;
  if (!a.is_active) return <div className="ah-note">Inactive (hidden from search)</div>;
  return null;
}

export default function ArenasPage() {
  const { data, isLoading, isError, refetch } = useMyArenas();
  const deactivate = useDeactivateArena();
  const resubmit = useResubmitArena();
  const [formOpen, setFormOpen] = useFormDialog();
  const [editing, setEditing] = useState<Arena | undefined>(undefined);
  const [search, setSearch] = useState("");

  const arenas = useMemo(() => data?.items ?? [], [data]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return arenas;
    return arenas.filter((a) =>
      [a.name, a.city, a.area ?? "", a.address].some((s) => s.toLowerCase().includes(q)),
    );
  }, [arenas, search]);

  // the month so far, for occupancy and revenue
  const month = useMemo(() => {
    const now = new Date();
    return {
      from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toDateInput(now),
      label: now.toLocaleDateString("en-GB", { month: "short" }),
    };
  }, []);

  const courtQueries = useQueries({
    queries: arenas.map((a) => ({ queryKey: ["courts", a.id], queryFn: () => listCourts(a.id) })),
  });
  const occupancyQueries = useQueries({
    queries: arenas.map((a) => ({
      queryKey: ["dashboard-analytics", month.from, month.to, "", a.id],
      queryFn: () =>
        getDashboardAnalytics({ dateFrom: month.from, dateTo: month.to, arenaId: a.id }),
    })),
  });
  const revenue = useRevenue({ dateFrom: month.from, dateTo: month.to });

  const courtCount = new Map(arenas.map((a, i) => [a.id, courtQueries[i]?.data?.length]));
  const occupancy = new Map(
    arenas.map((a, i) => [a.id, occupancyQueries[i]?.data?.occupancy_rate]),
  );
  const revenueByArena = new Map(
    (revenue.data?.breakdown_by_arena ?? []).map((r) => [r.id, r.amount]),
  );

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(a: Arena) {
    setEditing(a);
    setFormOpen(true);
  }

  const actions = (a: Arena, lock: Lock) => (
    <div className="ah-row-actions">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openEdit(a)}
        title={lock.locked ? lock.title : undefined}
        disabled={lock.locked}
      >
        Edit
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/owner/courts?arena=${a.id}`}>Courts</Link>
      </Button>
      {a.status === "rejected" && (
        <Button
          variant="outline"
          size="sm"
          title={lock.locked ? lock.title : "Send it back for verification"}
          disabled={lock.locked || resubmit.isPending}
          onClick={() => resubmit.mutate(a.id)}
        >
          Resubmit
        </Button>
      )}
      {a.is_active && (
        <ActionButton
          tone="negative"
          variant="destructive"
          size="sm"
          title={lock.locked ? lock.title : "Hide it from search"}
          disabled={lock.locked || deactivate.isPending}
          busy={deactivate.isPending && deactivate.variables === a.id}
          failed={deactivate.isError}
          onClick={() => {
            if (confirm(`Deactivate “${a.name}”? It will be hidden from search.`))
              deactivate.mutate(a.id);
          }}
        >
          Deactivate
        </ActionButton>
      )}
    </div>
  );

  const occ = (a: Arena) => {
    const v = occupancy.get(a.id);
    if (v == null) return <span className="ah-mute">—</span>;
    return (
      <div className="ah-occ">
        <div className="ah-rank-bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
        </div>
        <span className="tabular-nums">{v}%</span>
      </div>
    );
  };
  const money = (a: Arena) => {
    const v = revenueByArena.get(a.id);
    return v && Number(v) > 0 ? formatRs(v) : "—";
  };
  const courtsLine = (a: Arena) => {
    const n = courtCount.get(a.id);
    return n == null ? "—" : String(n);
  };

  return (
    <>
      <PageHeader
        title="Arenas"
        subtitle={
          data
            ? `${plural(arenas.length, "arena")}${arenas.length ? ` · ${[...new Set(arenas.map((a) => a.city))].join(", ")}` : ""}`
            : undefined
        }
      >
        <Input
          className="ah-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search arenas"
          aria-label="Search arenas"
        />
        <Button className="ah-lime" onClick={openCreate}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add arena
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in">
        <AdminCard>
          {isLoading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
          {isError && !data && (
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load your arenas.</span>
                <button type="button" className="ah-link" onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {data && shown.length === 0 && (
            <AdminEmpty>
              {arenas.length === 0
                ? "No arenas yet. Click “Add arena” to register your first one."
                : "No arena matches that search."}
            </AdminEmpty>
          )}
          {shown.length > 0 && (
            <>
              <div className="ah-only-wide">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arena</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Courts</TableHead>
                      <TableHead>Occupancy</TableHead>
                      <TableHead className="ah-r">Revenue · {month.label}</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="ah-r">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((a) => {
                      const lock = lockOf(a);
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <AdminAvatar name={a.name} />
                              <div className="min-w-0">
                                <div className="ah-strong">{a.name}</div>
                                {(a.area ?? a.address) && (
                                  <div className="ah-sub">{a.area ?? a.address}</div>
                                )}
                                <ArenaNote a={a} lock={lock} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{a.city}</TableCell>
                          <TableCell className="tabular-nums">{courtsLine(a)}</TableCell>
                          <TableCell>{occ(a)}</TableCell>
                          <TableCell className="ah-r ah-money">{money(a)}</TableCell>
                          <TableCell>
                            <ArenaStatus a={a} lock={lock} />
                          </TableCell>
                          <TableCell className="ah-r">{actions(a, lock)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ul className="ah-cards">
                {shown.map((a) => {
                  const lock = lockOf(a);
                  return (
                    <li key={a.id}>
                      <div className="ah-card-line">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <AdminAvatar name={a.name} />
                          <div className="min-w-0">
                            <div className="ah-strong">{a.name}</div>
                            <div className="ah-sub">
                              {a.area ? `${a.area}, ` : ""}
                              {a.city}
                            </div>
                          </div>
                        </div>
                        <ArenaStatus a={a} lock={lock} />
                      </div>
                      <ArenaNote a={a} lock={lock} />
                      <div className="ah-card-line">
                        <span>
                          {courtCount.get(a.id) != null
                            ? plural(courtCount.get(a.id) as number, "court")
                            : "—"}
                        </span>
                        {money(a) === "—" ? (
                          <span className="ah-sub">No revenue in {month.label}</span>
                        ) : (
                          <span className="ah-money">
                            {money(a)} <span className="ah-sub">in {month.label}</span>
                          </span>
                        )}
                      </div>
                      {occupancy.get(a.id) != null && (
                        <div className="ah-card-line">
                          <span className="ah-sub">Occupancy</span>
                          {occ(a)}
                        </div>
                      )}
                      {actions(a, lock)}
                    </li>
                  );
                })}
              </ul>
              <AdminTableFoot from={1} to={shown.length} total={shown.length} />
            </>
          )}
        </AdminCard>
      </div>

      {formOpen && (
        <ArenaForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arena={editing}
        />
      )}
    </>
  );
}
