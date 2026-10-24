"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { useDeleteSlot, useUpdateSlot } from "@/hooks/useSlots";
import { formatDate, formatRs, formatTime } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { Slot } from "@/services/slots";

export type SlotAction = { kind: "block" | "price" | "delete"; slot: Slot };

const REASON_MAX = 200;

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

/** The three small dialogs behind a free slot's buttons: block (with an optional reason), edit the
 *  price, delete. Unblock needs no dialog. Each one closes on success and shows the server's
 *  words if the slot has meanwhile been taken. */
export function SlotActionDialog({
  courtId,
  action,
  onClose,
}: {
  courtId: string;
  action: SlotAction | null;
  onClose: () => void;
}) {
  const update = useUpdateSlot(courtId);
  const remove = useDeleteSlot(courtId);
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const slot = action?.slot;
  const pending = update.isPending || remove.isPending;
  const priceNumber = Number(price);
  const priceBad = !price || !Number.isFinite(priceNumber) || priceNumber <= 0;

  function close() {
    setReason("");
    setPrice("");
    setError(null);
    onClose();
  }

  async function submit() {
    if (!action) return;
    setError(null);
    try {
      if (action.kind === "block") {
        await update.mutateAsync({
          slotId: action.slot.id,
          change: { status: "maintenance", reason: reason.trim() || undefined },
        });
      } else if (action.kind === "price") {
        await update.mutateAsync({
          slotId: action.slot.id,
          change: { price: priceNumber.toFixed(2) },
        });
      } else {
        await remove.mutateAsync(action.slot.id);
      }
      close();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const title =
    action?.kind === "block"
      ? "Block this slot?"
      : action?.kind === "price"
        ? "Edit the price"
        : "Delete this slot?";
  const confirm =
    action?.kind === "block"
      ? "Block slot"
      : action?.kind === "price"
        ? "Save price"
        : "Delete slot";

  return (
    <Dialog open={!!action} onOpenChange={(v) => !v && !pending && close()}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {slot && (
            <DialogDescription>
              {formatDate(slot.date)}, {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
              {" · "}
              {formatRs(slot.price)}
            </DialogDescription>
          )}
        </DialogHeader>

        {action?.kind === "block" && (
          <div className="space-y-1.5">
            <Label htmlFor="slot-reason">Reason (optional)</Label>
            <Textarea
              id="slot-reason"
              value={reason}
              maxLength={REASON_MAX}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Players will not see this slot until you unblock it.
            </p>
          </div>
        )}
        {action?.kind === "price" && (
          <div className="space-y-1.5">
            <Label htmlFor="slot-price">New price (Rs.)</Label>
            <Input
              id="slot-price"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              value={price}
              placeholder={slot ? String(Number(slot.price)) : undefined}
              onChange={(e) => setPrice(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Only this slot changes. Bookings already made keep their price.
            </p>
          </div>
        )}
        {action?.kind === "delete" && (
          <p className="text-sm text-muted-foreground">
            This removes the slot. You can make it again by generating slots for the day.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={action?.kind === "delete" ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={pending || (action?.kind === "price" && priceBad)}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
