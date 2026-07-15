"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
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
import { useArenaQueue, useArenaVerification } from "@/hooks/useAdmin";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { Arena, ArenaStatus } from "@/types";

export default function AdminArenasPage() {
  const [status, setStatus] = useState<ArenaStatus>("pending");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useArenaQueue(status, page);
  const { approve, reject } = useArenaVerification();

  const [rejecting, setRejecting] = useState<Arena | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <PageHeader title="Arena Verification">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ArenaStatus);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </PageHeader>

      <div className="space-y-4 p-8">
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arena</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Submitted On</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
              {!isLoading && arenas.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No arenas in this queue.
                  </TableCell>
                </TableRow>
              )}
              {arenas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-foreground">{a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.city}</TableCell>
                  <TableCell className="text-muted-foreground">{a.address}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(a.created_at.slice(0, 10))}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {a.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            className="bg-blue-600 text-white hover:bg-blue-700"
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
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * data.page_size + 1}–
              {Math.min(page * data.page_size, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
