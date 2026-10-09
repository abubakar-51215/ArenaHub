"use client";

/**
 * The Live Board card (owner prototype: "Court occupancy · <arena>" with the
 * pitch grid). One arena at a time: the one chosen in the top bar's arena
 * picker, or, with "All arenas", whichever the card's arrows step to
 * (clamped at the ends, no wraparound). One date at a time too (Asia/Karachi,
 * today to begin with): a label that names it, previous and next day, a
 * "Today" button when it is not today, and a small calendar to jump to any
 * date. The grid, its NOW line (today only) and the booking count follow it.
 */
import { useState } from "react";

import { DatePopover } from "@/components/owner/date-popover";
import { LiveBoardGrid } from "@/components/owner/live-board-grid";
import { Button } from "@/components/ui/button";
import { useMyArenas } from "@/hooks/useArenas";
import { useArenaParam } from "@/hooks/useArenaParam";
import { useCalendar } from "@/hooks/useDashboard";
import { plural } from "@/lib/format";
import { addDaysIso, dayLabel, karachiToday } from "@/lib/karachi-date";

const OFF = new Set(["cancelled", "rejected"]);

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d={dir === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

export function LiveBoard() {
  const { data, isLoading, isError, refetch } = useMyArenas();
  const arenas = data?.items ?? [];
  const [arenaId] = useArenaParam();
  const [index, setIndex] = useState(0);
  const [date, setDate] = useState(karachiToday);
  const today = karachiToday();
  const picked = arenas.find((a) => a.id === arenaId);
  const clamped = Math.min(index, Math.max(arenas.length - 1, 0));
  const arena = picked ?? arenas[clamped];
  const stepping = !picked && arenas.length > 1;

  // the same query the grid makes, so the count costs no extra request
  const calendar = useCalendar(arena?.id ?? null, date, date);
  const count = (calendar.data ?? []).filter((b) => !OFF.has(b.status)).length;

  return (
    <section className="ah-card">
      <div className="ah-card-head ah-lb-head">
        <div className="min-w-0">
          <h2 className="ah-h2">Court occupancy{arena ? ` · ${arena.name}` : ""}</h2>
          {arena && (
            <p className="ah-card-sub ah-lb-sub">
              {stepping && (
                <span className="ah-lb-arenas">
                  <button
                    type="button"
                    className="ah-icon-btn"
                    aria-label="Previous arena"
                    disabled={clamped === 0}
                    onClick={() => setIndex(Math.max(0, clamped - 1))}
                  >
                    <Chevron dir="left" />
                  </button>
                  <span>
                    Arena {clamped + 1} of {arenas.length}
                  </span>
                  <button
                    type="button"
                    className="ah-icon-btn"
                    aria-label="Next arena"
                    disabled={clamped === arenas.length - 1}
                    onClick={() => setIndex(Math.min(arenas.length - 1, clamped + 1))}
                  >
                    <Chevron dir="right" />
                  </button>
                </span>
              )}
              <span>{calendar.isLoading ? " " : plural(count, "booking")}</span>
            </p>
          )}
        </div>
        {arena && (
          <div className="ah-lb-date" role="group" aria-label="Date">
            {/* the slot is always there, so the label changing never moves the arrows */}
            <span className="ah-lb-today">
              {date !== today && (
                <Button variant="outline" size="sm" onClick={() => setDate(today)}>
                  Today
                </Button>
              )}
            </span>
            <button type="button" className="ah-icon-btn" aria-label="Previous day" onClick={() => setDate(addDaysIso(date, -1))}>
              <Chevron dir="left" />
            </button>
            <b className="ah-lb-label" aria-live="polite">
              {dayLabel(date, today)}
            </b>
            <button type="button" className="ah-icon-btn" aria-label="Next day" onClick={() => setDate(addDaysIso(date, 1))}>
              <Chevron dir="right" />
            </button>
            <DatePopover value={date} today={today} onChange={setDate} />
          </div>
        )}
      </div>
      {isLoading && <div className="ah-skeleton" style={{ height: 160, margin: 18 }} aria-label="Loading" />}
      {isError && (
        <div className="ah-card-body">
          <div className="ah-card-error" role="alert">
            <span>Could not load your arenas.</span>
            <button type="button" className="ah-link" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </div>
      )}
      {!isLoading && !isError && !arena && (
        <p className="ah-empty-line ah-pitch-note">Add an arena to see its courts here.</p>
      )}
      {arena && <LiveBoardGrid key={`${arena.id}-${date}`} arena={arena} date={date} />}
    </section>
  );
}
