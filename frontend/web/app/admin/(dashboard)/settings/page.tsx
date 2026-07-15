"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuditLogs, usePlatformSettings } from "@/hooks/useAdmin";
import { formatDate } from "@/lib/format";
import type { PlatformSettings } from "@/types";

const TABS = [
  "General",
  "Email",
  "SMS",
  "Payment Gateways",
  "Booking Settings",
  "Notifications",
  "Security",
] as const;
type Tab = (typeof TABS)[number];

/** Shared shape for every settings tab: load the singleton row into local
 * form state once, edit a slice of it, and PUT the whole object back so
 * other tabs' fields survive the round trip. */
function useSettingsForm() {
  const { data, isLoading, update } = usePlatformSettings();
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  return { form, isLoading, saved, setSaved, set, update };
}

function SaveBar({
  saved,
  pending,
  onSave,
}: {
  saved: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      <Button
        className="bg-emerald-600 text-white hover:bg-emerald-700"
        disabled={pending}
        onClick={onSave}
      >
        {pending ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  );
}

function EmailTab() {
  const { form, isLoading, saved, setSaved, set, update } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        SMTP credentials are configured server-side (backend .env), not here — this only controls
        whether email notifications go out and what name they&apos;re sent from.
      </p>
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Email notifications</p>
          <p className="text-xs text-muted-foreground">
            OTPs always send; this toggles booking/payment/reminder emails.
          </p>
        </div>
        <Switch
          checked={form.email.enabled}
          onCheckedChange={(v) => set("email", { ...form.email, enabled: v })}
        />
      </div>
      <div>
        <Label htmlFor="email-from-name">From name</Label>
        <Input
          id="email-from-name"
          value={form.email.from_name}
          onChange={(e) => set("email", { ...form.email, from_name: e.target.value })}
        />
      </div>
      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
      />
    </div>
  );
}

function SmsTab() {
  const { form, isLoading, saved, setSaved, set, update } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        No SMS gateway is wired up yet — OTP/verification delivery is email-only for now. This
        toggle records intent so it isn&apos;t lost once a provider is connected.
      </p>
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">SMS notifications</p>
          <p className="text-xs text-muted-foreground">Has no effect until a provider is wired.</p>
        </div>
        <Switch
          checked={form.sms.enabled}
          onCheckedChange={(v) => set("sms", { ...form.sms, enabled: v })}
        />
      </div>
      <div>
        <Label htmlFor="sms-provider">Provider (informational)</Label>
        <Input
          id="sms-provider"
          placeholder="e.g. Twilio"
          value={form.sms.provider}
          onChange={(e) => set("sms", { ...form.sms, provider: e.target.value })}
        />
      </div>
      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
      />
    </div>
  );
}

function PaymentGatewaysTab() {
  const { form, isLoading, saved, setSaved, set, update } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const gateways: { key: keyof PlatformSettings["payment_gateways"]; label: string }[] = [
    { key: "card_enabled", label: "Card (Stripe)" },
    { key: "jazzcash_enabled", label: "JazzCash" },
    { key: "easypaisa_enabled", label: "EasyPaisa" },
    { key: "bank_transfer_enabled", label: "Bank Transfer" },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Gateway credentials are managed via server-side .env, not this panel — these toggles just
        control which payment methods players can choose at checkout.
      </p>
      {gateways.map((g) => (
        <div
          key={g.key}
          className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
        >
          <p className="text-sm font-medium text-foreground">{g.label}</p>
          <Switch
            checked={form.payment_gateways[g.key]}
            onCheckedChange={(v) =>
              set("payment_gateways", { ...form.payment_gateways, [g.key]: v })
            }
          />
        </div>
      ))}
      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
      />
    </div>
  );
}

function BookingSettingsTab() {
  const { form, isLoading, saved, setSaved, set, update } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Platform-wide defaults; individual arenas can still override advance-payment percentage on
        their own listing.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="advance-pct">Default advance payment %</Label>
          <Input
            id="advance-pct"
            type="number"
            min={0}
            max={100}
            value={form.booking_policy.default_advance_percentage}
            onChange={(e) =>
              set("booking_policy", {
                ...form.booking_policy,
                default_advance_percentage: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="auto-cancel-hours">Auto-cancel unpaid bookings after (hours)</Label>
          <Input
            id="auto-cancel-hours"
            type="number"
            min={1}
            value={form.booking_policy.auto_cancel_hours}
            onChange={(e) =>
              set("booking_policy", {
                ...form.booking_policy,
                auto_cancel_hours: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="min-advance-hours">Minimum booking lead time (hours)</Label>
          <Input
            id="min-advance-hours"
            type="number"
            min={0}
            value={form.booking_policy.min_advance_hours}
            onChange={(e) =>
              set("booking_policy", {
                ...form.booking_policy,
                min_advance_hours: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="max-advance-days">Maximum booking window (days)</Label>
          <Input
            id="max-advance-days"
            type="number"
            min={1}
            value={form.booking_policy.max_advance_days}
            onChange={(e) =>
              set("booking_policy", {
                ...form.booking_policy,
                max_advance_days: Number(e.target.value),
              })
            }
          />
        </div>
      </div>
      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
      />
    </div>
  );
}

function NotificationsTab() {
  const { form, isLoading, saved, setSaved, set, update } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const events: { key: keyof PlatformSettings["notifications"]; label: string }[] = [
    { key: "booking_enabled", label: "Booking confirmations/cancellations" },
    { key: "payment_enabled", label: "Payment/refund updates" },
    { key: "reminder_enabled", label: "Upcoming booking reminders" },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Platform-wide kill switches for each notification category — a player&apos;s own in-app
        preferences still apply on top of these.
      </p>
      {events.map((ev) => (
        <div
          key={ev.key}
          className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
        >
          <p className="text-sm font-medium text-foreground">{ev.label}</p>
          <Switch
            checked={form.notifications[ev.key]}
            onCheckedChange={(v) => set("notifications", { ...form.notifications, [ev.key]: v })}
          />
        </div>
      ))}
      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
      />
    </div>
  );
}

function GeneralTab() {
  const { form, isLoading, saved, setSaved, set, update } = useSettingsForm();

  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Label htmlFor="site-name">Site name</Label>
        <Input
          id="site-name"
          value={form.site_name}
          onChange={(e) => set("site_name", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="site-description">Site description</Label>
        <Textarea
          id="site-description"
          value={form.site_description}
          onChange={(e) => set("site_description", e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="site-email">Site email</Label>
          <Input
            id="site-email"
            type="email"
            value={form.site_email}
            onChange={(e) => set("site_email", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="site-phone">Site phone</Label>
          <Input
            id="site-phone"
            value={form.site_phone}
            onChange={(e) => set("site_phone", e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currency">Default currency</Label>
          <Input
            id="currency"
            value={form.default_currency}
            onChange={(e) => set("default_currency", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          />
        </div>
      </div>

      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
      />
    </div>
  );
}

function SecurityTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogs(page);
  const logs = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground">Audit Log</h3>
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && logs.length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>
                  No admin actions recorded yet.
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium text-foreground">{log.actor_name}</TableCell>
                <TableCell className="text-muted-foreground">{log.action}</TableCell>
                <TableCell className="text-muted-foreground">
                  {log.target_type} · {log.target_id.slice(0, 8)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(log.created_at.slice(0, 10))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)}{" "}
            of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("General");

  return (
    <>
      <PageHeader title="System Settings" />
      <div className="space-y-6 p-8">
        <div className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium ${
                tab === t
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "General" && <GeneralTab />}
        {tab === "Email" && <EmailTab />}
        {tab === "SMS" && <SmsTab />}
        {tab === "Payment Gateways" && <PaymentGatewaysTab />}
        {tab === "Booking Settings" && <BookingSettingsTab />}
        {tab === "Notifications" && <NotificationsTab />}
        {tab === "Security" && <SecurityTab />}
      </div>
    </>
  );
}
