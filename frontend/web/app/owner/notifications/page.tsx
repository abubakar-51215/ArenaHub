"use client";

/**
 * Owner Notifications: the full list in the bell popover's style (icon,
 * title, body, time, unread marker) inside one card, with the existing
 * actions: opening an unread notice marks it read, and "Mark all read".
 * The admin's arena notices (suspended, live again, removed) carry the
 * arena name and reason in their body, shown in full. The list is the
 * latest 50, as before. Empty state: the prototype's icon-and-text block.
 */
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CalendarX,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";

import { AdminCard, AdminEmpty, AdminTag } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { useNotificationActions, useNotifications } from "@/hooks/useNotifications";
import { ownerNoticeTarget } from "@/lib/notice-target";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/services/notifications";

type Tone = "ok" | "off" | "wait" | "idle";

const EVENT_ICON: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: Tone }
> = {
  new_confirmed_booking: { icon: CalendarCheck, tone: "ok" },
  booking_confirmed: { icon: CalendarCheck, tone: "ok" },
  booking_cancelled: { icon: CalendarX, tone: "off" },
  booking_payment_failed: { icon: AlertCircle, tone: "off" },
  refund_initiated: { icon: Wallet, tone: "idle" },
  refund_completed: { icon: Wallet, tone: "idle" },
  balance_paid: { icon: Wallet, tone: "ok" },
  booking_reminder_24h: { icon: Clock, tone: "wait" },
  booking_reminder_1h: { icon: Clock, tone: "wait" },
  // the admin's arena notices
  arena_suspended: { icon: ShieldAlert, tone: "off" },
  arena_reactivated: { icon: ShieldCheck, tone: "ok" },
  arena_deleted: { icon: Trash2, tone: "off" },
  account_suspended: { icon: ShieldAlert, tone: "off" },
  account_reactivated: { icon: ShieldCheck, tone: "ok" },
};
const DEFAULT_ICON = { icon: Bell, tone: "idle" as Tone };

/** The backend writes "1 new confirmed booking(s)"; show the right plural. */
function bodyText(n: AppNotification): string {
  return n.body.replace(
    /(\d+) new confirmed booking\(s\)/,
    (_m, c: string) => `${c} new confirmed ${c === "1" ? "booking" : "bookings"}`,
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function OwnerNotificationsPage() {
  const { data, isLoading, isError, refetch } = useNotifications();
  const { markRead, markAllRead } = useNotificationActions();

  const notifications = data?.items ?? [];
  const unread = data?.unread_count ?? 0;
  const total = data?.total ?? notifications.length;

  const router = useRouter();
  // a tap marks the notice read and opens what it is about (the booking list, refunds, the review), as on the phone
  function onOpen(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id);
    const target = ownerNoticeTarget(n);
    if (target) router.push(target);
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={isLoading ? undefined : unread ? `${unread} unread` : "You're all caught up"}
      >
        <Button
          variant="outline"
          disabled={unread === 0 || markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          Mark all read
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in">
        <AdminCard
          title="All notifications"
          actions={unread ? <AdminTag>{unread} unread</AdminTag> : undefined}
        >
          {isLoading && <p className="ah-empty-line ah-pitch-note">Loading…</p>}
          {isError && !data && (
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load your notifications.</span>
                <button type="button" className="ah-link" onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {data && notifications.length === 0 && (
            <AdminEmpty>
              No notifications yet. New bookings, cancellations and payments will show up here.
            </AdminEmpty>
          )}
          {notifications.length > 0 && (
            <ul className="ah-notes">
              {notifications.map((n) => {
                const { icon: Icon, tone } = EVENT_ICON[n.event] ?? DEFAULT_ICON;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn("ah-note-row", !n.read_at && "is-unread")}
                      onClick={() => onOpen(n)}
                      aria-label={`${n.title}${n.read_at ? "" : ", unread"}${ownerNoticeTarget(n) ? ". Open" : n.read_at ? "" : ". Mark as read"}`}
                    >
                      <span className={cn("ah-note-ico", `ah-note-${tone}`)} aria-hidden="true">
                        <Icon className="size-4" />
                      </span>
                      <span className="ah-note-text">
                        <b>{n.title}</b>
                        <span>{bodyText(n)}</span>
                        <small>{timeAgo(n.created_at)}</small>
                      </span>
                      <span
                        className={n.read_at ? "ah-pop-dot is-read" : "ah-pop-dot"}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {total > notifications.length && (
            <div className="ah-tbl-foot">
              <span>
                Showing the latest {notifications.length} of {total}
              </span>
            </div>
          )}
        </AdminCard>
      </div>
    </>
  );
}
