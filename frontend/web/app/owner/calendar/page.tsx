"use client";

/**
 * Owner Schedule, laid out as the owner prototype's Schedule screen: heading
 * and sub-line, the Day / Week / Month toggle, then one card with Today and
 * the arrows, the range title, a sport legend and the hourly grid (6 AM to
 * midnight, 52px an hour) with bookings as the prototype's event cards,
 * coloured by the court's sport (the prototype's colours: the app has none
 * of its own). Day view puts the courts side by side for one date; it uses
 * the same calendar endpoint. The arena comes from the top bar's picker
 * ("All arenas" shows every arena). Blocking stays in each court's slots
 * dialog, by day, as before: there is no "Block time" here.
 */
import { Suspense, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { ScrollCue } from "@/components/ui/scroll-cue";
import { useMyArenas } from "@/hooks/useArenas";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatHour, formatTime, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/components/admin/ui";
import { listCourts } from "@/services/courts";
import { getCalendar } from "@/services/dashboard";
import type { CalendarBooking, Court } from "@/types";

type View = "day" | "week" | "month";

const START = 6; // first hour on the grid
const HOURS = 18; // to midnight
const ROW = 52; // px per hour (prototype)
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** prototype event colours: ev-a lime (football, futsal), ev-b grey
 *  (cricket and any other sport), ev-c amber (padel) */
function sportClass(sport: string | undefined): string {
  const s = (sport ?? "").toLowerCase();
  if (s === "football" || s === "futsal") return "ah-ev-a";
  if (s === "padel") return "ah-ev-c";
  return "ah-ev-b";
}
const OFF = new Set(["cancelled", "rejected"]);

interface Booking extends CalendarBooking {
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
function minutes(hms: string): number {
  const [h, m] = hms.split(":").map(Number);
  return h * 60 + m;
}
const longDate = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", opts);

function rangeTitle(view: View, anchor: Date): string {
  if (view === "day") return longDate(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "month") return longDate(anchor, { month: "long", year: "numeric" });
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const from = start.getMonth() === end.getMonth() ? `${start.getDate()}` : longDate(start, { day: "numeric", month: "long" });
  return `${from} – ${longDate(end, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** Side-by-side lanes for bookings that overlap in one column. */
function lanes(list: Booking[]): Map<string, { lane: number; of: number }> {
  const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const b of sorted) {
    const s = minutes(b.start_time);
    let i = ends.findIndex((e) => e <= s);
    if (i === -1) i = ends.length;
    ends[i] = minutes(b.end_time) || 24 * 60;
    lane.set(b.id, i);
  }
  const of = Math.max(ends.length, 1);
  return new Map([...lane].map(([id, l]) => [id, { lane: l, of }]));
}

function Schedule() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [pickedId] = useArenaParam();
  const picked = arenas.find((a) => a.id === pickedId);
  const scope = picked ? [picked] : arenas;

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  const [from, to] = useMemo(() => {
    if (view === "day") return [anchor, anchor];
    if (view === "week") {
      const s = startOfWeek(anchor);
      return [s, addDays(s, 6)];
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return [startOfWeek(first), addDays(startOfWeek(last), 6)];
  }, [view, anchor]);

  const calendarQueries = useQueries({
    queries: scope.map((a) => ({
      queryKey: ["calendar", a.id, toDateInput(from), toDateInput(to)],
      queryFn: async (): Promise<Booking[]> =>
        (await getCalendar(a.id, toDateInput(from), toDateInput(to))).map((r) => ({ ...r, arena_name: a.name })),
    })),
  });
  const courtQueries = useQueries({
    queries: scope.map((a) => ({ queryKey: ["courts", a.id], queryFn: () => listCourts(a.id) })),
  });
  const loading = calendarQueries.some((q) => q.isLoading);
  const failed = calendarQueries.some((q) => q.isError);
  const bookings = calendarQueries.flatMap((q) => q.data ?? []);
  const courts: Court[] = courtQueries.flatMap((q) => q.data ?? []);
  const courtById = new Map(courts.map((c) => [c.id, c]));

  const byDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) map.set(b.booking_date, [...(map.get(b.booking_date) ?? []), b]);
    return map;
  }, [bookings]);

  // legend: only the sport colours on screen
  const legend = new Map<string, string>();
  for (const b of bookings) {
    const sport = courtById.get(b.court_id)?.sport_types[0];
    if (sport) legend.set(sport.charAt(0).toUpperCase() + sport.slice(1), sportClass(sport));
  }

  function step(dir: 1 | -1) {
    setAnchor((a) =>
      view === "day"
        ? addDays(a, dir)
        : view === "week"
          ? addDays(a, 7 * dir)
          : new Date(a.getFullYear(), a.getMonth() + dir, 1),
    );
  }
  function openDay(d: Date) {
    setAnchor(d);
    setView("day");
  }

  const todayIso = toDateInput(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  const event = (b: Booking, place: { lane: number; of: number }, showArena: boolean) => {
    const court = courtById.get(b.court_id);
    const s = Math.max(minutes(b.start_time), START * 60);
    const e = Math.min(minutes(b.end_time) || 24 * 60, 24 * 60);
    const top = ((s - START * 60) / 60) * ROW + 2;
    const height = Math.max(((e - s) / 60) * ROW - 5, 18);
    const time = `${formatTime(b.start_time)} – ${formatTime(b.end_time)}`;
    return (
      <div
        key={b.id}
        className={cn("ah-ev", sportClass(court?.sport_types[0]), OFF.has(b.status) && "ah-ev-off")}
        style={{
          top,
          height,
          left: `calc(${(place.lane / place.of) * 100}% + 3px)`,
          width: `calc(${100 / place.of}% - 6px)`,
        }}
        title={`${court?.name ?? "Court"} · ${b.arena_name} · ${time} · ${statusLabel(b.status)}`}
      >
        <b>{showArena ? (court?.name ?? "Court") : time}</b>
        {showArena ? `${b.arena_name} · ${time}` : statusLabel(b.status)}
      </div>
    );
  };

  // the hour grid: one column per day (week) or per court (day)
  const columns =
    view === "day"
      ? courts.map((c) => ({
          key: c.id,
          head: (
            <div className="ah-cal-day ah-cal-court">
              <b>{c.name}</b>
              <span>{picked ? (c.sport_types[0] ?? "") : (arenas.find((a) => a.id === c.arena_id)?.name ?? "")}</span>
            </div>
          ),
          list: (byDate.get(toDateInput(anchor)) ?? []).filter((b) => b.court_id === c.id),
          showArena: false,
        }))
      : weekDays.map((d) => ({
          key: toDateInput(d),
          head: (
            <button
              type="button"
              className={cn("ah-cal-day", toDateInput(d) === todayIso && "is-today")}
              onClick={() => openDay(d)}
              aria-label={`Open ${longDate(d, { weekday: "long", day: "numeric", month: "long" })}`}
            >
              <b>{d.getDate()}</b>
              <span>{DAY_NAMES[d.getDay()]}</span>
            </button>
          ),
          list: byDate.get(toDateInput(d)) ?? [],
          showArena: true,
        }));

  const monthCells = (() => {
    const out: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  })();

  const sub =
    `${picked ? picked.name : "All arenas"} · ` +
    (view === "day"
      ? longDate(anchor, { weekday: "long", day: "numeric", month: "long" })
      : view === "week"
        ? `week of ${longDate(startOfWeek(anchor), { day: "numeric", month: "long" })}`
        : longDate(anchor, { month: "long", year: "numeric" }));

  return (
    <>
      <PageHeader title="Schedule" subtitle={sub}>
        <div className="ah-seg" role="group" aria-label="View">
          {(["day", "week", "month"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "ghost"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in">
        <section className="ah-card">
          <div className="ah-card-head ah-cal-head-row">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="sm" aria-label="Previous" onClick={() => step(-1)}>
              ‹
            </Button>
            <Button variant="outline" size="sm" aria-label="Next" onClick={() => step(1)}>
              ›
            </Button>
            <h2 className="ah-h2 ah-cal-title">{rangeTitle(view, anchor)}</h2>
            {legend.size > 0 && (
              <div className="ah-cal-legend">
                {[...legend].map(([label, cls]) => (
                  <span key={label}>
                    <i className={cls} />
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {failed && (
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the schedule.</span>
                <button type="button" className="ah-link" onClick={() => calendarQueries.forEach((q) => void q.refetch())}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {loading && <div className="ah-skeleton" style={{ height: 320, margin: 18 }} aria-label="Loading" />}

          {!loading && !failed && view !== "month" && (
            <ScrollCue>
              {view === "day" && courts.length === 0 ? (
                <p className="ah-empty-line ah-pitch-note">No courts yet.</p>
              ) : (
                <div
                  className="ah-cal"
                  style={{
                    minWidth: view === "day" ? Math.max(640, 56 + courts.length * 150) : 860,
                    ["--cols" as string]: columns.length,
                  }}
                >
                  <div className="ah-cal-headrow">
                    <div />
                    {columns.map((c) => (
                      <div key={c.key}>{c.head}</div>
                    ))}
                  </div>
                  <div className="ah-cal-body">
                    <div className="ah-cal-times">
                      {Array.from({ length: HOURS }, (_, i) => (
                        <div key={i} className="ah-cal-time">
                          {i === 0 ? "" : formatHour(START + i)}
                        </div>
                      ))}
                    </div>
                    {columns.map((c) => {
                      const place = lanes(c.list);
                      return (
                        <div key={c.key} className="ah-cal-col">
                          {Array.from({ length: HOURS }, (_, i) => (
                            <div key={i} className="ah-cal-hr" />
                          ))}
                          {c.list.map((b) => event(b, place.get(b.id) ?? { lane: 0, of: 1 }, c.showArena))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ScrollCue>
          )}

          {!loading && !failed && view === "month" && (
            <ScrollCue>
              <div className="ah-cal-month">
                {DAY_NAMES.map((n) => (
                  <div key={n} className="ah-cal-mhead">
                    {n}
                  </div>
                ))}
                {monthCells.map((d) => {
                  const iso = toDateInput(d);
                  const list = [...(byDate.get(iso) ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
                  const inMonth = d.getMonth() === anchor.getMonth();
                  return (
                    <div key={iso} className={cn("ah-cal-mcell", !inMonth && "is-out")}>
                      <button
                        type="button"
                        className={cn("ah-cal-mdate", iso === todayIso && "is-today")}
                        onClick={() => openDay(d)}
                        aria-label={`Open ${longDate(d, { weekday: "long", day: "numeric", month: "long" })}`}
                      >
                        {d.getDate()}
                      </button>
                      {list.slice(0, 3).map((b) => {
                        const court = courtById.get(b.court_id);
                        return (
                          <div
                            key={b.id}
                            className={cn("ah-ev ah-ev-chip", sportClass(court?.sport_types[0]), OFF.has(b.status) && "ah-ev-off")}
                            title={`${court?.name ?? "Court"} · ${b.arena_name} · ${formatTime(b.start_time)} · ${statusLabel(b.status)}`}
                          >
                            <b>{formatTime(b.start_time)}</b> {court?.name ?? "Court"}
                          </div>
                        );
                      })}
                      {list.length > 3 && (
                        <button type="button" className="ah-cal-more" onClick={() => openDay(d)}>
                          +{list.length - 3} more
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollCue>
          )}
        </section>
      </div>
    </>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <Schedule />
    </Suspense>
  );
}
