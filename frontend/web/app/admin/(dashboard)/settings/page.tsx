"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { AdminEmpty, AdminTableFoot } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs, usePlatformSettings } from "@/hooks/useAdmin";
import { formatDate } from "@/lib/format";
import type { PlatformSettings } from "@/types";

const TABS = [
  "General",
  "Email",
  "SMS",
  "Payment gateways",
  "Booking rules",
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

  const discard = () => {
    if (data) setForm(data);
    setSaved(false);
  };

  return { form, isLoading, saved, setSaved, set, update, discard };
}

function SaveBar({
  saved,
  pending,
  onSave,
  onDiscard,
}: {
  saved: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="ah-save-row">
      <Button disabled={pending} onClick={onSave}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={onDiscard}>
        Discard
      </Button>
      {saved && <span className="ah-saved">Saved.</span>}
    </div>
  );
}

function EmailTab() {
  const { form, isLoading, saved, setSaved, set, update, discard } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        SMTP credentials are configured server-side (backend .env), not here — this only controls
        whether email notifications go out and what name they&apos;re sent from.
      </p>
      <div className="ah-setting-row">
        <div>
          <p className="text-sm font-medium text-foreground">Email notifications</p>
          <p className="text-xs text-muted-foreground">
            OTPs always send; this toggles booking/payment/reminder emails.
          </p>
        </div>
        <Switch
          aria-label="Email notifications"
          checked={form.email.enabled}
          onCheckedChange={(v) => set("email", { ...form.email, enabled: v })}
        />
      </div>
      <div className="ah-field">
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
        onDiscard={discard}
      />
    </div>
  );
}

function SmsTab() {
  const { form, isLoading, saved, setSaved, set, update, discard } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        No SMS gateway is wired up yet — OTP/verification delivery is email-only for now. This
        toggle records intent so it isn&apos;t lost once a provider is connected.
      </p>
      <div className="ah-setting-row">
        <div>
          <p className="text-sm font-medium text-foreground">SMS notifications</p>
          <p className="text-xs text-muted-foreground">Has no effect until a provider is wired.</p>
        </div>
        <Switch
          aria-label="SMS notifications"
          checked={form.sms.enabled}
          onCheckedChange={(v) => set("sms", { ...form.sms, enabled: v })}
        />
      </div>
      <div className="ah-field">
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
        onDiscard={discard}
      />
    </div>
  );
}

function PaymentGatewaysTab() {
  const { form, isLoading, saved, setSaved, set, update, discard } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const gateways: { key: keyof PlatformSettings["payment_gateways"]; label: string }[] = [
    // the four payment options, in the order and with the labels of lib/payment-methods
    { key: "card_enabled", label: "Card" },
    { key: "bank_transfer_enabled", label: "Bank transfer" },
    { key: "jazzcash_enabled", label: "JazzCash" },
    { key: "easypaisa_enabled", label: "EasyPaisa" },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Gateway credentials are managed via server-side .env, not this panel — these toggles just
        control which payment methods players can choose at checkout.
      </p>
      {gateways.map((g) => (
        <div key={g.key} className="ah-setting-row">
          <p className="text-sm font-medium text-foreground">{g.label}</p>
          <Switch
            aria-label={g.label}
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
        onDiscard={discard}
      />
    </div>
  );
}

function BookingSettingsTab() {
  const { form, isLoading, saved, setSaved, set, update, discard } = useSettingsForm();
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Platform-wide defaults; individual arenas can still override advance-payment percentage on
        their own listing.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="ah-field">
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
        <div className="ah-field">
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
        <div className="ah-field">
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
        <div className="ah-field">
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
        onDiscard={discard}
      />
    </div>
  );
}

function NotificationsTab() {
  const { form, isLoading, saved, setSaved, set, update, discard } = useSettingsForm();
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
        <div key={ev.key} className="ah-setting-row">
          <p className="text-sm font-medium text-foreground">{ev.label}</p>
          <Switch
            aria-label={ev.label}
            checked={form.notifications[ev.key]}
            onCheckedChange={(v) => set("notifications", { ...form.notifications, [ev.key]: v })}
          />
        </div>
      ))}
      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
        onDiscard={discard}
      />
    </div>
  );
}

function GeneralTab() {
  const { form, isLoading, saved, setSaved, set, update, discard } = useSettingsForm();

  if (isLoading || !form) return <p className="ah-mute">Loading…</p>;

  return (
    <div>
      {/* prototype General tab: a two-column field grid; description and
          address span both columns. Default language, the logo and the
          platform fee are not stored, so they are left out. */}
      <div className="ah-grid ah-g-2" style={{ gap: 16 }}>
        <div className="ah-field">
          <Label htmlFor="site-name">Platform name</Label>
          <Input
            id="site-name"
            value={form.site_name}
            onChange={(e) => set("site_name", e.target.value)}
          />
        </div>
        <div className="ah-field">
          <Label htmlFor="site-email">Support email</Label>
          <Input
            id="site-email"
            type="email"
            value={form.site_email}
            onChange={(e) => set("site_email", e.target.value)}
          />
        </div>
        <div className="ah-field">
          <Label htmlFor="site-phone">Support phone</Label>
          <Input
            id="site-phone"
            value={form.site_phone}
            onChange={(e) => set("site_phone", e.target.value)}
          />
        </div>
        <div className="ah-field">
          <Label htmlFor="currency">Default currency</Label>
          <Select
            id="currency"
            value={form.default_currency}
            onChange={(e) => set("default_currency", e.target.value)}
          >
            <option value="PKR">PKR (Rs.)</option>
            {form.default_currency !== "PKR" && (
              <option value={form.default_currency}>{form.default_currency}</option>
            )}
          </Select>
        </div>
        <div className="ah-field">
          <Label htmlFor="timezone">Timezone</Label>
          <Select
            id="timezone"
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          >
            <option value="Asia/Karachi">Asia/Karachi (UTC+05:00)</option>
            {form.timezone !== "Asia/Karachi" && (
              <option value={form.timezone}>{form.timezone}</option>
            )}
          </Select>
        </div>
        <div className="ah-field" style={{ gridColumn: "1 / -1" }}>
          <Label htmlFor="site-description">Platform description</Label>
          <Input
            id="site-description"
            value={form.site_description}
            onChange={(e) => set("site_description", e.target.value)}
          />
        </div>
        <div className="ah-field" style={{ gridColumn: "1 / -1" }}>
          <Label htmlFor="address">Registered address</Label>
          <Input
            id="address"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
      </div>

      <SaveBar
        saved={saved}
        pending={update.isPending}
        onSave={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
        onDiscard={discard}
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
      <section className="ah-card">
        <div className="ah-card-head">
          <h2 className="ah-h2">Audit log</h2>
        </div>
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
                <TableCell className="ah-mute" colSpan={4}>
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="p-0">
                  <AdminEmpty>No admin actions recorded yet.</AdminEmpty>
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="ah-strong">{log.actor_name}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell className="ah-t2 tabular-nums">
                  {log.target_type} · {log.target_id.slice(0, 8)}
                </TableCell>
                <TableCell className="ah-t2 tabular-nums">
                  {formatDate(log.created_at.slice(0, 10))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data && data.total > 0 && (
          <AdminTableFoot
            from={(page - 1) * data.page_size + 1}
            to={Math.min(page * data.page_size, data.total)}
            total={data.total}
            page={page}
            pageCount={totalPages}
            onPage={setPage}
          />
        )}
      </section>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("General");

  return (
    <>
      <PageHeader title="System settings" subtitle="Platform-wide configuration" />
      <div className="animate-fade-in">
        <section className="ah-card">
          <div className="ah-tabs">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={tab === t ? "ah-tab is-on" : "ah-tab"}
                aria-current={tab === t ? "page" : undefined}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ah-card-body">
            {tab === "General" && <GeneralTab />}
            {tab === "Email" && <EmailTab />}
            {tab === "SMS" && <SmsTab />}
            {tab === "Payment gateways" && <PaymentGatewaysTab />}
            {tab === "Booking rules" && <BookingSettingsTab />}
            {tab === "Notifications" && <NotificationsTab />}
            {tab === "Security" && <SecurityTab />}
          </div>
        </section>
      </div>
    </>
  );
}
