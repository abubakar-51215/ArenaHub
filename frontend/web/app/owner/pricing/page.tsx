"use client";

/**
 * Owner Pricing Rules, styled as the owner prototype's Pricing screen: page
 * head, a small KPI strip counted from the loaded rules, and the rules
 * table (court, rule, days, hours, multiplier, the rate per hour it gives,
 * status, actions). The model stays the multiplier on the court's base
 * price; the rate is shown only when both numbers are loaded. The arena
 * comes from the top bar picker ("All arenas" lists every arena's rules).
 * Rules load per court, so there is no pager. Left out: the Suggestion and
 * Deposit policy cards and "Applies to" (no data for them).
 */
import { Suspense, useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import { AdminBadge, AdminCard, AdminEmpty, AdminKpi, AdminTag } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { PricingRuleForm } from "@/components/owner/pricing-rule-form";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { useFormDialog } from "@/hooks/useFormDialog";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatRs, formatTime, plural } from "@/lib/format";
import { ApiError } from "@/services/api";
import { listCourts } from "@/services/courts";
import { deletePricingRule, listPricingRules } from "@/services/pricing";
import { type Court, type PricingRule, WEEKDAY_LABELS } from "@/types";

interface Row {
  court: Court;
  arenaName: string;
  rule: PricingRule;
}

function Pricing() {
  const qc = useQueryClient();
  const { data: arenaPage, isLoading: arenasLoading } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [pickedId] = useArenaParam();
  const picked = arenas.find((a) => a.id === pickedId);
  const scope = picked ? [picked] : arenas;

  const courtQueries = useQueries({
    queries: scope.map((a) => ({ queryKey: ["courts", a.id], queryFn: () => listCourts(a.id) })),
  });
  const courts = courtQueries.flatMap((q) => q.data ?? []);
  const arenaName = new Map(arenas.map((a) => [a.id, a.name]));

  const ruleQueries = useQueries({
    queries: courts.map((c) => ({ queryKey: ["pricing", c.id], queryFn: () => listPricingRules(c.id) })),
  });
  const rows: Row[] = courts.flatMap((court, i) =>
    (ruleQueries[i]?.data ?? []).map((rule) => ({ court, arenaName: arenaName.get(court.arena_id) ?? "", rule })),
  );
  const loading = arenasLoading || courtQueries.some((q) => q.isLoading) || ruleQueries.some((q) => q.isLoading);
  const failed = courtQueries.some((q) => q.isError) || ruleQueries.some((q) => q.isError);

  const [error, setError] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: ({ courtId, ruleId }: { courtId: string; ruleId: string }) => deletePricingRule(courtId, ruleId),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["pricing", v.courtId] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not delete this rule."),
  });

  const [formOpen, setFormOpen] = useFormDialog();
  const [editing, setEditing] = useState<PricingRule | undefined>(undefined);
  // under "All arenas" the form's court list names the arena too
  const formCourts = picked ? courts : courts.map((c) => ({ ...c, name: `${c.name} · ${arenaName.get(c.arena_id) ?? ""}` }));

  const active = rows.filter((r) => r.rule.is_active).length;
  const courtsWithRules = new Set(rows.map((r) => r.court.id)).size;

  const days = (r: PricingRule) => (r.weekday != null ? WEEKDAY_LABELS[r.weekday] : "Every day");
  const hours = (r: PricingRule) => `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`;
  const rate = (row: Row) => {
    const base = Number(row.court.base_price);
    const mult = Number(row.rule.price_multiplier);
    return Number.isFinite(base) && Number.isFinite(mult) && base > 0 ? formatRs(Math.round(base * mult)) : null;
  };
  const status = (r: PricingRule) => <AdminBadge tone={r.is_active ? "ok" : "idle"}>{r.is_active ? "Active" : "Paused"}</AdminBadge>;
  const actions = (row: Row) => (
    <div className="ah-row-actions">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditing(row.rule);
          setFormOpen(true);
        }}
      >
        Edit
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={del.isPending}
        onClick={() => {
          setError(null);
          if (confirm(`Delete pricing rule “${row.rule.name}”?`))
            del.mutate({ courtId: row.court.id, ruleId: row.rule.id });
        }}
      >
        Delete
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Pricing Rules" subtitle="A rule multiplies the court's base price in its hours">
        <Button
          className="ah-lime"
          disabled={courts.length === 0}
          title={courts.length === 0 ? "Add a court first" : undefined}
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add rule
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {error && (
          <div className="ah-card-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        {!loading && !failed && rows.length > 0 && (
          <div className="ah-grid ah-g-3">
            <AdminKpi label="Active rules" value={active} foot={`of ${plural(rows.length, "rule")}`} />
            <AdminKpi label="Paused rules" value={rows.length - active} foot="Kept, not charging" />
            <AdminKpi label="Courts with rules" value={courtsWithRules} foot={`of ${plural(courts.length, "court")}`} />
          </div>
        )}

        <AdminCard title="Rules" actions={rows.length > 0 ? <AdminTag>{plural(rows.length, "rule")}</AdminTag> : undefined}>
          {loading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
          {!loading && failed && (
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the rules.</span>
                <button
                  type="button"
                  className="ah-link"
                  onClick={() => [...courtQueries, ...ruleQueries].forEach((q) => void q.refetch())}
                >
                  Try again
                </button>
              </div>
            </div>
          )}
          {!loading && !failed && rows.length === 0 && (
            <AdminEmpty>
              {courts.length === 0
                ? "Add courts before setting pricing rules."
                : "No pricing rules yet. Base court prices apply everywhere until you add one."}
            </AdminEmpty>
          )}
          {!loading && !failed && rows.length > 0 && (
            <>
              <div className="ah-only-wide">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Court</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead className="ah-r">Multiplier</TableHead>
                      <TableHead className="ah-r">Rate / hr</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="ah-r">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.rule.id}>
                        <TableCell>
                          <div className="ah-strong">{row.court.name}</div>
                          <div className="ah-sub">{picked ? `Base ${formatRs(row.court.base_price)}` : row.arenaName}</div>
                        </TableCell>
                        <TableCell>{row.rule.name}</TableCell>
                        <TableCell>{days(row.rule)}</TableCell>
                        <TableCell className="tabular-nums">{hours(row.rule)}</TableCell>
                        <TableCell className="ah-r tabular-nums">×{row.rule.price_multiplier}</TableCell>
                        <TableCell className="ah-r ah-money">{rate(row) ?? "—"}</TableCell>
                        <TableCell>{status(row.rule)}</TableCell>
                        <TableCell className="ah-r">{actions(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="ah-cards">
                {rows.map((row) => (
                  <li key={row.rule.id}>
                    <div className="ah-card-line">
                      <span className="ah-strong">{row.rule.name}</span>
                      {status(row.rule)}
                    </div>
                    <div>
                      <div>
                        {row.court.name}
                        {picked ? "" : ` · ${row.arenaName}`}
                      </div>
                      <div className="ah-sub tabular-nums">
                        {days(row.rule)} · {hours(row.rule)}
                      </div>
                    </div>
                    <div className="ah-card-line">
                      <span className="tabular-nums">×{row.rule.price_multiplier}</span>
                      {rate(row) && (
                        <span className="ah-money">
                          {rate(row)} <span className="ah-sub">/ hr</span>
                        </span>
                      )}
                    </div>
                    {actions(row)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </AdminCard>
      </div>

      {formOpen && (
        <PricingRuleForm
          key={editing?.id ?? "new"}
          open={formOpen}
          onOpenChange={setFormOpen}
          courts={formCourts}
          rule={editing}
        />
      )}
    </>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <Pricing />
    </Suspense>
  );
}
