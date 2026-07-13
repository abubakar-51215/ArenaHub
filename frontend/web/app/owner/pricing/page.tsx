"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { PricingRuleForm } from "@/components/owner/pricing-rule-form";
import { StatusBadge } from "@/components/owner/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { useCourts } from "@/hooks/useCourts";
import { deletePricingRule, listPricingRules } from "@/services/pricing";
import { type Court, type PricingRule, WEEKDAY_LABELS } from "@/types";

export default function PricingPage() {
  const qc = useQueryClient();
  const { data: arenaPage } = useMyArenas();
  const arenas = arenaPage?.items ?? [];

  const [arenaId, setArenaId] = useState("");
  const activeArena = arenaId || arenas[0]?.id || "";
  const { data: courts } = useCourts(activeArena || null);
  const courtList = useMemo(() => courts ?? [], [courts]);

  // One rules query per court; flattened into a single table.
  const ruleQueries = useQueries({
    queries: courtList.map((c) => ({
      queryKey: ["pricing", c.id],
      queryFn: () => listPricingRules(c.id),
    })),
  });

  const rows = useMemo(() => {
    const out: { court: Court; rule: PricingRule }[] = [];
    courtList.forEach((court, i) => {
      (ruleQueries[i]?.data ?? []).forEach((rule) => out.push({ court, rule }));
    });
    return out;
  }, [courtList, ruleQueries]);

  const del = useMutation({
    mutationFn: ({ courtId, ruleId }: { courtId: string; ruleId: string }) =>
      deletePricingRule(courtId, ruleId),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["pricing", v.courtId] }),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PricingRule | undefined>(undefined);

  const loading = ruleQueries.some((q) => q.isLoading);

  return (
    <>
      <PageHeader title="Pricing Management">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={courtList.length === 0}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="size-4" /> Add Pricing Rule
        </Button>
      </PageHeader>

      <div className="space-y-6 p-8">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-foreground">Arena</label>
          <Select value={activeArena} onChange={(e) => setArenaId(e.target.value)} className="w-64">
            {arenas.length === 0 && <option value="">No arenas yet</option>}
            {arenas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        {courtList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add courts to this arena before setting peak-pricing rules.
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Court</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Multiplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={7}>
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={7}>
                      No pricing rules yet. Base court prices apply everywhere until you add one.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(({ court, rule }) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium text-foreground">{court.name}</TableCell>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.weekday != null ? WEEKDAY_LABELS[rule.weekday] : "Every day"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.start_time.slice(0, 5)} – {rule.end_time.slice(0, 5)}
                    </TableCell>
                    <TableCell>×{rule.price_multiplier}</TableCell>
                    <TableCell>
                      <StatusBadge status={rule.is_active ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Edit"
                          onClick={() => {
                            setEditing(rule);
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
                            if (confirm(`Delete pricing rule “${rule.name}”?`))
                              del.mutate({ courtId: court.id, ruleId: rule.id });
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {formOpen && (
        <PricingRuleForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          courts={courtList}
          rule={editing}
        />
      )}
    </>
  );
}
