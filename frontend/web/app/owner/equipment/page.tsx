"use client";

/**
 * Owner Equipment. The prototype has no Equipment screen, so it uses the
 * same shared parts as the other owner pages: page head, a table card (cards
 * on phones), badges, buttons and the icon-and-text empty state. Each item
 * shows its price per day, its stock with the − / + adjusters, whether it
 * is offered, and Edit and Delete. The arena comes from the top bar picker;
 * "All arenas" lists every arena's items and Add item waits for one arena.
 */
import { Suspense, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import { AdminBadge, AdminCard, AdminEmpty, AdminTag } from "@/components/admin/ui";
import { EquipmentForm } from "@/components/owner/equipment-form";
import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { useFormDialog } from "@/hooks/useFormDialog";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatRs, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import { adjustQuantity, deleteEquipment, listEquipment } from "@/services/equipment";
import type { Equipment } from "@/types";

function EquipmentInner() {
  const qc = useQueryClient();
  const { data: arenaPage, isLoading: arenasLoading } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [pickedId] = useArenaParam();
  const picked = arenas.find((a) => a.id === pickedId);
  const scope = picked ? [picked] : arenas;
  const arenaName = new Map(arenas.map((a) => [a.id, a.name]));

  const queries = useQueries({
    queries: scope.map((a) => ({ queryKey: ["equipment", a.id], queryFn: () => listEquipment(a.id) })),
  });
  const loading = arenasLoading || queries.some((q) => q.isLoading);
  const failed = queries.some((q) => q.isError);
  const items = queries.flatMap((q) => q.data ?? []);

  const [formOpen, setFormOpen] = useFormDialog();
  const [editing, setEditing] = useState<Equipment | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // stock and delete act on the item's own arena, so they work under "All arenas"
  async function run(item: Equipment, action: () => Promise<unknown>) {
    setBusy(item.id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not update ${item.name}.`);
    } finally {
      await qc.invalidateQueries({ queryKey: ["equipment", item.arena_id] });
      setBusy(null);
    }
  }

  const formArenaId = editing?.arena_id ?? picked?.id;
  const offered = items.filter((i) => i.is_active).length;

  const status = (i: Equipment) => (
    <AdminBadge tone={i.is_active ? "ok" : "idle"}>{i.is_active ? "Offered" : "Hidden"}</AdminBadge>
  );
  const stock = (i: Equipment) => (
    <div className="ah-stepper">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`One fewer ${i.name}`}
        disabled={i.quantity_total <= 1 || busy === i.id}
        onClick={() => run(i, () => adjustQuantity(i.id, -1))}
      >
        −
      </Button>
      <span className="tabular-nums">
        <b>{i.quantity_available}</b> of {i.quantity_total} free
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`One more ${i.name}`}
        disabled={busy === i.id}
        onClick={() => run(i, () => adjustQuantity(i.id, 1))}
      >
        +
      </Button>
    </div>
  );
  const actions = (i: Equipment) => (
    <div className="ah-row-actions">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditing(i);
          setFormOpen(true);
        }}
      >
        Edit
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy === i.id}
        onClick={() => {
          if (confirm(`Delete “${i.name}”?`)) void run(i, () => deleteEquipment(i.id));
        }}
      >
        Delete
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Equipment"
        subtitle={
          loading
            ? undefined
            : `${plural(items.length, "item")} · ${offered} offered${picked ? "" : " · choose an arena in the top bar to add an item"}`
        }
      >
        <Button
          className="ah-lime"
          disabled={!picked}
          title={picked ? undefined : "Choose an arena in the top bar first"}
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add item
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {error && (
          <div className="ah-card-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        <AdminCard title="Rental items" actions={items.length > 0 ? <AdminTag>{plural(items.length, "item")}</AdminTag> : undefined}>
          {loading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
          {!loading && failed && (
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the equipment.</span>
                <button type="button" className="ah-link" onClick={() => queries.forEach((q) => void q.refetch())}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {!loading && !failed && items.length === 0 && (
            <AdminEmpty>
              {arenas.length === 0
                ? "Register an arena first, then add rentable equipment here."
                : picked
                  ? "No equipment yet for this arena. Click “Add item” to create one."
                  : "No equipment yet."}
            </AdminEmpty>
          )}
          {!loading && items.length > 0 && (
            <>
              <div className="ah-only-wide">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      {!picked && <TableHead>Arena</TableHead>}
                      <TableHead className="ah-r">Price / day</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="ah-r">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="ah-strong">{i.name}</div>
                          {i.description && <div className="ah-sub">{i.description}</div>}
                        </TableCell>
                        {!picked && <TableCell className="ah-t2">{arenaName.get(i.arena_id) ?? ""}</TableCell>}
                        <TableCell className="ah-r ah-money">{formatRs(i.rental_price)}</TableCell>
                        <TableCell>{stock(i)}</TableCell>
                        <TableCell>{status(i)}</TableCell>
                        <TableCell className="ah-r">{actions(i)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="ah-cards">
                {items.map((i) => (
                  <li key={i.id}>
                    <div className="ah-card-line">
                      <span className="ah-strong">{i.name}</span>
                      {status(i)}
                    </div>
                    {(i.description || !picked) && (
                      <div className="ah-sub">{[i.description, picked ? null : arenaName.get(i.arena_id)].filter(Boolean).join(" · ")}</div>
                    )}
                    <div className="ah-card-line">
                      <span className="ah-money">
                        {formatRs(i.rental_price)} <span className="ah-sub">/ day</span>
                      </span>
                      {stock(i)}
                    </div>
                    {actions(i)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </AdminCard>
      </div>

      {formOpen && formArenaId && (
        <EquipmentForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          arenaId={formArenaId}
          equipment={editing}
        />
      )}
    </>
  );
}

export default function EquipmentPage() {
  return (
    <Suspense fallback={null}>
      <EquipmentInner />
    </Suspense>
  );
}
