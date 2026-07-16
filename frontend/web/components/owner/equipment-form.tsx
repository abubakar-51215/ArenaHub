"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api";
import type { EquipmentInput } from "@/services/equipment";
import { useCreateEquipment, useUpdateEquipment } from "@/hooks/useEquipment";
import type { Equipment } from "@/types";

export function EquipmentForm({
  open,
  onOpenChange,
  arenaId,
  equipment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  arenaId: string;
  equipment?: Equipment;
}) {
  const editing = !!equipment;
  const create = useCreateEquipment(arenaId);
  const update = useUpdateEquipment(arenaId);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(equipment?.name ?? "");
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [rentalPrice, setRentalPrice] = useState(equipment?.rental_price ?? "");
  const [quantityTotal, setQuantityTotal] = useState(
    equipment ? String(equipment.quantity_total) : "1",
  );
  const [active, setActive] = useState(equipment?.is_active ?? true);

  const pending = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      if (editing) {
        const input: Partial<Omit<EquipmentInput, "quantity_total">> = {
          name,
          description: description || null,
          rental_price: rentalPrice.trim(),
          is_active: active,
        };
        await update.mutateAsync({ equipmentId: equipment.id, input });
      } else {
        const input: EquipmentInput = {
          name,
          description: description || null,
          rental_price: rentalPrice.trim(),
          quantity_total: Number(quantityTotal),
          is_active: active,
        };
        await create.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the equipment item.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          <DialogDescription>
            Equipment players can rent as an addon when booking a court.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="e-name">Name</Label>
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="e-desc">Description</Label>
            <Textarea
              id="e-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="e-price">Rental Price (Rs.)</Label>
              <Input
                id="e-price"
                type="number"
                min={0.01}
                step="0.01"
                value={rentalPrice}
                onChange={(e) => setRentalPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="e-qty">Total Quantity</Label>
              <Input
                id="e-qty"
                type="number"
                min={1}
                value={quantityTotal}
                onChange={(e) => setQuantityTotal(e.target.value)}
                disabled={editing}
                required
              />
              {editing && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Adjust stock from the equipment list.
                </p>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Active (rentable by players)
          </label>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
            >
              {pending ? "Saving…" : editing ? "Save Changes" : "Add Equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
