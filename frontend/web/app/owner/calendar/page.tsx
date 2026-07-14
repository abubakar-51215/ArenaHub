"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { useMyArenas } from "@/hooks/useArenas";
import { cn } from "@/lib/utils";
import { formatTime, toDateInput } from "@/lib/format";
import { listCourts } from "@/services/courts";
import { getCalendar } from "@/services/dashboard";
import type { CalendarBooking } from "@/types";

/** Pastel chip styles per court, assigned deterministically — matches the
 * wireframe's colored booking blocks. */
const CHIP_STYLES = [
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-pink-100 text-pink-800",
] as const;

function chipStyle(courtId: string): string {
  let hash = 0;
  for (const ch of courtId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CHIP_STYLES[hash % CHIP_STYLES.length];
}

/** 3-hour row bands, 6 AM – 12 AM, as in the wireframe. */
const BANDS = [6, 9, 12, 15, 18, 21];
const BAND_LABELS: Record<number, string> = {
  6: "6 AM",
  9: "9 AM",
  12: "12 PM",
  15: "3 PM",
  18: "6 PM",
  21: "9 PM",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface TaggedBooking extends CalendarBooking {
  arena_name: string;
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - out.getDay());
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function rangeLabel(view: "week" | "month", anchor: Date): string {
  if (view === "month") return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()}`;
  const endLabel = sameMonth
    ? `${end.getDate()}`
    : `${MONTHS[end.getMonth()].slice(0, 3)} ${end.getDate()}`;
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

function Chip({ booking, courtName }: { booking: TaggedBooking; courtName: string }) {
  return (
    <div
      className={cn(
        "rounded-md px-1.5 py-1 text-[11px] leading-tight",
        chipStyle(booking.court_id),
      )}
      title={`${courtName} · ${booking.arena_name} · ${formatTime(booking.start_time)} – ${formatTime(booking.end_time)} · ${booking.status}`}
    >
      <p className="truncate font-semibold">{courtName}</p>
      <p className="truncate opacity-75">{booking.arena_name}</p>
    </div>
  );
}

export default function CalendarPage() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());

  // Visible range: the week, or the whole month padded to full weeks.
  const [rangeFrom, rangeTo] = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchor);
      return [start, addDays(start, 6)];
    }
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return [startOfWeek(monthStart), addDays(startOfWeek(monthEnd), 6)];
  }, [view, anchor]);

  // Cross-arena data: one calendar query per arena (tagged with its name),
  // plus court names for the chips.
  const calendarQueries = useQueries({
    queries: arenas.map((a) => ({
      queryKey: ["calendar", a.id, toDateInput(rangeFrom), toDateInput(rangeTo)],
      queryFn: async (): Promise<TaggedBooking[]> => {
        const rows = await getCalendar(a.id, toDateInput(rangeFrom), toDateInput(rangeTo));
        return rows.map((r) => ({ ...r, arena_name: a.name }));
      },
    })),
  });
  const bookings = calendarQueries.flatMap((q) => q.data ?? []);
  const loading = arenas.length > 0 && calendarQueries.some((q) => q.isLoading);

  const courtQueries = useQueries({
    queries: arenas.map((a) => ({ queryKey: ["courts", a.id], queryFn: () => listCourts(a.id) })),
  });
  const courtNames = useMemo(() => {
    const map = new Map<string, string>();
    courtQueries.forEach((q) => (q.data ?? []).forEach((c) => map.set(c.id, c.name)));
    return map;
  }, [courtQueries]);

  const byDate = useMemo(() => {
    const map = new Map<string, TaggedBooking[]>();
    for (const b of bookings) {
      const list = map.get(b.booking_date) ?? [];
      list.push(b);
      map.set(b.booking_date, list);
    }
    for (const list of map.values()) list.sort((x, y) => x.start_time.localeCompare(y.start_time));
    return map;
  }, [bookings]);

  function step(direction: 1 | -1) {
    setAnchor((a) =>
      view === "week"
        ? addDays(a, 7 * direction)
        : new Date(a.getFullYear(), a.getMonth() + direction, 1),
    );
  }

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)),
    [anchor],
  );
  const monthWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    let cursor = rangeFrom;
    while (cursor <= rangeTo) {
      weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }, [rangeFrom, rangeTo]);

  const todayIso = toDateInput(new Date());

  return (
    <>
      <PageHeader title="Calendar" />
      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <p className="text-sm font-semibold text-foreground">{rangeLabel(view, anchor)}</p>
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          <div className="ml-auto flex overflow-hidden rounded-lg border border-border">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                  view === v ? "bg-blue-600 text-white" : "bg-card text-foreground hover:bg-muted",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === "week" ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <div className="grid min-w-[900px] grid-cols-[64px_repeat(7,1fr)]">
              <div className="border-b border-border" />
              {weekDays.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "border-b border-l border-border px-2 py-2 text-center text-sm font-medium",
                    toDateInput(d) === todayIso ? "text-blue-600" : "text-foreground",
                  )}
                >
                  {DAY_NAMES[d.getDay()]} {d.getDate()}
                </div>
              ))}

              {BANDS.map((band) => (
                <div key={band} className="contents">
                  <div className="border-b border-border px-2 py-1 text-right text-xs text-muted-foreground">
                    {BAND_LABELS[band]}
                  </div>
                  {weekDays.map((d) => {
                    const dayBookings = (byDate.get(toDateInput(d)) ?? []).filter((b) => {
                      const hour = Number(b.start_time.slice(0, 2));
                      const clamped = Math.max(hour, 6);
                      return clamped >= band && clamped < band + 3;
                    });
                    return (
                      <div
                        key={d.toISOString()}
                        className="min-h-16 space-y-1 border-b border-l border-border p-1"
                      >
                        {dayBookings.map((b) => (
                          <Chip
                            key={b.id}
                            booking={b}
                            courtName={courtNames.get(b.court_id) ?? "Court"}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <div className="grid min-w-[900px] grid-cols-7">
              {DAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="border-b border-border px-2 py-2 text-center text-sm font-medium text-foreground"
                >
                  {name}
                </div>
              ))}
              {monthWeeks.flat().map((d) => {
                const iso = toDateInput(d);
                const dayBookings = byDate.get(iso) ?? [];
                const inMonth = d.getMonth() === anchor.getMonth();
                return (
                  <div
                    key={iso}
                    className={cn(
                      "min-h-24 space-y-1 border-b border-l border-border p-1",
                      !inMonth && "bg-muted/30",
                    )}
                  >
                    <p
                      className={cn(
                        "px-1 text-xs",
                        iso === todayIso
                          ? "font-bold text-blue-600"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {d.getDate()}
                    </p>
                    {dayBookings.slice(0, 2).map((b) => (
                      <Chip
                        key={b.id}
                        booking={b}
                        courtName={courtNames.get(b.court_id) ?? "Court"}
                      />
                    ))}
                    {dayBookings.length > 2 && (
                      <p className="px-1 text-[11px] text-muted-foreground">
                        +{dayBookings.length - 2} more
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
