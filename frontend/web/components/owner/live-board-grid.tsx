"use client";

/**
 * The owner prototype's pitch grid (`.pitch`): courts x hours for one arena,
 * today, with a lime "now" line. Built from what the API already returns:
 * the arena's courts, its opening hours and today's bookings (the calendar
 * endpoint) for the chosen date. A booking block spans its hours and shows its status and time
 * (the calendar has no player names); confirmed and completed bookings are
 * ink, bookings waiting for payment or approval amber; cancelled and
 * rejected bookings leave the slot open. A court switched off reads "Not
 * bookable" across its row. Open hours are the dashed cells.
 */
import { useMemo } from "react";

import { NowLine } from "@/components/owner/now-line";
import { useCourts } from "@/hooks/useCourts";
import { useCalendar } from "@/hooks/useDashboard";
import { formatHour, formatTime } from "@/lib/format";
import { karachiToday, weekdayIndex } from "@/lib/karachi-date";
import type { Arena, CalendarBooking } from "@/types";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const LABEL_PX = 118;
const MIN_HOUR_PX = 48;

function minutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

const HIDDEN = new Set(["cancelled", "rejected"]);
const WAITING = new Set(["pending_payment", "pending_approval"]);
const STATUS_TEXT: Record<string, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  pending_payment: "Awaiting payment",
  pending_approval: "Awaiting approval",
};

function shortTime(hms: string): string {
  return formatTime(hms).replace(":00", "").replace(" ", "");
}

export function LiveBoardGrid({ arena, date }: { arena: Arena; date: string }) {
  const { data: courts, isLoading: courtsLoading, isError: courtsError } = useCourts(arena.id);
  const {
    data: bookings,
    isLoading: bookingsLoading,
    isError: bookingsError,
  } = useCalendar(arena.id, date, date);
  // the NOW line belongs to today (Karachi) only
  const isToday = date === karachiToday();

  const hours = arena.operating_hours[DAY_KEYS[weekdayIndex(date)]];
  const openMinutes = hours ? minutes(hours.open) : 0;
  const closeMinutes = hours ? minutes(hours.close) : 0;
  const startHour = Math.floor(openMinutes / 60);
  const endHour = Math.ceil(closeMinutes / 60);
  const hourCount = Math.max(endHour - startHour, 0);

  const byCourt = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings ?? []) {
      if (HIDDEN.has(b.status)) continue;
      map.set(b.court_id, [...(map.get(b.court_id) ?? []), b]);
    }
    return map;
  }, [bookings]);

  if (courtsLoading || bookingsLoading) {
    return (
      <div
        className="ah-skeleton"
        style={{ height: 160, margin: "0 18px 18px" }}
        aria-label="Loading"
      />
    );
  }
  if (courtsError || bookingsError) {
    return <p className="ah-empty-line ah-pitch-note">Could not load this day&apos;s board.</p>;
  }
  if (!courts || courts.length === 0) {
    return <p className="ah-empty-line ah-pitch-note">No courts yet for this arena.</p>;
  }
  if (!hours || hourCount === 0) {
    return (
      <p className="ah-empty-line ah-pitch-note">
        {arena.name} is closed {isToday ? "today" : "on this day"}.
      </p>
    );
  }

  const columns = `${LABEL_PX}px repeat(${hourCount}, minmax(0, 1fr))`;
  const hourIndex = (hms: string) => Math.floor(minutes(hms) / 60) - startHour;

  return (
    <div className="ah-pitch">
      <div className="ah-pitch-scroll" tabIndex={0} aria-label="Courts by hour">
        <div className="ah-pitch-inner" style={{ minWidth: LABEL_PX + hourCount * MIN_HOUR_PX }}>
          <div className="ah-pitch-hours" style={{ gridTemplateColumns: columns }}>
            <span />
            {Array.from({ length: hourCount }, (_, i) => (
              <span key={i}>{formatHour(startHour + i).replace(" ", "")}</span>
            ))}
          </div>
          {courts.map((court) => {
            const list = court.is_available ? (byCourt.get(court.id) ?? []) : [];
            // which hour cells a booking covers (a booking may span several)
            const covered = new Map<number, CalendarBooking>();
            for (const b of list) {
              const from = Math.max(0, hourIndex(b.start_time));
              const to = Math.min(hourCount, Math.ceil(minutes(b.end_time) / 60) - startHour);
              for (let h = from; h < to; h++) covered.set(h, b);
            }
            const cells: React.ReactNode[] = [];
            if (!court.is_available) {
              cells.push(
                <div
                  key="off"
                  className="ah-blk ah-blk-hold"
                  style={{ gridColumn: `2 / span ${hourCount}` }}
                >
                  <b>Not bookable</b>
                  <span>Switched off</span>
                </div>,
              );
            } else {
              for (let h = 0; h < hourCount;) {
                const b = covered.get(h);
                if (!b) {
                  cells.push(
                    <div
                      key={`o${h}`}
                      className="ah-slot"
                      title={`${formatHour(startHour + h)} · open`}
                    />,
                  );
                  h += 1;
                  continue;
                }
                let span = 1;
                while (h + span < hourCount && covered.get(h + span) === b) span += 1;
                const label = STATUS_TEXT[b.status] ?? b.status;
                cells.push(
                  <div
                    key={b.id}
                    className={`ah-blk ${WAITING.has(b.status) ? "ah-blk-wait" : "ah-blk-ok"}`}
                    style={{ gridColumn: `span ${span}` }}
                    title={`${formatTime(b.start_time)}–${formatTime(b.end_time)} · ${label}`}
                  >
                    <b>{label}</b>
                    <span>
                      {shortTime(b.start_time)}–{shortTime(b.end_time)}
                    </span>
                  </div>,
                );
                h += span;
              }
            }
            return (
              <div key={court.id} className="ah-pitch-row" style={{ gridTemplateColumns: columns }}>
                <div className="ah-pitch-label">
                  <b>{court.name}</b>
                  {court.sport_types.length > 0 && (
                    <span>
                      {court.sport_types
                        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                        .join(" · ")}
                    </span>
                  )}
                </div>
                {cells}
              </div>
            );
          })}
          {isToday && (
            <div className="ah-now-track" style={{ left: LABEL_PX }}>
              <NowLine openMinutes={startHour * 60} closeMinutes={endHour * 60} />
            </div>
          )}
        </div>
      </div>
      <div className="ah-pitch-legend">
        <span>
          <i className="ah-blk-ok" />
          Confirmed
        </span>
        <span>
          <i className="ah-blk-wait" />
          Awaiting payment or approval
        </span>
        <span>
          <i className="ah-slot" />
          Open
        </span>
        <span>
          <i style={{ background: "var(--lime-deep)" }} />
          Now
        </span>
      </div>
    </div>
  );
}
