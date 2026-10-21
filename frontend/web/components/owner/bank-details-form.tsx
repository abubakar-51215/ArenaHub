"use client";

import { useState } from "react";

import { AdminBadge } from "@/components/admin/ui";
import { OtpDialog } from "@/components/auth/otp-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddBankDetails,
  useBankDetails,
  useDeleteBankDetails,
  useUpdateBankDetails,
  useVerifyBankDetailsChange,
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
  const verify = useVerifyBankDetailsChange(arenaId);

  const [editing, setEditing] = useState<BankDetails | "new" | null>(null);
  const [form, setForm] = useState<BankDetailsInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  // Adding, deleting, or editing the account number/title/bank always needs a code (a pure
  // default/active switch applies at once, see useUpdateBankDetails). `resend` re-sends the
  // exact same request, which both re-sends the email and re-stages the same change.
  const [otpOpen, setOtpOpen] = useState(false);
  const [resend, setResend] = useState<() => Promise<unknown>>(() => () => Promise.resolve());

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
        // adding is always gated: a null result always means a code was sent
        setResend(() => () => add.mutateAsync(payload));
        setOtpOpen(true);
      } else if (editing) {
        const id = editing.id;
        const result = await update.mutateAsync({ id, input: payload });
        if (result === null) {
          // the account number, title or bank changed: a code was sent
          setResend(() => () => update.mutateAsync({ id, input: payload }));
          setOtpOpen(true);
        } else {
          setEditing(null);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the bank account.");
    }
  }

  async function onDelete(a: BankDetails) {
    if (!confirm(`Delete ${a.label || a.bank_name}?`)) return;
    setError(null);
    try {
      await remove.mutateAsync(a.id);
      // removing is always gated: success here always means a code was sent, not yet removed
      setResend(() => () => remove.mutateAsync(a.id));
      setOtpOpen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the bank account.");
    }
  }

  async function onVerify(code: string) {
    await verify.mutateAsync(code);
    setOtpOpen(false);
    setEditing(null);
  }

  if (isLoading) {
    return <p className="ah-empty-line ah-pitch-note">Loading bank accounts…</p>;
  }

  const list = accounts ?? [];
  const pending = add.isPending || update.isPending;

  return (
    <div className="ah-bank">
      {list.length === 0 && !editing && (
        <p className="ah-bank-none">No bank accounts yet for this arena.</p>
      )}

      {list.length > 0 && (
        <ul className="ah-bank-list">
          {list.map((a) => (
            <li key={a.id}>
              <div className="ah-bank-name">
                <div className="ah-badges">
                  <b>{a.label || a.bank_name}</b>
                  {a.is_default && <AdminBadge tone="ok">Default</AdminBadge>}
                  {!a.is_active && <AdminBadge tone="idle">Inactive</AdminBadge>}
                </div>
                <span className="ah-sub">{a.bank_name}</span>
              </div>
              <div className="ah-bank-acct">
                <span>{a.account_title}</span>
                <span className="ah-mono">{a.account_number}</span>
                {a.iban && <span className="ah-mono ah-sub">{a.iban}</span>}
              </div>
              <div className="ah-row-actions">
                {!a.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: a.id, input: { is_default: true } })}
                  >
                    Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: a.id, input: { is_active: !a.is_active } })}
                >
                  {a.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => onDelete(a)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <form onSubmit={onSubmit} className="ah-bank-form">
          <p className="ah-eyebrow">
            {editing === "new" ? "Add bank account" : "Edit bank account"}
          </p>
          <div className="ah-grid ah-g-2" style={{ gap: 14 }}>
            <div className="ah-field">
              <Label htmlFor={`bd-label-${arenaId}`}>Label (optional)</Label>
              <Input
                id={`bd-label-${arenaId}`}
                value={form.label ?? ""}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Meezan Main"
              />
            </div>
            <div className="ah-field">
              <Label htmlFor={`bd-bank-${arenaId}`}>Bank name</Label>
              <Input
                id={`bd-bank-${arenaId}`}
                value={form.bank_name}
                onChange={(e) => set("bank_name", e.target.value)}
                placeholder="Meezan Bank"
                required
              />
            </div>
            <div className="ah-field">
              <Label htmlFor={`bd-title-${arenaId}`}>Account title</Label>
              <Input
                id={`bd-title-${arenaId}`}
                value={form.account_title}
                onChange={(e) => set("account_title", e.target.value)}
                required
              />
            </div>
            <div className="ah-field">
              <Label htmlFor={`bd-account-${arenaId}`}>Account number</Label>
              <Input
                id={`bd-account-${arenaId}`}
                value={form.account_number}
                onChange={(e) => set("account_number", e.target.value)}
                required
              />
            </div>
            <div className="ah-field">
              <Label htmlFor={`bd-iban-${arenaId}`}>IBAN (optional)</Label>
              <Input
                id={`bd-iban-${arenaId}`}
                value={form.iban ?? ""}
                onChange={(e) => set("iban", e.target.value)}
              />
            </div>
            <div className="ah-field">
              <Label htmlFor={`bd-branch-${arenaId}`}>Branch code (optional)</Label>
              <Input
                id={`bd-branch-${arenaId}`}
                value={form.branch_code ?? ""}
                onChange={(e) => set("branch_code", e.target.value)}
              />
            </div>
            <div className="ah-field">
              <Label htmlFor={`bd-swift-${arenaId}`}>SWIFT code (optional)</Label>
              <Input
                id={`bd-swift-${arenaId}`}
                value={form.swift_code ?? ""}
                onChange={(e) => set("swift_code", e.target.value)}
              />
            </div>
          </div>
          <div className="ah-field">
            <Label htmlFor={`bd-instructions-${arenaId}`}>Payment instructions (optional)</Label>
            <Textarea
              id={`bd-instructions-${arenaId}`}
              value={form.payment_instructions ?? ""}
              onChange={(e) => set("payment_instructions", e.target.value)}
              placeholder="Upload your payment receipt after transferring."
              rows={2}
            />
          </div>
          <label className="ah-check">
            <input
              type="checkbox"
              checked={!!form.is_default}
              onChange={(e) => set("is_default", e.target.checked)}
            />
            Set as default (shown first at checkout)
          </label>

          {error && (
            <div className="ah-card-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <div className="ah-save-row" style={{ marginTop: 4 }}>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save account"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="ah-bank-add">
          <Button variant="outline" onClick={openNew}>
            Add bank account
          </Button>
        </div>
      )}

      <OtpDialog
        open={otpOpen}
        onOpenChange={setOtpOpen}
        title="Confirm this bank account change"
        description="We sent a 6-digit code to your account email. It works for 10 minutes."
        onVerify={onVerify}
        onResend={resend}
      />
    </div>
  );
}
