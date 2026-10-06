"use client";

import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { AdminKpi } from "@/components/admin/ui";
import { useDashboardMetrics } from "@/hooks/useAdmin";
import { formatRs } from "@/lib/format";

/** The prototype's decision-queue strip: one count per cell, each a link to
 *  the screen that handles it. Our cells are the counts this page already had. */
function QueueCell({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="ah-queue-cell">
      <span className="ah-metric">{value}</span>
      <span className="ah-queue-lbl">{label}</span>
    </Link>
  );
}

function todayLine(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${weekday}, ${date} · all cities`;
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useDashboardMetrics();
  const n = (v: number | undefined) => (isLoading ? "—" : (v ?? 0).toLocaleString("en-US"));

  return (
    <>
      <PageHeader eyebrow={todayLine()} title="Dashboard" />
      <div className="animate-fade-in ah-stack">
        <section className="ah-card">
          <div className="ah-queue">
            <QueueCell label="Arenas to verify" value={n(data?.pending_arenas)} href="/admin/arenas" />
            <QueueCell label="Complaints open" value={n(data?.active_complaints)} href="/admin/complaints" />
            <QueueCell label="Bookings today" value={n(data?.bookings_today)} href="/admin/bookings" />
            <QueueCell
              label="Bookings this month"
              value={n(data?.bookings_this_month)}
              href="/admin/bookings"
            />
          </div>
        </section>

        <div className="stagger ah-grid ah-g-4">
          <AdminKpi
            size="lg"
            label="Total users"
            value={isLoading ? "—" : n((data?.total_players ?? 0) + (data?.total_owners ?? 0))}
          />
          <AdminKpi
            size="lg"
            label="Bookings"
            value={n(data?.bookings_all_time)}
            foot={isLoading ? undefined : `${n(data?.bookings_today)} today`}
          />
          <AdminKpi
            size="lg"
            label="Total revenue"
            value={isLoading ? "—" : formatRs(data?.total_revenue ?? 0)}
          />
          <AdminKpi
            size="lg"
            label="Live arenas"
            value={n(data?.approved_arenas)}
            foot={isLoading ? undefined : `${n(data?.pending_arenas)} pending review`}
          />
        </div>

        <div className="ah-grid ah-g-3">
          <AdminKpi label="Players" value={n(data?.total_players)} />
          <AdminKpi label="Arena owners" value={n(data?.total_owners)} />
          <AdminKpi
            label="Arenas pending / approved / rejected"
            value={
              isLoading
                ? "—"
                : `${data?.pending_arenas} / ${data?.approved_arenas} / ${data?.rejected_arenas}`
            }
          />
        </div>
      </div>
    </>
  );
}
