"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminTableFoot,
  AdminTag,
  statusLabel,
} from "@/components/admin/ui";
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
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/lib/payment-methods";
import type { PaymentMethod, PaymentStatus } from "@/types";

const STATUSES: PaymentStatus[] = ["pending", "completed", "failed", "refunded"];

type Period = "" | "this" | "last";

/** Month bounds as Asia/Karachi wall-clock times (how payment times are stored). */
function monthRange(period: Period): { date_from?: string; date_to?: string } {
  if (!period) return {};
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  const start =
    period === "this" ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m - 2, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  return { date_from: iso(start), date_to: iso(new Date(end.getTime() - 1000)) };
}

const PERIOD_TAG: Record<Period, string> = {
  "": "in total",
  this: "this month",
  last: "last month",
};

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [period, setPeriod] = useState<Period>("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAllPayments({
    status: status || undefined,
    method: method || undefined,
    ...monthRange(period),
    page,
  });

  const payments = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <>
      <PageHeader title="Payments" subtitle="Transactions and refunds">
        <Select
          value={period}
          aria-label="Period"
          onChange={(e) => {
            setPeriod(e.target.value as Period);
            setPage(1);
          }}
        >
          <option value="">Any time</option>
          <option value="this">This month</option>
          <option value="last">Last month</option>
        </Select>
        <Select
          value={method}
          aria-label="Method"
          onChange={(e) => {
            setMethod(e.target.value as PaymentMethod | "");
            setPage(1);
          }}
        >
          <option value="">All methods</option>
          {PAYMENT_METHODS.map(({ value: m }) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          aria-label="Status"
          onChange={(e) => {
            setStatus(e.target.value as PaymentStatus | "");
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
        <AdminCard
          title="Transactions"
          actions={
            data ? (
              <AdminTag>
                {data.total.toLocaleString("en-US")} {PERIOD_TAG[period]}
              </AdminTag>
            ) : undefined
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Arena</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="ah-r">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell className="ah-mute" colSpan={7}>
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <AdminEmpty>No transactions found.</AdminEmpty>
                  </TableCell>
                </TableRow>
              )}
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="ah-strong tabular-nums">
                    <span className="ah-txid" title={p.gateway_transaction_id ?? p.id}>
                      {p.gateway_transaction_id ?? p.id.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell>{p.player_name}</TableCell>
                  <TableCell className="ah-t2">{p.arena_name ?? "—"}</TableCell>
                  <TableCell>
                    {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                  </TableCell>
                  <TableCell className="ah-r ah-money">{formatRs(p.amount)}</TableCell>
                  <TableCell>
                    <span className="ah-badges">
                      <AdminBadge status={p.status} />
                      {p.refund_pending && <AdminBadge tone="wait">Pending refund</AdminBadge>}
                    </span>
                  </TableCell>
                  <TableCell className="ah-t2 tabular-nums">
                    {formatDate(p.created_at.slice(0, 10))}
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
        </AdminCard>
      </div>
    </>
  );
}
