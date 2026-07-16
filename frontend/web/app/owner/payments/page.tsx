"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { BankDetailsForm } from "@/components/owner/bank-details-form";
import { DiscountForm } from "@/components/owner/discount-form";
import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMyArenas } from "@/hooks/useArenas";
import { useDeleteDiscount, useDiscounts } from "@/hooks/useDiscounts";
import type { DiscountCode } from "@/types";

function PaymentsInner() {
  const searchParams = useSearchParams();
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  const [arenaId, setArenaId] = useState<string>("");
  useEffect(() => {
    const fromUrl = searchParams.get("arena");
    if (fromUrl && arenas.some((a) => a.id === fromUrl)) setArenaId(fromUrl);
    else if (!arenaId && arenas.length) setArenaId(arenas[0].id);
  }, [arenas, searchParams, arenaId]);

  const selectedArena = arenas.find((a) => a.id === arenaId);
  const { data: discounts, isLoading } = useDiscounts(arenaId || null);
  const removeDiscount = useDeleteDiscount(arenaId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | undefined>(undefined);

  return (
    <>
      <PageHeader title="Payment Config">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={!arenaId}
          className="bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
        >
          <Plus className="size-4" /> Add Discount Code
        </Button>
      </PageHeader>

      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
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
            Register an arena first, then configure its payment policy and discount codes here.
          </p>
        )}

        {selectedArena && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Payment Policy</h2>
            <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Advance Payment</p>
                <p className="text-sm font-medium text-foreground">
                  {selectedArena.advance_percentage}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Full Payment Required</p>
                <p className="text-sm font-medium text-foreground">
                  {selectedArena.require_full_payment ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Refund Tiers</p>
                <p className="text-sm font-medium text-foreground">
                  {selectedArena.refund_policy.length
                    ? selectedArena.refund_policy
                        .map((t) => `${t.hours_before}h → ${t.refund_percentage}%`)
                        .join(", ")
                    : "Non-refundable"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Edit these from the arena&apos;s edit form on the{" "}
              <a href={`/owner/arenas`} className="text-blue-600 hover:underline">
                Arenas
              </a>{" "}
              page.
            </p>
          </section>
        )}

        {arenaId && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Bank Transfer Details</h2>
            <BankDetailsForm arenaId={arenaId} />
          </section>
        )}

        {arenaId && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Discount Codes</h2>

            {isLoading && <p className="text-sm text-muted-foreground">Loading discount codes…</p>}

            {!isLoading && (discounts?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                No discount codes yet. Click “Add Discount Code” to create one.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {discounts?.map((d) => (
                <div key={d.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground">{d.code}</p>
                      {d.description && (
                        <p className="text-xs text-muted-foreground">{d.description}</p>
                      )}
                    </div>
                    <StatusBadge status={d.is_active ? "active" : "inactive"} />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {d.discount_type === "percentage"
                      ? `${d.discount_value}% off`
                      : `Rs. ${d.discount_value} off`}
                    {Number(d.min_booking_amount) > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        (min Rs. {d.min_booking_amount})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Used {d.used_count}
                    {d.max_uses ? ` / ${d.max_uses}` : ""} times
                  </p>
                  <div className="flex items-center justify-end gap-1 pt-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit"
                      onClick={() => {
                        setEditing(d);
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
                        if (confirm(`Delete code “${d.code}”?`)) removeDiscount.mutate(d.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {formOpen && arenaId && (
        <DiscountForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arenaId={arenaId}
          discount={editing}
        />
      )}
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <PaymentsInner />
    </Suspense>
  );
}
