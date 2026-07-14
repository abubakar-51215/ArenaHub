"use client";

import Link from "next/link";
import { Building2, CalendarCheck, CalendarDays, Clock, Wallet } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { useAuthStore } from "@/store/auth";
import { useMyArenas } from "@/hooks/useArenas";
import { useDashboardSummary, usePendingApprovals } from "@/hooks/useDashboard";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useMyArenas();
  const arenas = data?.items ?? [];

  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: approvals } = usePendingApprovals(1, 5);
  const approvalItems = approvals?.items ?? [];

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="space-y-6 p-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Welcome back{user ? `, ${user.full_name.split(" ")[0]}` : ""}.
          </h2>
          <p className="text-sm text-muted-foreground">
            Here&apos;s an overview of your arena portfolio, bookings, and revenue.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Total Arenas"
            value={summaryLoading ? "—" : (summary?.total_arenas ?? arenas.length)}
            icon={Building2}
          />
          <StatCard
            label="Bookings Today"
            value={summaryLoading ? "—" : (summary?.bookings_today ?? "—")}
            icon={CalendarCheck}
          />
          <StatCard
            label="Bookings This Month"
            value={summaryLoading ? "—" : (summary?.bookings_this_month ?? "—")}
            icon={CalendarDays}
          />
          <StatCard
            label="Monthly Revenue"
            value={summaryLoading ? "—" : `Rs. ${summary?.monthly_revenue ?? "0.00"}`}
            icon={Wallet}
          />
          <StatCard
            label="Pending Approvals"
            value={summaryLoading ? "—" : (summary?.pending_approvals ?? "—")}
            icon={Clock}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">Your Arenas</h3>
              <Link
                href="/owner/arenas"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Manage arenas →
              </Link>
            </div>
            <div className="divide-y divide-border">
              {isLoading && <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>}
              {!isLoading && arenas.length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  No arenas yet.{" "}
                  <Link href="/owner/arenas" className="font-medium text-blue-600 hover:underline">
                    Register your first arena
                  </Link>
                  .
                </p>
              )}
              {arenas.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.city}
                      {a.area ? ` · ${a.area}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">Pending Approvals</h3>
              <Link
                href="/owner/bookings"
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                View all →
              </Link>
            </div>
            <div className="divide-y divide-border">
              {approvalItems.length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  Nothing waiting on you right now.
                </p>
              )}
              {approvalItems.map((a) => (
                <div key={a.booking_id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-foreground">{a.player_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.arena_name} · {a.booking_date} · Rs. {a.total_amount}
                    </p>
                  </div>
                  <StatusBadge status="pending_approval" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
