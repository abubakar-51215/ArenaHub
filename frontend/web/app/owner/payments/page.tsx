"use client";

/**
 * Owner Payments: bank accounts, discount codes and the refunds the owner owes players (the Refunds tab). The prototype has no
 * screen for this, so it borrows the Settings card's tab row (as in its
 * Payouts tab) with one tab per section that exists, and the shared table,
 * badge and button styles. Both belong to one arena, so the top bar picker
 * filters them; under "All arenas" each arena gets its own group. The
 * arena's payment policy (advance, full payment, refund tiers) is shown
 * read-only above, as before; it is edited in the arena's form.
 */
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { AdminBadge, AdminEmpty, AdminTag } from "@/components/admin/ui";
import { BankDetailsForm } from "@/components/owner/bank-details-form";
import { DiscountForm } from "@/components/owner/discount-form";
import { PageHeader } from "@/components/owner/page-header";
import { RefundsTab } from "@/components/owner/refunds-tab";
import { Toast, useToast } from "@/components/owner/toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { usePendingRefundCount } from "@/hooks/useOwnerRefunds";
import { useFormDialog } from "@/hooks/useFormDialog";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatDateShort, formatRs, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import { deleteDiscount, listDiscounts } from "@/services/discounts";
import type { Arena, DiscountCode } from "@/types";

type Tab = "bank" | "discounts" | "refunds";

function discountText(d: DiscountCode): string {
  return d.discount_type === "percentage" ? `${Number(d.discount_value)}% off` : `${formatRs(d.discount_value)} off`;
}
function validity(d: DiscountCode): string {
  if (d.valid_from && d.valid_until)
    return `${formatDateShort(d.valid_from.slice(0, 10))} – ${formatDateShort(d.valid_until.slice(0, 10))}`;
  if (d.valid_until) return `Until ${formatDateShort(d.valid_until.slice(0, 10))}`;
  if (d.valid_from) return `From ${formatDateShort(d.valid_from.slice(0, 10))}`;
  return "No end date";
}

function Policy({ arena }: { arena: Arena }) {
  return (
    <div className="ah-grid ah-g-3">
      <div className="ah-card ah-kpi">
        <p className="ah-eyebrow">Advance payment</p>
        <div className="ah-metric">{arena.require_full_payment ? "100%" : `${arena.advance_percentage}%`}</div>
        <div className="ah-kpi-foot">{arena.require_full_payment ? "Full payment required" : "Balance paid at the arena"}</div>
      </div>
      <div className="ah-card ah-kpi ah-span-2">
        <p className="ah-eyebrow">Refunds</p>
        <div className="ah-badges" style={{ marginTop: 10 }}>
          {arena.refund_policy.length ? (
            arena.refund_policy.map((t) => (
              <AdminTag key={t.hours_before}>
                {t.hours_before}h before · {t.refund_percentage}% back
              </AdminTag>
            ))
          ) : (
            <AdminTag>Non-refundable</AdminTag>
          )}
        </div>
        <div className="ah-kpi-foot">
          Edit these in the arena&apos;s form on{" "}
          <Link href="/owner/arenas" className="ah-link">
            Arenas
          </Link>
        </div>
      </div>
    </div>
  );
}

function PaymentsInner() {
  const qc = useQueryClient();
  const { data: arenaPage, isLoading: arenasLoading } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [pickedId, setPickedId] = useArenaParam();
  const picked = arenas.find((a) => a.id === pickedId);
  const scope = picked ? [picked] : arenas;
  const arenaName = new Map(arenas.map((a) => [a.id, a.name]));

  const asked = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(asked === "refunds" || asked === "discounts" ? asked : "bank");
  const [toast, showToast] = useToast();
  const { data: waitingRefunds } = usePendingRefundCount();

  const discountQueries = useQueries({
    queries: scope.map((a) => ({ queryKey: ["discounts", a.id], queryFn: () => listDiscounts(a.id) })),
  });
  const discounts = discountQueries.flatMap((q) => q.data ?? []);
  const discountsLoading = discountQueries.some((q) => q.isLoading);
  const discountsFailed = discountQueries.some((q) => q.isError);

  const [formOpen, setFormOpen] = useFormDialog();
  const [editing, setEditing] = useState<DiscountCode | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const formArenaId = editing?.arena_id ?? picked?.id;

  async function remove(d: DiscountCode) {
    setError(null);
    try {
      await deleteDiscount(d.arena_id, d.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not delete ${d.code}.`);
    } finally {
      await qc.invalidateQueries({ queryKey: ["discounts", d.arena_id] });
    }
  }

  const status = (d: DiscountCode) => <AdminBadge tone={d.is_active ? "ok" : "idle"}>{d.is_active ? "Active" : "Paused"}</AdminBadge>;
  const used = (d: DiscountCode) => `${d.used_count}${d.max_uses ? ` of ${d.max_uses}` : ""} used`;
  const actions = (d: DiscountCode) => (
    <div className="ah-row-actions">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditing(d);
          setFormOpen(true);
        }}
      >
        Edit
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          if (confirm(`Delete code “${d.code}”?`)) void remove(d);
        }}
      >
        Delete
      </Button>
    </div>
  );

  const tabs: { key: Tab; label: string; count?: number; wait?: boolean }[] = [
    { key: "bank", label: "Bank accounts" },
    { key: "discounts", label: "Discount codes", count: discountsLoading ? undefined : discounts.length },
    { key: "refunds", label: "Refunds", count: waitingRefunds, wait: true },
  ];

  return (
    <>
      <PageHeader title="Payments" subtitle={`Bank accounts, discount codes and refunds you owe players · ${picked ? picked.name : "All arenas"}`}>
        {tab === "discounts" && (
          <Button
            className="ah-lime"
            disabled={!picked}
            title={picked ? undefined : "Choose an arena above first"}
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add code
          </Button>
        )}
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {picked && <Policy arena={picked} />}
        {error && (
          <div className="ah-card-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <section className="ah-card">
          <div className="ah-tabs ah-tabs-scroll" role="tablist" aria-label="Payment sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`panel-${t.key}`}
                className={tab === t.key ? "ah-tab is-on" : "ah-tab"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.wait ? (
                  !!t.count && (
                    <span className="ah-tab-count ah-tag ah-tab-wait" aria-label={`${t.count} waiting`}>
                      {t.count}
                    </span>
                  )
                ) : (
                  t.count != null && <span className="ah-tab-count ah-tag">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {arenasLoading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
          {!arenasLoading && arenas.length === 0 && (
            <AdminEmpty>Register an arena first, then set up its payments here.</AdminEmpty>
          )}

          {tab === "bank" && arenas.length > 0 && (
            <div id="panel-bank" role="tabpanel" aria-labelledby="tab-bank" className="ah-card-body">
              <p className="ah-field-hint" style={{ marginBottom: 14 }}>
                Players see these when they pay by Bank transfer. The default account is listed first;
                inactive accounts are hidden from players.
              </p>
              {scope.map((a) => (
                <div key={a.id} className="ah-bank-group">
                  {!picked && <h3 className="ah-h3">{a.name}</h3>}
                  <BankDetailsForm arenaId={a.id} />
                </div>
              ))}
            </div>
          )}

          {tab === "refunds" && arenas.length > 0 && <RefundsTab arenas={arenas} arenaId={pickedId} onArena={setPickedId} onToast={showToast} />}

          {tab === "discounts" && arenas.length > 0 && (
            <div id="panel-discounts" role="tabpanel" aria-labelledby="tab-discounts">
              {discountsLoading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
              {!discountsLoading && discountsFailed && (
                <div className="ah-card-body">
                  <div className="ah-card-error" role="alert">
                    <span>Could not load the discount codes.</span>
                    <button type="button" className="ah-link" onClick={() => discountQueries.forEach((q) => void q.refetch())}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {!discountsLoading && !discountsFailed && discounts.length === 0 && (
                <AdminEmpty>
                  {picked ? "No discount codes yet. Click “Add code” to create one." : "No discount codes yet. Choose an arena above to add one."}
                </AdminEmpty>
              )}
              {!discountsLoading && discounts.length > 0 && (
                <>
                  <div className="ah-only-wide">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          {!picked && <TableHead>Arena</TableHead>}
                          <TableHead>Discount</TableHead>
                          <TableHead>Valid</TableHead>
                          <TableHead className="ah-r">Uses</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="ah-r">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discounts.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>
                              <div className="ah-strong ah-mono">{d.code}</div>
                              {d.description && <div className="ah-sub">{d.description}</div>}
                            </TableCell>
                            {!picked && <TableCell className="ah-t2">{arenaName.get(d.arena_id) ?? ""}</TableCell>}
                            <TableCell>
                              <div>{discountText(d)}</div>
                              {Number(d.min_booking_amount) > 0 && (
                                <div className="ah-sub">On {formatRs(d.min_booking_amount)} or more</div>
                              )}
                            </TableCell>
                            <TableCell className="ah-t2 tabular-nums">{validity(d)}</TableCell>
                            <TableCell className="ah-r tabular-nums">{used(d)}</TableCell>
                            <TableCell>{status(d)}</TableCell>
                            <TableCell className="ah-r">{actions(d)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="ah-cards">
                    {discounts.map((d) => (
                      <li key={d.id}>
                        <div className="ah-card-line">
                          <span className="ah-strong ah-mono">{d.code}</span>
                          {status(d)}
                        </div>
                        {(d.description || !picked) && (
                          <div className="ah-sub">
                            {[d.description, picked ? null : arenaName.get(d.arena_id)].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        <div className="ah-card-line">
                          <span>{discountText(d)}</span>
                          <span className="ah-sub tabular-nums">{used(d)}</span>
                        </div>
                        <div className="ah-sub">{validity(d)}</div>
                        {actions(d)}
                      </li>
                    ))}
                  </ul>
                  <div className="ah-tbl-foot">
                    <span>{plural(discounts.length, "code")}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <Toast message={toast} />

      {formOpen && formArenaId && (
        <DiscountForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arenaId={formArenaId}
          discount={editing}
        />
      )}
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsInner />
    </Suspense>
  );
}
