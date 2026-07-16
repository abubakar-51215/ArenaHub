"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
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
import { useAllPayments } from "@/hooks/useAdmin";
import { formatDate, formatRs } from "@/lib/format";
import type { PaymentMethod, PaymentStatus } from "@/types";

const STATUSES: PaymentStatus[] = ["pending", "completed", "failed", "refunded"];
const METHODS: PaymentMethod[] = ["card", "jazzcash", "easypaisa", "bank_transfer"];

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAllPayments({
    status: status || undefined,
    method: method || undefined,
    page,
  });

  const payments = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader title="Payment Monitoring" subtitle="Monitor all arena payments and transactions">
        <Select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as PaymentMethod | "");
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All Methods</option>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PaymentStatus | "");
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </PageHeader>

      <div className="animate-fade-in space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="shadow-card overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
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
              {!isLoading && payments.length === 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={7}>
                    No transactions found.
                  </TableCell>
                </TableRow>
              )}
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.gateway_transaction_id ?? p.id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{p.player_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.arena_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRs(p.amount)}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {p.payment_method.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(p.created_at.slice(0, 10))}
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
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
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
    </>
  );
}
