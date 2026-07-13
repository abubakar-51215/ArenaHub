"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api";
import type { ArenaInput } from "@/services/arenas";
import { useCreateArena, useUpdateArena } from "@/hooks/useArenas";
import {
  ARENA_CITIES,
  type Arena,
  type ArenaCity,
  type OperatingHours,
  type RefundTier,
  WEEKDAY_NAMES,
} from "@/types";

interface DayRow {
  open: boolean;
  from: string;
  to: string;
}

function initialDays(hours?: OperatingHours): Record<string, DayRow> {
  const rows: Record<string, DayRow> = {};
  for (const day of WEEKDAY_NAMES) {
    const h = hours?.[day];
    rows[day] = h
      ? { open: true, from: h.open, to: h.close }
      : { open: false, from: "08:00", to: "23:00" };
  }
  return rows;
}

export function ArenaForm({
  open,
  onOpenChange,
  arena,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  arena?: Arena;
}) {
  const editing = !!arena;
  const create = useCreateArena();
  const update = useUpdateArena();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(arena?.name ?? "");
  const [description, setDescription] = useState(arena?.description ?? "");
  const [address, setAddress] = useState(arena?.address ?? "");
  const [city, setCity] = useState<ArenaCity>(arena?.city ?? ARENA_CITIES[0]);
  const [area, setArea] = useState(arena?.area ?? "");
  const [latitude, setLatitude] = useState(arena?.latitude ?? "");
  const [longitude, setLongitude] = useState(arena?.longitude ?? "");
  const [phone, setPhone] = useState(arena?.contact_phone ?? "");
  const [emailContact, setEmailContact] = useState(arena?.contact_email ?? "");
  const [sports, setSports] = useState((arena?.sports_offered ?? []).join(", "));
  const [images, setImages] = useState((arena?.images ?? []).join("\n"));
  const [advance, setAdvance] = useState(String(arena?.advance_percentage ?? 100));
  const [fullPayment, setFullPayment] = useState(arena?.require_full_payment ?? true);
  const [days, setDays] = useState<Record<string, DayRow>>(() =>
    initialDays(arena?.operating_hours),
  );
  const [tiers, setTiers] = useState<RefundTier[]>(arena?.refund_policy ?? []);

  const pending = create.isPending || update.isPending;

  function setDay(day: string, patch: Partial<DayRow>) {
    setDays((d) => ({ ...d, [day]: { ...d[day], ...patch } }));
  }

  const openHours = useMemo(() => {
    const hours: OperatingHours = {};
    for (const day of WEEKDAY_NAMES) {
      if (days[day].open) hours[day] = { open: days[day].from, close: days[day].to };
    }
    return hours;
  }, [days]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const sportsList = sports
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (sportsList.length === 0) {
      setError("Add at least one sport.");
      return;
    }
    if (Object.keys(openHours).length === 0) {
      setError("Mark at least one day as open with its hours.");
      return;
    }

    const payload: ArenaInput = {
      name,
      description: description || null,
      address,
      city,
      area: area || null,
      latitude: latitude.trim(),
      longitude: longitude.trim(),
      contact_phone: phone || null,
      contact_email: emailContact || null,
      operating_hours: openHours,
      sports_offered: sportsList,
      images: images
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      advance_percentage: Number(advance),
      require_full_payment: fullPayment,
      refund_policy: tiers,
    };

    try {
      if (editing) await update.mutateAsync({ id: arena.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the arena.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Arena" : "Add Arena"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update your arena's details."
              : "Register a new arena. It will be submitted to admins for verification."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="a-name">Arena Name</Label>
            <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="a-desc">Description</Label>
            <Textarea
              id="a-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="a-addr">Address</Label>
            <Input
              id="a-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-city">City</Label>
              <Select
                id="a-city"
                value={city}
                onChange={(e) => setCity(e.target.value as ArenaCity)}
                required
              >
                {ARENA_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="a-area">Area</Label>
              <Input id="a-area" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-lat">Latitude</Label>
              <Input
                id="a-lat"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="31.5204"
                required
              />
            </div>
            <div>
              <Label htmlFor="a-lng">Longitude</Label>
              <Input
                id="a-lng"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="74.3587"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-phone">Contact Phone</Label>
              <Input id="a-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-email">Contact Email</Label>
              <Input
                id="a-email"
                type="email"
                value={emailContact}
                onChange={(e) => setEmailContact(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="a-sports">Sports Offered</Label>
            <Input
              id="a-sports"
              value={sports}
              onChange={(e) => setSports(e.target.value)}
              placeholder="futsal, cricket, padel"
            />
            <p className="mt-1 text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          <div>
            <Label>Operating Hours</Label>
            <div className="space-y-1.5">
              {WEEKDAY_NAMES.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <label className="flex w-32 items-center gap-2 text-sm capitalize">
                    <Switch
                      checked={days[day].open}
                      onCheckedChange={(v) => setDay(day, { open: v })}
                    />
                    {day}
                  </label>
                  <Input
                    type="time"
                    value={days[day].from}
                    disabled={!days[day].open}
                    onChange={(e) => setDay(day, { from: e.target.value })}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={days[day].to}
                    disabled={!days[day].open}
                    onChange={(e) => setDay(day, { to: e.target.value })}
                    className="w-32"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-adv">Advance Payment (%)</Label>
              <Input
                id="a-adv"
                type="number"
                min={1}
                max={100}
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch checked={fullPayment} onCheckedChange={setFullPayment} />
              Require full payment
            </label>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="mb-0">Cancellation Refund Tiers</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setTiers((t) => [...t, { hours_before: 24, refund_percentage: 100 }])
                }
              >
                <Plus className="size-3.5" /> Add tier
              </Button>
            </div>
            {tiers.length === 0 && (
              <p className="text-xs text-muted-foreground">No refund tiers (non-refundable).</p>
            )}
            <div className="space-y-2">
              {tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Cancel ≥</span>
                  <Input
                    type="number"
                    min={0}
                    value={tier.hours_before}
                    onChange={(e) =>
                      setTiers((t) =>
                        t.map((x, j) =>
                          j === i ? { ...x, hours_before: Number(e.target.value) } : x,
                        ),
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-muted-foreground">hrs before → refund</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.refund_percentage}
                    onChange={(e) =>
                      setTiers((t) =>
                        t.map((x, j) =>
                          j === i ? { ...x, refund_percentage: Number(e.target.value) } : x,
                        ),
                      )
                    }
                    className="w-24"
                  />
                  <span className="text-muted-foreground">%</span>
                  <button
                    type="button"
                    onClick={() => setTiers((t) => t.filter((_, j) => j !== i))}
                    className="ml-auto text-destructive"
                    aria-label="Remove tier"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="a-images">Image URLs</Label>
            <Textarea
              id="a-images"
              value={images}
              onChange={(e) => setImages(e.target.value)}
              placeholder="One URL per line"
            />
          </div>

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
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {pending ? "Saving…" : editing ? "Save Changes" : "Add Arena"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
