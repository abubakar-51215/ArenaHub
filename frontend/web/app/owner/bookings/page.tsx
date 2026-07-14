"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApprovePayment, usePendingApprovals, useRejectPayment } from "@/hooks/useDashboard";
import { ApiError } from "@/services/api";
import type { PendingApproval } from "@/types";

export default function BookingsPage() {
  const { data, isLoading } = usePendingApprovals(1, 50);
  const approve = useApprovePayment();
  const reject = useRejectPayment();

  const items = data?.items ?? [];
  const [rejecting, setRejecting] = useState<PendingApproval | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApprove(item: PendingApproval) {
    if (!item.payment_id) return;
    setError(null);
    try {
      await approve.mutateAsync(item.payment_id);
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

  return (
    <>
      <PageHeader title="Booking Approvals" />
      <div className="space-y-4 p-8">
        <p className="text-sm text-muted-foreground">
          Bank transfer bookings across all your arenas wait here until you approve or reject the
          receipt. Card, JazzCash, and EasyPaisa payments confirm automatically and never appear in
          this queue.
        </p>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={7}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={7}>
                    Nothing waiting on you right now.
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.booking_id}>
                  <TableCell className="font-medium text-foreground">{item.player_name}</TableCell>
                  <TableCell>{item.arena_name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.booking_date}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}
                  </TableCell>
                  <TableCell>Rs. {item.total_amount}</TableCell>
                  <TableCell>
                    {item.receipt_proof_url ? (
                      <a
                        href={item.receipt_proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                      >
                        View <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Approve"
                        disabled={approve.isPending}
                        onClick={() => onApprove(item)}
                      >
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Reject"
                        disabled={reject.isPending}
                        onClick={() => setRejecting(item)}
                      >
                        <XCircle className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

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
