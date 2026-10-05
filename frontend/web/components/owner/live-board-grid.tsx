"use client";

import { useMemo } from "react";

import { ScrollCue } from "@/components/ui/scroll-cue";
import { NowLine } from "@/components/owner/now-line";
import { LABELS as STATUS_LABELS, STYLES as STATUS_STYLES } from "@/components/owner/status-badge";
import { useCourts } from "@/hooks/useCourts";
import { useCalendar } from "@/hooks/useDashboard";
import { cn } from "@/lib/utils";
import { formatHour, formatTime, toDateInput } from "@/lib/format";
import type { Arena, CalendarBooking } from "@/types";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MIN_COLUMN_WIDTH_PX = 44;
const LABEL_COLUMN_WIDTH = "w-28";

/** "19:00:00" or "06:00" → minutes since midnight. The trailing ":SS" on
 * booking times is simply unused by destructuring only [h, m]. */
function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function LiveBoardGrid({ arena }: { arena: Arena }) {
  const { data: courts, isLoading: courtsLoading } = useCourts(arena.id);
  const today = useMemo(() => toDateInput(new Date()), []);
  const { data: bookings, isLoading: bookingsLoading } = useCalendar(arena.id, today, today);

  const todayKey = DAY_KEYS[new Date().getDay()];
  const hours = arena.operating_hours[todayKey];
  const openMinutes = hours ? parseHHMM(hours.open) : 0;
  const closeMinutes = hours ? parseHHMM(hours.close) : 0;
  const startHour = Math.floor(openMinutes / 60);
  const endHour = Math.ceil(closeMinutes / 60);
  const hourCount = Math.max(endHour - startHour, 0);

  const bookingsByCourtId = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings ?? []) {
      const list = map.get(b.court_id) ?? [];
      list.push(b);
      map.set(b.court_id, list);
    }
    return map;
  }, [bookings]);

  if (courtsLoading || bookingsLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!courts || courts.length === 0) {
    return <p className="text-sm text-muted-foreground">No courts yet for this arena.</p>;
  }

  if (!hours || hourCount === 0) {
    return <p className="text-sm text-muted-foreground">{arena.name} is closed today.</p>;
  }

  const hourLabels = Array.from({ length: hourCount }, (_, i) => formatHour(startHour + i));

  function pct(hms: string): number {
    const mins = parseHHMM(hms);
    return Math.max(0, Math.min(100, ((mins - openMinutes) / (closeMinutes - openMinutes)) * 100));
  }

  return (
    <ScrollCue hint="Swipe to see more hours">
      <div style={{ minWidth: `${hourCount * MIN_COLUMN_WIDTH_PX}px` }} className="relative">
        {/* header */}
        <div className="flex">
          <div className={cn(LABEL_COLUMN_WIDTH, "sticky left-0 z-20 shrink-0 bg-card")} />
          <div
            className="grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${hourCount}, minmax(${MIN_COLUMN_WIDTH_PX}px, 1fr))`,
            }}
          >
            {hourLabels.map((label, i) => (
              <div key={i} className="px-1 pb-2 text-center text-[11px] text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* court rows */}
        <div className="relative space-y-1">
          {courts.map((court) => (
            <div key={court.id} className="flex items-center">
              <div
                className={cn(
                  LABEL_COLUMN_WIDTH,
                  "sticky left-0 z-20 shrink-0 truncate bg-card pr-2 text-sm font-medium text-foreground",
                )}
              >
                {court.name}
                {!court.is_available && (
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                    (Disabled)
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "relative h-9 flex-1 rounded-md",
                  court.is_available ? "bg-muted/50" : "bg-muted/20",
                )}
              >
                {court.is_available &&
                  (bookingsByCourtId.get(court.id) ?? []).map((b) => {
                    const left = pct(b.start_time);
                    const width = pct(b.end_time) - left;
                    return (
                      <div
                        key={b.id}
                        title={`${formatTime(b.start_time)}–${formatTime(b.end_time)} · ${STATUS_LABELS[b.status]}`}
                        className={cn("absolute inset-y-0.5 rounded", STATUS_STYLES[b.status])}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    );
                  })}
              </div>
            </div>
          ))}

          {/* left-28 must match LABEL_COLUMN_WIDTH's w-28 above — Tailwind
              can't derive one from the other via string interpolation (JIT
              purges dynamically-built class names), so this is a manual
              sync point if the label column width ever changes. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 left-28 z-10">
            <NowLine openMinutes={openMinutes} closeMinutes={closeMinutes} />
          </div>
        </div>
      </div>
    </ScrollCue>
  );
}
