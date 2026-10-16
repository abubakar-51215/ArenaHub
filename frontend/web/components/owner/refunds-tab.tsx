"use client";

/**
 * The Refunds tab of Payments (design/prototypes/arena-hub-owner-refunds.html). A player who cancelled after paying by bank
 * transfer is owed money; the owner sends it and taps "Mark as paid". Only the owner's own arenas are listed (the server
 * decides). The button is shown for a pending bank-transfer refund only; a double click sends one request; the confirm
 * dialog closes with Esc or a click outside, takes focus when it opens and gives it back when it closes.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AdminBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnerRefunds } from "@/hooks/useOwnerRefunds";
import { formatDateShort, formatRs, formatTime, plural, joinParts } from "@/lib/format";
import { ApiError } from "@/services/api";
import { markRefundPaid, type RefundFilter } from "@/services/refunds";
import type { Arena, OwnerRefund } from "@/types";

const FILTERS: { key: RefundFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "processed", label: "Paid" },
  { key: "all", label: "All" },
];

/** "2026-10-12T16:15:00" (the server's own clock, Karachi) as "12 Oct, 4:15 PM". */
function when(ts: string): string {
  const [date, time] = ts.slice(0, 19).split("T");
  return `${formatDateShort(date)}, ${formatTime(time ?? "00:00:00")}`;
}
const bookingWhen = (r: OwnerRefund) =>
  `${formatDateShort(r.booking_date)} · ${formatTime(r.start_time)} – ${formatTime(r.end_time)}`;

function StatusBadge({ r }: { r: OwnerRefund }) {
  if (r.status === "pending") return <AdminBadge tone="wait">Waiting for you</AdminBadge>;
  if (r.status === "failed") return <AdminBadge tone="off">Failed</AdminBadge>;
  return (
    <AdminBadge tone="ok">Paid{r.processed_at ? ` · ${when(r.processed_at)}` : ""}</AdminBadge>
  );
}

export function RefundsTab({
  arenas,
  arenaId,
  onArena,
  onToast,
}: {
  arenas: Arena[];
  arenaId: string;
  onArena: (id: string) => void;
  onToast: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RefundFilter>("pending");
  const list = useOwnerRefunds(filter, arenaId || undefined);
  const rows = list.data?.items ?? [];
  const [pick, setPick] = useState<OwnerRefund | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["owner-refunds"] });
    void qc.invalidateQueries({ queryKey: ["owner-refunds-count"] });
  };

  async function confirm() {
    if (!pick || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const result = await markRefundPaid(pick.id);
      onToast(
        result.already_processed
          ? "Already marked as paid."
          : "Marked as paid. The player has been told.",
      );
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : "Could not mark it as paid. Please try again.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
      setPick(null);
      refresh();
      // the button that opened the dialog is gone once the refund is paid: keep the keyboard in the tab
      window.setTimeout(() => panel.current?.focus(), 50);
    }
  }

  return (
    <div
      id="panel-refunds"
      role="tabpanel"
      aria-labelledby="tab-refunds"
      tabIndex={-1}
      ref={panel}
      className="ah-rf-panel"
    >
      <div className="ah-rf-bar">
        <div className="ah-seg" role="group" aria-label="Show refunds">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "ghost"}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <select
          className="ah-select"
          aria-label="Arena"
          value={arenaId}
          onChange={(e) => onArena(e.target.value)}
        >
          <option value="">All arenas</option>
          {arenas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading ? (
        <div className="ah-rf-skeleton" role="status" aria-label="Loading refunds">
          {[90, 75, 82, 60].map((w, i) => (
            <i key={i} className="ah-sk-line" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : list.isError ? (
        <div className="ah-rf-empty" role="alert">
          <h3>Could not load refunds.</h3>
          <p>Check your connection and try again.</p>
          <Button onClick={() => void list.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          {filter !== "processed" && (
            <p className="ah-rf-note" role="note">
              These players cancelled after paying by bank transfer. Send the money to the player,
              then tap <b>Mark as paid</b>. The player gets a message.
            </p>
          )}
          {rows.length === 0 ? (
            <div className="ah-rf-empty">
              <h3>{filter === "pending" ? "No refunds waiting." : "Nothing here."}</h3>
              <p>
                {filter === "pending"
                  ? "When a player cancels after paying, the refund shows up here."
                  : "No refunds match this filter."}
              </p>
            </div>
          ) : (
            <>
              <div className="ah-rf-scroll" tabIndex={0} role="region" aria-label="Refunds table">
                <Table className="ah-rf-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="ah-r">Refund</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="ah-r">
                        <span className="sr-only">Action</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="ah-strong">{r.player_name}</div>
                          <div className="ah-sub">{when(r.created_at)}</div>
                        </TableCell>
                        <TableCell>
                          <div>{r.booking_code}</div>
                          <div className="ah-sub">
                            {joinParts([r.arena_name, r.court_name, bookingWhen(r)])}
                          </div>
                        </TableCell>
                        <TableCell>{r.reason}</TableCell>
                        <TableCell className="ah-r tabular-nums">{formatRs(r.amount)}</TableCell>
                        <TableCell>
                          <StatusBadge r={r} />
                        </TableCell>
                        <TableCell className="ah-r">
                          {r.can_mark_paid && (
                            <Button size="sm" onClick={() => setPick(r)}>
                              Mark as paid
                              <span className="sr-only">
                                {" "}
                                for {r.player_name}, {r.booking_code}
                              </span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="ah-tbl-foot">
                <span>Showing {plural(rows.length, "refund")}</span>
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={!!pick} onOpenChange={(o) => !o && !busy && setPick(null)}>
        <DialogContent className="max-w-md" aria-describedby="refund-dialog-text">
          <DialogHeader>
            <DialogTitle>Mark this refund as paid?</DialogTitle>
            <DialogDescription id="refund-dialog-text">
              Only do this after you have sent the money. The player will be told it is done. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {pick && (
            <dl className="ah-rf-rows">
              <div>
                <dt>Player</dt>
                <dd>{pick.player_name}</dd>
              </div>
              <div>
                <dt>Booking</dt>
                <dd>{pick.booking_code}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{formatRs(pick.amount)}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPick(null)} disabled={busy}>
              Not yet
            </Button>
            <Button onClick={() => void confirm()} disabled={busy}>
              {busy ? "Saving…" : "Yes, mark as paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
