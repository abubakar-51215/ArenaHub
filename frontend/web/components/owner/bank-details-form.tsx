"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddBankDetails,
  useBankDetails,
  useDeleteBankDetails,
  useUpdateBankDetails,
} from "@/hooks/useBankDetails";
import { ApiError } from "@/services/api";
import type { BankDetailsInput } from "@/services/bank-details";
import type { BankDetails } from "@/types";

function emptyForm(): BankDetailsInput {
  return {
    label: "",
    bank_name: "",
    account_title: "",
    account_number: "",
    iban: "",
    branch_code: "",
    swift_code: "",
    payment_instructions: "",
    is_default: false,
  };
}

function toForm(a: BankDetails): BankDetailsInput {
  return {
    label: a.label ?? "",
    bank_name: a.bank_name,
    account_title: a.account_title,
    account_number: a.account_number,
    iban: a.iban ?? "",
    branch_code: a.branch_code ?? "",
    swift_code: a.swift_code ?? "",
    payment_instructions: a.payment_instructions ?? "",
    is_default: a.is_default,
  };
}

/** Manage an arena's bank-transfer accounts — list existing ones (with the
 * default marked), add new ones, edit, delete, and toggle active. The default
 * active account is what players see first at checkout. */
export function BankDetailsForm({ arenaId }: { arenaId: string }) {
  const { data: accounts, isLoading } = useBankDetails(arenaId);
  const add = useAddBankDetails(arenaId);
  const update = useUpdateBankDetails(arenaId);
  const remove = useDeleteBankDetails(arenaId);

  const [editing, setEditing] = useState<BankDetails | "new" | null>(null);
  const [form, setForm] = useState<BankDetailsInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setForm(emptyForm());
    setEditing("new");
    setError(null);
  }
  function openEdit(a: BankDetails) {
    setForm(toForm(a));
    setEditing(a);
    setError(null);
  }
  function set<K extends keyof BankDetailsInput>(key: K, value: BankDetailsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: BankDetailsInput = {
      label: form.label?.trim() || null,
      bank_name: form.bank_name.trim(),
      account_title: form.account_title.trim(),
      account_number: form.account_number.trim(),
      iban: form.iban?.trim() || null,
      branch_code: form.branch_code?.trim() || null,
      swift_code: form.swift_code?.trim() || null,
      payment_instructions: form.payment_instructions?.trim() || null,
      is_default: form.is_default,
    };
    try {
      if (editing === "new") {
        await add.mutateAsync(payload);
      } else if (editing) {
        await update.mutateAsync({ id: editing.id, input: payload });
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the bank account.");
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading bank accounts…</p>;
  }

  const list = accounts ?? [];
  const pending = add.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Shown to players at checkout when they choose Bank Transfer. Mark one account as the
        default — it&apos;s listed first. Inactive accounts are hidden from players.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <div key={a.id} className="space-y-1 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {a.label || a.bank_name}
                  {a.is_default && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                      <Star className="size-3 fill-emerald-600" /> Default
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{a.bank_name}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEdit(a)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete"
                  onClick={() => {
                    if (confirm(`Delete ${a.label || a.bank_name}?`)) remove.mutate(a.id);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-foreground">{a.account_title}</p>
            <p className="font-mono text-sm text-muted-foreground">{a.account_number}</p>
            {a.iban && <p className="font-mono text-xs text-muted-foreground">{a.iban}</p>}
            <div className="flex gap-2 pt-1">
              {!a.is_default && (
                <button
                  type="button"
                  onClick={() => update.mutate({ id: a.id, input: { is_default: true } })}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                onClick={() => update.mutate({ id: a.id, input: { is_active: !a.is_active } })}
                className="text-xs text-blue-600 hover:underline"
              >
                {a.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            {editing === "new" ? "Add bank account" : "Edit bank account"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bd-label">Label (optional)</Label>
              <Input
                id="bd-label"
                value={form.label ?? ""}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Meezan Main"
              />
            </div>
            <div>
              <Label htmlFor="bd-bank">Bank Name</Label>
              <Input
                id="bd-bank"
                value={form.bank_name}
                onChange={(e) => set("bank_name", e.target.value)}
                placeholder="Meezan Bank"
                required
              />
            </div>
            <div>
              <Label htmlFor="bd-title">Account Title</Label>
              <Input
                id="bd-title"
                value={form.account_title}
                onChange={(e) => set("account_title", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="bd-account">Account Number</Label>
              <Input
                id="bd-account"
                value={form.account_number}
                onChange={(e) => set("account_number", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="bd-iban">IBAN (optional)</Label>
              <Input
                id="bd-iban"
                value={form.iban ?? ""}
                onChange={(e) => set("iban", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bd-branch">Branch Code (optional)</Label>
              <Input
                id="bd-branch"
                value={form.branch_code ?? ""}
                onChange={(e) => set("branch_code", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bd-swift">SWIFT Code (optional)</Label>
              <Input
                id="bd-swift"
                value={form.swift_code ?? ""}
                onChange={(e) => set("swift_code", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bd-instructions">Payment Instructions (optional)</Label>
            <Textarea
              id="bd-instructions"
              value={form.payment_instructions ?? ""}
              onChange={(e) => set("payment_instructions", e.target.value)}
              placeholder="Upload your payment receipt after transferring."
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_default}
              onChange={(e) => set("is_default", e.target.checked)}
            />
            Set as default (shown first at checkout)
          </label>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
            >
              <Check className="size-4" /> {pending ? "Saving…" : "Save Account"}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={openNew}>
          <Plus className="size-4" /> Add Bank Account
        </Button>
      )}
    </div>
  );
}
