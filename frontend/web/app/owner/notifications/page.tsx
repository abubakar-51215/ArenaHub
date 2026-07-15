"use client";

import { AlertCircle, Bell, CalendarCheck, CalendarX, Clock, Wallet } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { useNotificationActions, useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/services/notifications";

const EVENT_ICON: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  new_confirmed_booking: { icon: CalendarCheck, tone: "text-emerald-600 bg-emerald-600/10" },
  booking_confirmed: { icon: CalendarCheck, tone: "text-emerald-600 bg-emerald-600/10" },
  booking_cancelled: { icon: CalendarX, tone: "text-destructive bg-destructive/10" },
  booking_payment_failed: { icon: AlertCircle, tone: "text-destructive bg-destructive/10" },
  refund_initiated: { icon: Wallet, tone: "text-blue-600 bg-blue-600/10" },
  booking_reminder_24h: { icon: Clock, tone: "text-amber-600 bg-amber-600/10" },
  booking_reminder_1h: { icon: Clock, tone: "text-amber-600 bg-amber-600/10" },
};
const DEFAULT_ICON = { icon: Bell, tone: "text-blue-600 bg-blue-600/10" };

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OwnerNotificationsPage() {
  const { data, isLoading } = useNotifications();
  const { markRead, markAllRead } = useNotificationActions();

  const notifications = data?.items ?? [];
  const unread = data?.unread_count ?? 0;

  function onOpen(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id);
  }

  return (
    <>
      <PageHeader title="Notifications">
        <Button
          variant="outline"
          size="sm"
          disabled={unread === 0 || markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          Mark all read
        </Button>
      </PageHeader>

      <div className="space-y-3 p-8">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && notifications.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <Bell className="mx-auto size-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No notifications yet — new bookings, cancellations, and payments will show up here.
            </p>
          </div>
        )}
        {notifications.map((n) => {
          const { icon: Icon, tone } = EVENT_ICON[n.event] ?? DEFAULT_ICON;
          return (
            <button
              key={n.id}
              onClick={() => onOpen(n)}
              className={cn(
                "flex w-full items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50",
                !n.read_at && "border-blue-600/30 bg-blue-600/[0.03]",
              )}
            >
              <span className={cn("mt-0.5 rounded-full p-2", tone)}>
                <Icon className="size-4" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{n.title}</span>
                  {!n.read_at && <span className="size-2 rounded-full bg-blue-600" />}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {timeAgo(n.created_at)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
