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
import type { DiscountCodeInput } from "@/services/discounts";
import { useCreateDiscount, useUpdateDiscount } from "@/hooks/useDiscounts";
import type { DiscountCode, DiscountType } from "@/types";

export function DiscountForm({
  open,
  onOpenChange,
  arenaId,
  discount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  arenaId: string;
  discount?: DiscountCode;
}) {
  const editing = !!discount;
  const create = useCreateDiscount(arenaId);
  const update = useUpdateDiscount(arenaId);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(discount?.code ?? "");
  const [description, setDescription] = useState(discount?.description ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>(
    discount?.discount_type ?? "percentage",
  );
  const [discountValue, setDiscountValue] = useState(discount?.discount_value ?? "");
  const [minAmount, setMinAmount] = useState(discount?.min_booking_amount ?? "0");
  const [maxUses, setMaxUses] = useState(discount?.max_uses ? String(discount.max_uses) : "");
  const [active, setActive] = useState(discount?.is_active ?? true);

  const pending = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      if (editing) {
        await update.mutateAsync({
          discountId: discount.id,
          input: {
            description: description || null,
            discount_value: discountValue.trim(),
            min_booking_amount: minAmount.trim(),
            max_uses: maxUses ? Number(maxUses) : null,
            is_active: active,
          },
        });
      } else {
        const input: DiscountCodeInput = {
          code: code.trim(),
          description: description || null,
          discount_type: discountType,
          discount_value: discountValue.trim(),
          min_booking_amount: minAmount.trim(),
          max_uses: maxUses ? Number(maxUses) : null,
          is_active: active,
        };
        await create.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the discount code.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Discount Code" : "Add Discount Code"}</DialogTitle>
          <DialogDescription>
            A promo code players can apply at checkout for this arena.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="d-code">Code</Label>
            <Input
              id="d-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WELCOME10"
              disabled={editing}
              required
            />
          </div>
          <div>
            <Label htmlFor="d-desc">Description</Label>
            <Input
              id="d-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="10% off for first-time bookers"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="d-type">Discount Type</Label>
              <Select
                id="d-type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                disabled={editing}
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="d-value">
                Value {discountType === "percentage" ? "(%)" : "(Rs.)"}
              </Label>
              <Input
                id="d-value"
                type="number"
                min={0.01}
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="d-min">Min Booking Amount (Rs.)</Label>
              <Input
                id="d-min"
                type="number"
                min={0}
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="d-max">Max Uses</Label>
              <Input
                id="d-max"
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
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
              {pending ? "Saving…" : editing ? "Save Changes" : "Add Code"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
