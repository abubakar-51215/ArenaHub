"use client";

/**
 * Suspend / Reactivate / Remove an arena: one dialog for all three, in the
 * style of the other admin dialogs. The reason is required (1-500
 * characters, counted after trimming, as the API counts it); the server's
 * error message is shown inside the dialog.
 */
import { useEffect, useId, useRef, useState } from "react";

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
import { useArenaModeration, type ArenaAction } from "@/hooks/useAdmin";
import { ApiError } from "@/services/api";
import type { Arena } from "@/types";

export const REASON_MIN = 1;
export const REASON_MAX = 500;

const COPY: Record<
  ArenaAction,
  { title: string; effect: string; confirm: string; busy: string; done: string }
> = {
  suspend: {
    title: "Suspend",
    effect:
      "Upcoming bookings will be cancelled and refunded in full. The owner will be told the reason.",
    confirm: "Suspend arena",
    busy: "Suspending…",
    done: "suspended",
  },
  reactivate: {
    title: "Reactivate",
    effect: "Players can find and book this arena again. Cancelled bookings are not restored.",
    confirm: "Reactivate arena",
    busy: "Reactivating…",
    done: "reactivated",
  },
  remove: {
    title: "Remove",
    effect:
      "Upcoming bookings will be cancelled and refunded in full. The owner will be told the reason.",
    confirm: "Remove arena",
    busy: "Removing…",
    done: "removed",
  },
};

export function ArenaActionDialog({
  target,
  onClose,
  onDone,
}: {
  target: { action: ArenaAction; arena: Arena } | null;
  onClose: () => void;
  /** called after a successful action, with a short success line */
  onDone: (message: string) => void;
}) {
  const moderate = useArenaModeration();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const hintId = useId();
  // the card button that opened the dialog gets focus back when it closes
  const openerRef = useRef<HTMLElement | null>(null);

  // a fresh form each time the dialog opens
  useEffect(() => {
    setReason("");
    setError(null);
    if (target) openerRef.current = document.activeElement as HTMLElement | null;
  }, [target]);

  const copy = target ? COPY[target.action] : null;
  const length = reason.trim().length;
  const valid = length >= REASON_MIN && length <= REASON_MAX;

  function submit() {
    if (!target || !valid || moderate.isPending) return;
    setError(null);
    moderate.mutate(
      { action: target.action, arenaId: target.arena.id, reason: reason.trim() },
      {
        onSuccess: () => {
          onDone(`${target.arena.name} ${COPY[target.action].done}.`);
          onClose();
        },
        onError: (err) =>
          setError(err instanceof ApiError ? err.message : "Could not complete the action."),
      },
    );
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && !moderate.isPending && onClose()}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          // the opener is gone after a successful action (the card swaps its
          // buttons); Radix's default then applies
          if (openerRef.current?.isConnected) {
            e.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {copy?.title} {target?.arena.name}
          </DialogTitle>
          <DialogDescription>{copy?.effect}</DialogDescription>
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
            placeholder={
              target?.action === "reactivate"
                ? "Why the suspension is lifted…"
                : "What the owner will be told…"
            }
            autoFocus
          />
          <div id={hintId} className="ah-reason-hint">
            <span>
              {length < REASON_MIN
                ? "Write a reason"
                : "Shown to the owner and kept in the audit log"}
            </span>
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
          <Button variant="outline" onClick={onClose} disabled={moderate.isPending}>
            Cancel
          </Button>
          <ActionButton
            tone={target?.action === "reactivate" ? "positive" : "negative"}
            variant={target?.action === "reactivate" ? "default" : "destructive"}
            disabled={!valid || moderate.isPending}
            busy={moderate.isPending}
            failed={!!error}
            onClick={submit}
          >
            {copy?.confirm}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
