"use client";

/**
 * Force a 100% refund on a booking regardless of the arena's cancellation
 * policy (force majeure). Same reason-required dialog shape as
 * ArenaActionDialog; the confirm button stays disabled for the whole
 * request so a double click can't send it twice.
 */
import { useEffect, useId, useState } from "react";

import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForceRefund } from "@/hooks/useAdmin";
import { ApiError } from "@/services/api";
import type { AdminBooking } from "@/types";

export const REASON_MIN = 1;
export const REASON_MAX = 500;

function bookingRef(b: { booking_code?: string; id: string }): string {
  return b.booking_code || `#BK-${b.id.slice(0, 4).toUpperCase()}`;
}

export function ForceRefundDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: AdminBooking | null;
  onClose: () => void;
  /** called after a successful refund, with a short success line */
  onDone: (message: string) => void;
}) {
  const forceRefund = useForceRefund();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const hintId = useId();

  useEffect(() => {
    setReason("");
    setError(null);
  }, [booking]);

  const length = reason.trim().length;
  const valid = length >= REASON_MIN && length <= REASON_MAX;

  function submit() {
    if (!booking || !valid || forceRefund.isPending) return;
    setError(null);
    forceRefund.mutate(
      { bookingId: booking.id, reason: reason.trim() },
      {
        onSuccess: () => {
          onDone(`Refund forced for ${bookingRef(booking)}.`);
          onClose();
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : "Could not force the refund."),
      },
    );
  }

  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && !forceRefund.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force a full refund?</DialogTitle>
          <DialogDescription>
            This refunds 100% of what was paid, regardless of the arena&apos;s cancellation
            policy, and frees the time slot. The player is notified.
          </DialogDescription>
        </DialogHeader>
        <div className="ah-reason">
          <Label htmlFor={reasonId}>Reason</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            rows={4}
            required
            aria-invalid={length > 0 && !valid ? true : undefined}
            aria-describedby={hintId}
            placeholder="Why this refund is being forced…"
            autoFocus
          />
          <div id={hintId} className="ah-reason-hint">
            <span>{length < REASON_MIN ? "Write a reason" : "Kept in the audit log"}</span>
            <span className="tabular-nums" aria-live="polite">
              {length} / {REASON_MAX}
            </span>
          </div>
        </div>
        {error && (
          <p role="alert" className="ah-auth-error">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={forceRefund.isPending}>
            Cancel
          </Button>
          <ActionButton
            tone="negative"
            variant="destructive"
            disabled={!valid || forceRefund.isPending}
            busy={forceRefund.isPending}
            failed={!!error}
            onClick={submit}
          >
            Force refund
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
