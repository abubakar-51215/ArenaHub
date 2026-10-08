"use client";

/**
 * The Live Board card (owner prototype: "Court occupancy · <arena>" with the
 * pitch grid). One arena at a time: the one chosen in the top bar's arena
 * picker, or, with "All arenas", whichever the card's arrows step to
 * (clamped at the ends, no wraparound).
 */
import { useState } from "react";

import { LiveBoardGrid } from "@/components/owner/live-board-grid";
import { useMyArenas } from "@/hooks/useArenas";
import { useArenaParam } from "@/hooks/useArenaParam";

export function LiveBoard() {
  const { data, isLoading, isError, refetch } = useMyArenas();
  const arenas = data?.items ?? [];
  const [arenaId] = useArenaParam();
  const [index, setIndex] = useState(0);
  const picked = arenas.find((a) => a.id === arenaId);
  const clamped = Math.min(index, Math.max(arenas.length - 1, 0));
  const arena = picked ?? arenas[clamped];
  const stepping = !picked && arenas.length > 1;

  return (
    <section className="ah-card">
      <div className="ah-card-head">
        <div className="min-w-0">
          <h2 className="ah-h2">Court occupancy{arena ? ` · ${arena.name}` : ""}</h2>
          {arena && (
            <p className="ah-card-sub">
              Today{stepping ? ` · arena ${clamped + 1} of ${arenas.length}` : ""}
            </p>
          )}
        </div>
        {stepping && (
          <div className="ah-row" style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className="ah-icon-btn"
              aria-label="Previous arena"
              disabled={clamped === 0}
              onClick={() => setIndex(Math.max(0, clamped - 1))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              className="ah-icon-btn"
              aria-label="Next arena"
              disabled={clamped === arenas.length - 1}
              onClick={() => setIndex(Math.min(arenas.length - 1, clamped + 1))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
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
      {arena && <LiveBoardGrid key={arena.id} arena={arena} />}
    </section>
  );
}
