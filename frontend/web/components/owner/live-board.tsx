"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { LiveBoardGrid } from "@/components/owner/live-board-grid";
import { useMyArenas } from "@/hooks/useArenas";

/**
 * Courts×hours occupancy board for one arena at a time, with a prev/next
 * switcher (clamped at the ends, no wraparound) — not all arenas stacked,
 * so the now-line sweep stays the component's one clear visual hook.
 */
export function LiveBoard() {
  const { data, isLoading } = useMyArenas();
  const arenas = data?.items ?? [];
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.min(index, Math.max(arenas.length - 1, 0));
  const arena = arenas[clampedIndex];

  return (
    <div className="shadow-card rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h3 className="font-semibold text-foreground">Live Board</h3>

        {arenas.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous arena"
              disabled={clampedIndex === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-center text-sm">
              <span className="font-medium text-foreground">{arena?.name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {clampedIndex + 1} of {arenas.length}
              </span>
            </div>
            <button
              type="button"
              aria-label="Next arena"
              disabled={clampedIndex === arenas.length - 1}
              onClick={() => setIndex((i) => Math.min(arenas.length - 1, i + 1))}
              className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : arenas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No arenas yet. List your first arena to see live occupancy here.
          </p>
        ) : (
          <LiveBoardGrid arena={arena} />
        )}
      </div>
    </div>
  );
}
