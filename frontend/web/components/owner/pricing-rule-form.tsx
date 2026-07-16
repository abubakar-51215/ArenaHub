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
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api";
import type { PricingRuleInput } from "@/services/pricing";
import { useCreatePricingRule, useUpdatePricingRule } from "@/hooks/usePricing";
import { type Court, type PricingRule, WEEKDAY_LABELS } from "@/types";

export function PricingRuleForm({
  open,
  onOpenChange,
  courts,
  rule,
  fixedCourtId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courts: Court[];
  rule?: PricingRule;
  fixedCourtId?: string;
}) {
  const editing = !!rule;
  const [courtId, setCourtId] = useState(rule?.court_id ?? fixedCourtId ?? courts[0]?.id ?? "");
  const [name, setName] = useState(rule?.name ?? "");
  const [weekday, setWeekday] = useState(rule?.weekday != null ? String(rule.weekday) : "");
  const [startTime, setStartTime] = useState(rule?.start_time?.slice(0, 5) ?? "18:00");
  const [endTime, setEndTime] = useState(rule?.end_time?.slice(0, 5) ?? "23:00");
  const [multiplier, setMultiplier] = useState(rule?.price_multiplier ?? "1.50");
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const create = useCreatePricingRule(courtId);
  const update = useUpdatePricingRule(courtId);
  const pending = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!courtId) {
      setError("Select a court.");
      return;
    }
    const payload: PricingRuleInput = {
      name,
      weekday: weekday === "" ? null : Number(weekday),
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      price_multiplier: multiplier.trim(),
      is_active: active,
    };
    try {
      if (editing) await update.mutateAsync({ ruleId: rule.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the rule.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Pricing Rule" : "Add Pricing Rule"}</DialogTitle>
          <DialogDescription>
            A peak window multiplies a court&apos;s base price during the selected time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="p-court">Court</Label>
            <Select
              id="p-court"
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
              disabled={editing}
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="p-name">Rule Name</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend evenings"
              required
            />
          </div>
          <div>
            <Label htmlFor="p-day">Applies On</Label>
            <Select id="p-day" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              <option value="">Every day</option>
              {Object.entries(WEEKDAY_LABELS).map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="p-from">From</Label>
              <Input
                id="p-from"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="p-to">To</Label>
              <Input
                id="p-to"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="p-mult">Multiplier</Label>
              <Input
                id="p-mult"
                type="number"
                min="0.1"
                step="0.05"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} />
            Active
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
              {pending ? "Saving…" : editing ? "Save Changes" : "Add Pricing Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
