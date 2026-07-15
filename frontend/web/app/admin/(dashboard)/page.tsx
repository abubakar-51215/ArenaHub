"use client";

import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { useDashboardMetrics } from "@/hooks/useAdmin";
import { formatRs } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
      <span className="mt-1 block text-xs font-medium text-blue-600">View All</span>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useDashboardMetrics();

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="space-y-6 p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Users"
            value={isLoading ? "—" : String((data?.total_players ?? 0) + (data?.total_owners ?? 0))}
          />
          <StatCard
            label="Total Bookings"
            value={isLoading ? "—" : String(data?.bookings_all_time ?? 0)}
          />
          <StatCard
            label="Total Revenue"
            value={isLoading ? "—" : formatRs(data?.total_revenue ?? 0)}
          />
          <StatCard
            label="Active Arenas"
            value={isLoading ? "—" : String(data?.approved_arenas ?? 0)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat
            label="Pending Arena Approvals"
            value={isLoading ? "—" : String(data?.pending_arenas ?? 0)}
            href="/admin/arenas"
          />
          <MiniStat
            label="Open Complaints"
            value={isLoading ? "—" : String(data?.active_complaints ?? 0)}
            href="/admin/complaints"
          />
          <MiniStat
            label="Today's Bookings"
            value={isLoading ? "—" : String(data?.bookings_today ?? 0)}
            href="/admin/bookings"
          />
          <MiniStat
            label="This Month's Bookings"
            value={isLoading ? "—" : String(data?.bookings_this_month ?? 0)}
            href="/admin/bookings"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 font-semibold text-foreground">Players</h3>
            <p className="text-2xl font-bold text-foreground">
              {isLoading ? "—" : data?.total_players}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 font-semibold text-foreground">Arena Owners</h3>
            <p className="text-2xl font-bold text-foreground">
              {isLoading ? "—" : data?.total_owners}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 font-semibold text-foreground">
              Arenas (Pending / Approved / Rejected)
            </h3>
            <p className="text-2xl font-bold text-foreground">
              {isLoading
                ? "—"
                : `${data?.pending_arenas} / ${data?.approved_arenas} / ${data?.rejected_arenas}`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
