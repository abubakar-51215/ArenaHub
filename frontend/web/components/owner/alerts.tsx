"use client";

/**
 * The owner top bar's bell (prototype `.icon-btn.has-dot`): a popover with
 * the owner's latest real notifications and a "See all" link to the
 * notification centre. Same popover look as the admin alerts (.ah-pop).
 */
import { useState } from "react";
import Link from "next/link";
import { Popover as PopoverPrimitive } from "radix-ui";

import { useNotificationActions, useNotifications } from "@/hooks/useNotifications";
import { formatDateShort } from "@/lib/format";
import { ownerNoticeTarget } from "@/lib/notice-target";

const SHOWN = 5;

export function OwnerAlerts() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useNotifications();
  const { markRead } = useNotificationActions();
  const unread = data?.unread_count ?? 0;
  const items = (data?.items ?? []).slice(0, SHOWN);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={unread ? "ah-icon-btn has-dot" : "ah-icon-btn"}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="ah-pop"
          align="end"
          sideOffset={8}
          aria-label="Notifications"
        >
          <p className="ah-pop-head">Notifications</p>
          {isLoading && <p className="ah-pop-note">Loading…</p>}
          {isError && <p className="ah-pop-note is-error">Couldn&apos;t load notifications.</p>}
          {!isLoading && !isError && items.length === 0 && (
            <p className="ah-pop-note">No notifications yet</p>
          )}
          {items.map((n) => (
            <Link
              key={n.id}
              href={ownerNoticeTarget(n) ?? "/owner/notifications"}
              className="ah-pop-item"
              onClick={() => {
                if (!n.read_at) markRead.mutate(n.id);
                setOpen(false);
              }}
            >
              <span
                className={n.read_at ? "ah-pop-dot is-read" : "ah-pop-dot"}
                aria-hidden="true"
              />
              <span className="ah-pop-text">
                <b>{n.title}</b>
                <small>
                  {formatDateShort(n.created_at.slice(0, 10))}
                  {n.read_at ? "" : " · unread"}
                </small>
              </span>
            </Link>
          ))}
          <Link href="/owner/notifications" className="ah-pop-all" onClick={() => setOpen(false)}>
            See all
          </Link>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
