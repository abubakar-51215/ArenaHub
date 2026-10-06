"use client";

/**
 * Alerts button + popover for the Dashboard top bar. Everything in it comes
 * from the dashboard counts the page already loads (same query key, so there
 * is no extra request): arenas awaiting approval and open complaints, each
 * linking to the page that handles it. The red dot shows only when something
 * is waiting.
 */
import Link from "next/link";
import { useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { useDashboardMetrics } from "@/hooks/useAdmin";

interface Alert {
  key: string;
  tone: "arena" | "flag";
  title: string;
  sub: string;
  href: string;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function AdminAlerts() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useDashboardMetrics();

  const alerts: Alert[] = [];
  if (data && data.pending_arenas > 0) {
    alerts.push({
      key: "arenas",
      tone: "arena",
      title: `${plural(data.pending_arenas, "arena", "arenas")} awaiting approval`,
      sub: "Review in Approvals",
      href: "/admin/arenas",
    });
  }
  if (data && data.active_complaints > 0) {
    alerts.push({
      key: "complaints",
      tone: "flag",
      title: `${plural(data.active_complaints, "open complaint", "open complaints")}`,
      sub: "Open in Complaints",
      href: "/admin/complaints",
    });
  }
  const waiting = alerts.length > 0;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={waiting ? "ah-icon-btn has-dot" : "ah-icon-btn"}
          aria-label={waiting ? `Alerts, ${alerts.length} waiting` : "Alerts"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="ah-pop" align="end" sideOffset={8} aria-label="Alerts">
          <p className="ah-pop-head">Needs attention</p>
          {isLoading && <p className="ah-pop-note">Loading…</p>}
          {isError && <p className="ah-pop-note is-error">Couldn&apos;t load alerts.</p>}
          {!isLoading && !isError && !waiting && <p className="ah-pop-note">Nothing needs attention</p>}
          {alerts.map((a) => (
            <Link key={a.key} href={a.href} className="ah-pop-item" onClick={() => setOpen(false)}>
              <span className={`ah-alert-ico ah-alert-${a.tone}`} aria-hidden="true">
                {a.tone === "arena" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <path d="M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
                  </svg>
                )}
              </span>
              <span className="ah-pop-text">
                <b>{a.title}</b>
                <small>{a.sub}</small>
              </span>
            </Link>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
