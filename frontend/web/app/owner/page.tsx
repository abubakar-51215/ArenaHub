"use client";

import Link from "next/link";
import { Building2, CheckCircle2, Clock, LayoutGrid } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { useAuthStore } from "@/store/auth";
import { useMyArenas } from "@/hooks/useArenas";

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

  const approved = arenas.filter((a) => a.status === "approved").length;
  const pending = arenas.filter((a) => a.status === "pending").length;

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="space-y-6 p-8">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Welcome back{user ? `, ${user.full_name.split(" ")[0]}` : ""}.
          </h2>
          <p className="text-sm text-muted-foreground">
            Here&apos;s an overview of your arena portfolio. Booking, revenue, and occupancy
            analytics arrive with the booking engine.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Arenas" value={isLoading ? "—" : arenas.length} icon={Building2} />
          <StatCard label="Approved" value={isLoading ? "—" : approved} icon={CheckCircle2} />
          <StatCard label="Pending Review" value={isLoading ? "—" : pending} icon={Clock} />
          <StatCard
            label="Sports Offered"
            value={isLoading ? "—" : new Set(arenas.flatMap((a) => a.sports_offered)).size}
            icon={LayoutGrid}
          />
        </div>

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
      </div>
    </>
  );
}
