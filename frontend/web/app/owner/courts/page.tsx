"use client";

/**
 * Owner Courts, laid out as the owner prototype's Courts screen: a grid of
 * court cards, each with the court's photo (or the prototype's court drawing
 * when it has none), a Live / Off badge, sport tags, the hourly price, the
 * bookable switch and the actions (Edit, Slots, Delete, Schedule). The
 * arena comes from the top bar's picker; "All arenas" lists every arena's
 * courts. Left out, as courts have no data for them: the surface tag and
 * the "% full" figure (occupancy is only kept per arena).
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { CourtArt } from "@/components/admin/court-art";
import { AdminBadge, AdminEmpty, AdminTag } from "@/components/admin/ui";
import { CourtForm } from "@/components/owner/court-form";
import { PageHeader } from "@/components/owner/page-header";
import { SlotsDialog } from "@/components/owner/slots-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMyArenas } from "@/hooks/useArenas";
import { useFormDialog } from "@/hooks/useFormDialog";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatRs, plural } from "@/lib/format";
import { deleteCourt, listCourts, setCourtAvailability } from "@/services/courts";
import { ApiError } from "@/services/api";
import type { Court } from "@/types";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function CourtsInner() {
  const qc = useQueryClient();
  const {
    data: arenaPage,
    isLoading: arenasLoading,
    isError: arenasError,
    refetch: refetchArenas,
  } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [pickedId] = useArenaParam();
  const picked = arenas.find((a) => a.id === pickedId);
  const scope = picked ? [picked] : arenas;
  const arenaName = new Map(arenas.map((a) => [a.id, a.name]));

  const courtQueries = useQueries({
    queries: scope.map((a) => ({ queryKey: ["courts", a.id], queryFn: () => listCourts(a.id) })),
  });
  const loading = arenasLoading || courtQueries.some((q) => q.isLoading);
  const failed = arenasError || courtQueries.some((q) => q.isError);
  const courts = courtQueries.flatMap((q) => q.data ?? []);

  const [sport, setSport] = useState("");
  const sports = [...new Set(courts.flatMap((c) => c.sport_types))].sort();
  const shown = sport ? courts.filter((c) => c.sport_types.includes(sport)) : courts;
  const live = courts.filter((c) => c.is_available).length;

  const [slotsFor, setSlotsFor] = useState<Court | null>(null);
  const [formOpen, setFormOpen] = useFormDialog();
  const [editing, setEditing] = useState<Court | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the switch and delete act on the court's own arena, so they work under
  // "All arenas" too
  async function run(court: Court, action: () => Promise<unknown>) {
    setBusy(court.id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not update ${court.name}.`);
    } finally {
      await qc.invalidateQueries({ queryKey: ["courts", court.arena_id] });
      setBusy(null);
    }
  }

  // a new court needs one arena: the picked one
  const formArenaId = editing?.arena_id ?? picked?.id;

  return (
    <>
      <PageHeader
        title="Courts"
        subtitle={
          !loading
            ? `${plural(courts.length, "court")} · ${live} taking bookings${picked ? "" : " · choose an arena above to add a court"}`
            : undefined
        }
      >
        {sports.length > 1 && (
          <Select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Sport">
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        )}
        <Button
          className="ah-lime"
          disabled={!picked}
          title={picked ? undefined : "Choose an arena above first"}
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add court
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {error && (
          <div className="ah-card-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        {loading && <div className="ah-skeleton" style={{ height: 260 }} aria-label="Loading" />}
        {!loading && failed && (
          <div className="ah-card">
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the courts.</span>
                <button
                  type="button"
                  className="ah-link"
                  onClick={() =>
                    [{ refetch: refetchArenas }, ...courtQueries].forEach((q) => void q.refetch())
                  }
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}
        {!loading && !failed && shown.length === 0 && (
          <div className="ah-card">
            <AdminEmpty>
              {arenas.length === 0
                ? "Register an arena first, then add its courts here."
                : picked
                  ? "No courts yet for this arena. Click “Add court” to create one."
                  : "No courts yet."}
            </AdminEmpty>
          </div>
        )}
        {!loading && shown.length > 0 && (
          <div className="ah-grid ah-g-3 ah-courts">
            {shown.map((court) => (
              <article key={court.id} className="ah-card ah-court-card">
                <div className="ah-court-vis">
                  {court.images[0] ? (
                    <div
                      className="ah-court-photo"
                      style={{ backgroundImage: `url(${court.images[0]})` }}
                    />
                  ) : (
                    <CourtArt sport={court.sport_types[0]} />
                  )}
                  <span className="ah-court-badge">
                    <AdminBadge tone={court.is_available ? "ok" : "idle"}>
                      {court.is_available ? "Live" : "Off"}
                    </AdminBadge>
                  </span>
                </div>
                <div className="ah-court-body">
                  <div>
                    <b className="ah-court-name">{court.name}</b>
                    <div className="ah-sub">{arenaName.get(court.arena_id) ?? ""}</div>
                  </div>
                  {(court.sport_types.length > 0 || court.capacity) && (
                    <div className="ah-court-meta">
                      {court.sport_types.map((s) => (
                        <AdminTag key={s}>{titleCase(s)}</AdminTag>
                      ))}
                      {court.capacity ? <AdminTag>Up to {court.capacity} players</AdminTag> : null}
                    </div>
                  )}
                  <div className="ah-court-price">
                    <span>
                      <span className="ah-metric">{formatRs(court.base_price)}</span>
                      <span className="ah-mute"> / hr</span>
                    </span>
                    <label className="ah-court-switch">
                      <Switch
                        checked={court.is_available}
                        disabled={busy === court.id}
                        onCheckedChange={(v) => run(court, () => setCourtAvailability(court.id, v))}
                      />
                      Bookable
                    </label>
                  </div>
                  <div className="ah-court-foot">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(court);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSlotsFor(court)}>
                      Slots
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy === court.id}
                      onClick={() => {
                        if (confirm(`Delete court “${court.name}”?`))
                          void run(court, () => deleteCourt(court.id));
                      }}
                    >
                      Delete
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/owner/calendar?arena=${court.arena_id}`}>Schedule</Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {slotsFor && (
        <SlotsDialog
          key={slotsFor.id}
          court={slotsFor}
          open
          onOpenChange={(open) => !open && setSlotsFor(null)}
        />
      )}

      {formOpen && formArenaId && (
        <CourtForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arenaId={formArenaId}
          court={editing}
        />
      )}
    </>
  );
}

export default function CourtsPage() {
  return (
    <Suspense fallback={null}>
      <CourtsInner />
    </Suspense>
  );
}
