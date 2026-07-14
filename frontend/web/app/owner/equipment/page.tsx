"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";

import { EquipmentForm } from "@/components/owner/equipment-form";
import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMyArenas } from "@/hooks/useArenas";
import { useAdjustQuantity, useDeleteEquipment, useEquipment } from "@/hooks/useEquipment";
import type { Equipment } from "@/types";

function EquipmentInner() {
  const searchParams = useSearchParams();
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  const [arenaId, setArenaId] = useState<string>("");
  useEffect(() => {
    const fromUrl = searchParams.get("arena");
    if (fromUrl && arenas.some((a) => a.id === fromUrl)) setArenaId(fromUrl);
    else if (!arenaId && arenas.length) setArenaId(arenas[0].id);
  }, [arenas, searchParams, arenaId]);

  const { data: equipment, isLoading } = useEquipment(arenaId || null);
  const adjustQuantity = useAdjustQuantity(arenaId);
  const removeEquipment = useDeleteEquipment(arenaId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | undefined>(undefined);

  return (
    <>
      <PageHeader title="Manage Equipment">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={!arenaId}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="size-4" /> Add Equipment
        </Button>
      </PageHeader>

      <div className="space-y-6 p-8">
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
            Register an arena first, then add rentable equipment here.
          </p>
        )}

        {arenaId && isLoading && (
          <p className="text-sm text-muted-foreground">Loading equipment…</p>
        )}

        {arenaId && !isLoading && (equipment?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No equipment yet for this arena. Click “Add Equipment” to create one.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {equipment?.map((item) => (
            <div key={item.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <StatusBadge status={item.is_active ? "active" : "inactive"} />
              </div>
              <p className="text-sm font-medium text-foreground">Rs. {item.rental_price} / day</p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Decrease stock"
                    disabled={item.quantity_total <= 1}
                    onClick={() => adjustQuantity.mutate({ equipmentId: item.id, delta: -1 })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span>
                    {item.quantity_available} / {item.quantity_total} available
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Increase stock"
                    onClick={() => adjustQuantity.mutate({ equipmentId: item.id, delta: 1 })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Edit"
                    onClick={() => {
                      setEditing(item);
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
                      if (confirm(`Delete “${item.name}”?`)) removeEquipment.mutate(item.id);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {formOpen && arenaId && (
        <EquipmentForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arenaId={arenaId}
          equipment={editing}
        />
      )}
    </>
  );
}

export default function EquipmentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <EquipmentInner />
    </Suspense>
  );
}
