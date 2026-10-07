"use client";

import { useEffect, useState } from "react";

import { ArenaDetailDialog } from "@/components/admin/arena-detail";
import { PageHeader } from "@/components/admin/page-header";
import { AdminBadge, AdminEmpty, AdminTableFoot } from "@/components/admin/ui";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useArenaQueue, useArenaVerification } from "@/hooks/useAdmin";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { Arena, ArenaStatus } from "@/types";

export default function AdminArenasPage() {
  const [status, setStatus] = useState<ArenaStatus>("pending");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useArenaQueue(status, page);
  const { approve, reject } = useArenaVerification();

  const [rejecting, setRejecting] = useState<Arena | null>(null);
  const [viewing, setViewing] = useState<Arena | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The tab label shows the live pending-queue depth, not a per-tab-switch
  // recomputation — it only updates when a *pending* fetch actually resolves
  // (gated on !isFetching so a stale cached value isn't briefly shown while a
  // background refetch is in flight), so it stays correct while viewing
  // Approved/Rejected instead of reading 0 (no pending data is in memory on
  // those tabs) or undercounting from a single page of items.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    if (status === "pending" && data && !isFetching) setPendingCount(data.total);
  }, [status, data, isFetching]);

  const arenas = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  async function onReject(reason: string) {
    if (!rejecting) return;
    setError(null);
    try {
      await reject.mutateAsync({ arenaId: rejecting.id, reason });
      setRejecting(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject the arena.");
    }
  }

  return (
    <>
      <PageHeader
        title="Arena approvals"
        subtitle="Verify documents and photos before an arena can sell slots"
      />

      <div className="animate-fade-in">
        <section className="ah-card">
          <Tabs
            value={status}
            onValueChange={(v) => {
              setStatus(v as ArenaStatus);
              setPage(1);
            }}
          >
            <TabsList variant="line">
              <TabsTrigger value="pending">
                Pending
                {pendingCount !== null && <span className="ah-tab-count">{pendingCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arena</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="ah-r">Decision</TableHead>
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
              {!isLoading && arenas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <AdminEmpty>No arenas in this queue.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {arenas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="ah-thumb" aria-hidden="true" />
                      <div>
                        <div className="ah-strong">{a.name}</div>
                        {a.sports_offered?.length > 0 && (
                          <div className="ah-sub">
                            {a.sports_offered
                              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                              .join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{a.city}</TableCell>
                  <TableCell className="ah-t2">{a.address}</TableCell>
                  <TableCell className="ah-t2 tabular-nums">
                    {formatDate(a.created_at.slice(0, 10))}
                  </TableCell>
                  <TableCell>
                    <AdminBadge status={a.status} />
                  </TableCell>
                  <TableCell className="ah-r">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(a)}>
                        View
                      </Button>
                      {a.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            className="ah-lime"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(a.id)}
                          >
                            Approve
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => setRejecting(a)}>
                            Reject
                          </Button>
                        </>
                      )}
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

      <ArenaDetailDialog
        arena={viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        actions={
          viewing?.status === "pending" ? (
            <>
              <Button
                variant="destructive"
                onClick={() => {
                  setRejecting(viewing);
                  setViewing(null);
                }}
              >
                Reject
              </Button>
              <Button
                className="ah-lime"
                disabled={approve.isPending}
                onClick={() => approve.mutate(viewing.id, { onSuccess: () => setViewing(null) })}
              >
                Approve
              </Button>
            </>
          ) : undefined
        }
      />

      <TextInputDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title="Reject arena"
        description={rejecting ? `${rejecting.name} will be notified with your reason.` : undefined}
        placeholder="Reason for rejection…"
        confirmLabel="Reject Arena"
        destructive
        pending={reject.isPending}
        error={error}
        onSubmit={onReject}
      />
    </>
  );
}
