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
import type { CourtInput } from "@/services/courts";
import { useCreateCourt, useUpdateCourt } from "@/hooks/useCourts";
import type { Court } from "@/types";

export function CourtForm({
  open,
  onOpenChange,
  arenaId,
  court,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  arenaId: string;
  court?: Court;
}) {
  const editing = !!court;
  const create = useCreateCourt(arenaId);
  const update = useUpdateCourt(arenaId);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(court?.name ?? "");
  const [description, setDescription] = useState(court?.description ?? "");
  const [sportTypes, setSportTypes] = useState((court?.sport_types ?? []).join(", "));
  const [capacity, setCapacity] = useState(court?.capacity ? String(court.capacity) : "");
  const [basePrice, setBasePrice] = useState(court?.base_price ?? "");
  const [images, setImages] = useState((court?.images ?? []).join("\n"));
  const [available, setAvailable] = useState(court?.is_available ?? true);

  const pending = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const sports = sportTypes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (sports.length === 0) {
      setError("Add at least one sport type.");
      return;
    }

    const payload: CourtInput = {
      name,
      description: description || null,
      sport_types: sports,
      capacity: capacity ? Number(capacity) : null,
      base_price: basePrice.trim(),
      images: images
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      is_available: available,
    };

    try {
      if (editing) await update.mutateAsync({ courtId: court.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the court.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Court" : "Add Court"}</DialogTitle>
          <DialogDescription>
            A court is a bookable playing surface in this arena.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="c-name">Court Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="c-desc">Description</Label>
            <Textarea
              id="c-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="c-sports">Sport Types</Label>
            <Input
              id="c-sports"
              value={sportTypes}
              onChange={(e) => setSportTypes(e.target.value)}
              placeholder="futsal, cricket"
            />
            <p className="mt-1 text-xs text-muted-foreground">Comma-separated.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-price">Base Price (Rs. / hr)</Label>
              <Input
                id="c-price"
                type="number"
                min={1}
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="c-cap">Capacity</Label>
              <Input
                id="c-cap"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-images">Image URLs</Label>
            <Textarea
              id="c-images"
              value={images}
              onChange={(e) => setImages(e.target.value)}
              placeholder="One URL per line"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={available} onCheckedChange={setAvailable} />
            Available for booking
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
              {pending ? "Saving…" : editing ? "Save Changes" : "Add Court"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
