"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { CourtForm } from "@/components/owner/court-form";
import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMyArenas } from "@/hooks/useArenas";
import { useCourts, useDeleteCourt, useSetCourtAvailability } from "@/hooks/useCourts";
import type { Court } from "@/types";

function CourtsInner() {
  const searchParams = useSearchParams();
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  const [arenaId, setArenaId] = useState<string>("");
  useEffect(() => {
    // Prefer ?arena= from the arenas table link, else the first arena.
    const fromUrl = searchParams.get("arena");
    if (fromUrl && arenas.some((a) => a.id === fromUrl)) setArenaId(fromUrl);
    else if (!arenaId && arenas.length) setArenaId(arenas[0].id);
  }, [arenas, searchParams, arenaId]);

  const { data: courts, isLoading } = useCourts(arenaId || null);
  const setAvailability = useSetCourtAvailability(arenaId);
  const removeCourt = useDeleteCourt(arenaId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Court | undefined>(undefined);

  return (
    <>
      <PageHeader title="Manage Courts">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={!arenaId}
          className="bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
        >
          <Plus className="size-4" /> Add Court
        </Button>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-foreground">Arena</label>
          <Select value={arenaId} onChange={(e) => setArenaId(e.target.value)} className="w-64">
            {arenas.length === 0 && <option value="">No arenas yet</option>}
            {arenas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        {!arenaId && (
          <p className="text-sm text-muted-foreground">
            Register an arena first, then add its courts here.
          </p>
        )}

        {arenaId && isLoading && <p className="text-sm text-muted-foreground">Loading courts…</p>}

        {arenaId && !isLoading && (courts?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No courts yet for this arena. Click “Add Court” to create one.
          </p>
        )}

        <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courts?.map((court) => (
            <div
              key={court.id}
              className="card-elevated overflow-hidden rounded-xl border border-border bg-card"
            >
              <div
                className="h-36 w-full bg-linear-to-br from-emerald-800 to-slate-900 bg-cover bg-center"
                style={court.images[0] ? { backgroundImage: `url(${court.images[0]})` } : undefined}
              />
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{court.name}</p>
                    <p className="text-xs text-muted-foreground">{court.sport_types.join(" · ")}</p>
                  </div>
                  <StatusBadge status={court.is_available ? "active" : "inactive"} />
                </div>
                <p className="text-sm font-medium text-foreground">Rs. {court.base_price} / hr</p>
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={court.is_available}
                      onCheckedChange={(v) =>
                        setAvailability.mutate({ courtId: court.id, isAvailable: v })
                      }
                    />
                    Available
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit"
                      onClick={() => {
                        setEditing(court);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete"
                      onClick={() => {
                        if (confirm(`Delete court “${court.name}”?`)) removeCourt.mutate(court.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {formOpen && arenaId && (
        <CourtForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arenaId={arenaId}
          court={editing}
        />
      )}
    </>
  );
}

export default function CourtsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <CourtsInner />
    </Suspense>
  );
}
