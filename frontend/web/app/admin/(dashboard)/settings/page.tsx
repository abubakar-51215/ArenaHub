"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const TABS = ["General", "Email", "SMS", "Payment Gateways", "Booking Settings", "Notifications", "Security"] as const;
type Tab = (typeof TABS)[number];

const NOT_WIRED_TABS: Record<Exclude<Tab, "General" | "Security">, string> = {
  Email: "SMTP/SendGrid configuration lands with the notification module.",
  SMS: "SMS provider configuration lands with the notification module.",
  "Payment Gateways": "Gateway credentials are managed via server-side .env, not this panel.",
  "Booking Settings": "Platform-wide booking policy defaults aren't scoped yet — per-arena rules already live on the owner dashboard.",
  Notifications: "Notification event toggles land with the notification module.",
};

function GeneralTab() {
  const { data, isLoading, update } = usePlatformSettings();
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Label htmlFor="site-name">Site name</Label>
        <Input id="site-name" value={form.site_name} onChange={(e) => set("site_name", e.target.value)} />
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
          <Input id="site-phone" value={form.site_phone} onChange={(e) => set("site_phone", e.target.value)} />
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
          <Input id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        <Button
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={update.isPending}
          onClick={() => update.mutate(form, { onSuccess: () => setSaved(true) })}
        >
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
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
            Showing {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of{" "}
            {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
        {tab === "Security" && <SecurityTab />}
        {tab !== "General" && tab !== "Security" && (
          <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{NOT_WIRED_TABS[tab]}</p>
          </div>
        )}
      </div>
    </>
  );
}
