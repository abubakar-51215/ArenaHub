"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotActionDialog, type SlotAction } from "@/components/owner/slot-actions";
import { useGenerateSlots, useOwnerSlots, useUpdateSlot } from "@/hooks/useSlots";
import { formatDate, formatRs, formatTime, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";
import type { GenerateSlotsResult, SlotStatus } from "@/services/slots";
import type { Court } from "@/types";

const MAX_DAYS = 30;

const STATUS_LABEL: Record<SlotStatus, string> = {
  available: "Free",
  reserved: "Held",
  booked: "Booked",
  maintenance: "Blocked",
};
const STATUS_STYLE: Record<SlotStatus, string> = {
  available: "bg-success-muted text-success",
  reserved: "bg-warning-muted text-warning",
  booked: "bg-secondary text-secondary-foreground",
  maintenance: "bg-muted text-muted-foreground",
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toDateInput(new Date(y, m - 1, d + days));
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const ms = new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime();
  return Math.round(ms / 86_400_000);
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

function ResultSummary({ result }: { result: GenerateSlotsResult }) {
  const notes: string[] = [];
  if (result.skipped_existing) notes.push(`${result.skipped_existing} already existed`);
  if (result.skipped_closed_or_blocked.length)
    notes.push(`closed or blocked: ${result.skipped_closed_or_blocked.map(formatDate).join(", ")}`);
  if (result.skipped_window_too_short.length)
    notes.push(
      `opening window too short: ${result.skipped_window_too_short.map(formatDate).join(", ")}`,
    );
  return (
    <p role="status" className="rounded-lg bg-success-muted px-3 py-2 text-sm text-success">
      {result.created === 0 ? "No new slots were created" : `${result.created} slots created`}
      {notes.length > 0 && ` (${notes.join("; ")})`}.
    </p>
  );
}

export function SlotsDialog({
  court,
  open,
  onOpenChange,
}: {
  court: Court;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = useMemo(() => toDateInput(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const [viewDate, setViewDate] = useState(today);
  const [result, setResult] = useState<GenerateSlotsResult | null>(null);

  const generate = useGenerateSlots(court.id);
  const unblock = useUpdateSlot(court.id);
  const [action, setAction] = useState<SlotAction | null>(null);
  const { data: slots, isLoading, isError, error, refetch } = useOwnerSlots(court.id, viewDate);

  const rangeError =
    !from || !to
      ? "Choose both dates."
      : to < from
        ? "The end date must be on or after the start date."
        : daysBetween(from, to) >= MAX_DAYS
          ? `You can generate at most ${MAX_DAYS} days at once.`
          : null;

  function onGenerate() {
    setResult(null);
    generate.mutate({ start_date: from, end_date: to }, { onSuccess: (r) => setResult(r) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Slots — {court.name}</DialogTitle>
          <DialogDescription>
            Slots follow the arena&apos;s opening hours and this court&apos;s prices. Players can
            only book slots that exist here.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="slots-generate" className="space-y-3">
          <h3 id="slots-generate" className="text-sm font-semibold text-foreground">
            Generate slots
          </h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="slots-from">From</Label>
              <Input
                id="slots-from"
                type="date"
                value={from}
                min={today}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slots-to">To</Label>
              <Input
                id="slots-to"
                type="date"
                value={to}
                min={from || today}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button onClick={onGenerate} disabled={!!rangeError || generate.isPending}>
              {generate.isPending && <Loader2 className="size-4 animate-spin" />}
              {generate.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
          {rangeError && (
            <p role="alert" className="text-sm text-destructive">
              {rangeError}
            </p>
          )}
          {generate.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorText(generate.error)}
            </p>
          )}
          {result && <ResultSummary result={result} />}
        </section>

        <section aria-labelledby="slots-view" className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="slots-view" className="text-sm font-semibold text-foreground">
              Slots on {formatDate(viewDate)}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous day"
                onClick={() => setViewDate(addDays(viewDate, -1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Input
                type="date"
                aria-label="Day to view"
                value={viewDate}
                onChange={(e) => e.target.value && setViewDate(e.target.value)}
                className="w-40"
              />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next day"
                onClick={() => setViewDate(addDays(viewDate, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading slots…
            </p>
          )}

          {isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <span>{errorText(error)}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !isError && slots?.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No slots on {formatDate(viewDate)} yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setFrom(viewDate);
                  setTo(viewDate);
                }}
              >
                Set the generate range to this day
              </Button>
            </div>
          )}

          {unblock.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorText(unblock.error)}
            </p>
          )}

          {slots && slots.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {slots.map((slot) => {
                const busy = unblock.isPending && unblock.variables?.slotId === slot.id;
                return (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 max-sm:flex-col max-sm:items-stretch"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                        </p>
                        <p className="text-sm text-muted-foreground">{formatRs(slot.price)}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATUS_STYLE[slot.status],
                        )}
                      >
                        {STATUS_LABEL[slot.status]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {slot.status === "available" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAction({ kind: "block", slot })}
                          >
                            Block
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAction({ kind: "price", slot })}
                          >
                            Edit price
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setAction({ kind: "delete", slot })}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {slot.status === "maintenance" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={unblock.isPending}
                          onClick={() =>
                            unblock.mutate({ slotId: slot.id, change: { status: "available" } })
                          }
                        >
                          {busy && <Loader2 className="size-4 animate-spin" />}
                          Unblock
                        </Button>
                      )}
                      {slot.status === "booked" && (
                        <Link
                          href={`/owner/bookings?from=${slot.date}&to=${slot.date}`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        >
                          View booking
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <SlotActionDialog courtId={court.id} action={action} onClose={() => setAction(null)} />
      </DialogContent>
    </Dialog>
  );
}
