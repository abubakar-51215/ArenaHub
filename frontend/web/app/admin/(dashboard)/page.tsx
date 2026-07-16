"use client";

import Link from "next/link";
import { Building2, CalendarCheck, Users, Wallet } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { useDashboardMetrics } from "@/hooks/useAdmin";
import { formatRs } from "@/lib/format";

function MiniStat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="card-elevated rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
      <span className="mt-1 block text-xs font-medium text-primary">View All →</span>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useDashboardMetrics();

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of system activities" />
      <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Users"
            value={isLoading ? "—" : String((data?.total_players ?? 0) + (data?.total_owners ?? 0))}
            icon={Users}
            tone="blue"
          />
          <StatCard
            label="Total Bookings"
            value={isLoading ? "—" : String(data?.bookings_all_time ?? 0)}
            icon={CalendarCheck}
            tone="violet"
          />
          <StatCard
            label="Total Revenue"
            value={isLoading ? "—" : formatRs(data?.total_revenue ?? 0)}
            icon={Wallet}
            tone="green"
          />
          <StatCard
            label="Active Arenas"
            value={isLoading ? "—" : String(data?.approved_arenas ?? 0)}
            icon={Building2}
            tone="amber"
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
          <div className="shadow-card rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 font-semibold text-foreground">Players</h3>
            <p className="text-2xl font-bold text-foreground">
              {isLoading ? "—" : data?.total_players}
            </p>
          </div>
          <div className="shadow-card rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 font-semibold text-foreground">Arena Owners</h3>
            <p className="text-2xl font-bold text-foreground">
              {isLoading ? "—" : data?.total_owners}
            </p>
          </div>
          <div className="shadow-card rounded-xl border border-border bg-card p-5">
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
