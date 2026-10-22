"use client";

/**
 * Block/unblock whole days for an arena (maintenance, holidays). Unblocking
 * asks for confirmation through the app's own Dialog, never window.confirm.
 * The backend's own refusal text (already blocked, has a live booking, or a
 * date that has already passed) is shown verbatim under the date field.
 */
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBlockDate, useBlockedDates, useUnblockDate } from "@/hooks/useBlockedDates";
import { formatDate, toDateInput } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { BlockedDate } from "@/types";

export function BlockedDates({ arenaId }: { arenaId: string }) {
  const { data } = useBlockedDates(arenaId);
  const blockDate = useBlockDate(arenaId);
  const unblockDate = useUnblockDate(arenaId);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState<BlockedDate | null>(null);
  const dateId = useId();
  const reasonId = useId();

  const today = toDateInput(new Date());
  const dates = data ?? [];

  function submit() {
    if (!date) return;
    setError(null);
    blockDate.mutate(
      { blockedDate: date, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          setDate("");
          setReason("");
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : "Could not block that date."),
      },
    );
  }

  function confirmUnblock() {
    if (!unblocking) return;
    unblockDate.mutate(unblocking.id, { onSuccess: () => setUnblocking(null) });
  }

  return (
    <div>
      <Label className="mb-0">Blocked Dates</Label>
      <p className="mb-1.5 text-xs text-muted-foreground">
        Block a day off (maintenance, holiday). No booking can be made on a blocked date.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <div>
          <Label htmlFor={dateId} className="sr-only">
            Date to block
          </Label>
          <Input
            id={dateId}
            type="date"
            min={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            className="w-40"
          />
        </div>
        <div className="min-w-40 flex-1">
          <Label htmlFor={reasonId} className="sr-only">
            Reason (optional)
          </Label>
          <Input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!date || blockDate.isPending}
          onClick={submit}
        >
          {blockDate.isPending ? "Blocking…" : "Block this date"}
        </Button>
      </div>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}

      {dates.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {dates.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{formatDate(b.blocked_date)}</span>
                {b.reason ? (
                  <span className="text-muted-foreground"> — {b.reason}</span>
                ) : (
                  <span className="text-muted-foreground"> — No reason given</span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUnblocking(b)}
                disabled={unblockDate.isPending}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!unblocking}
        onOpenChange={(v) => !v && !unblockDate.isPending && setUnblocking(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unblock this date?</DialogTitle>
            <DialogDescription>
              {unblocking ? formatDate(unblocking.blocked_date) : ""} will accept bookings again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnblocking(null)}
              disabled={unblockDate.isPending}
            >
              Cancel
            </Button>
            <Button onClick={confirmUnblock} disabled={unblockDate.isPending}>
              {unblockDate.isPending ? "Unblocking…" : "Yes, unblock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
