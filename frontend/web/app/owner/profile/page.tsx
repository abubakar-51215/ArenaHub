"use client";

/**
 * Owner Settings, in the owner prototype's Settings look: a tab row with the
 * sections that exist (Profile, Security). Profile has the owner card
 * (initials; photo upload is not built) and the name, email and phone,
 * changed by code as before; Security has the password change by code.
 * Left out: Business, Payouts, Notifications, Team & roles, WhatsApp, city,
 * timezone and logo.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { initials } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import {
  requestEmailChange,
  requestPasswordChange,
  requestPhoneChange,
  updateProfile,
  verifyEmailChange,
  verifyPasswordChange,
  verifyPhoneChange,
} from "@/services/auth";
import { useAuthStore } from "@/store/auth";

type Tab = "profile" | "security";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="ah-card-error" role="alert">
      <span>{message}</span>
    </div>
  );
}

function errMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

/** Shared OTP-verify dialog for the email/phone change flows below. */
function OtpDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  error: string | null;
  onConfirm: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setCode("");
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="otp-code">Verification code</Label>
          <Input
            id="otp-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            autoFocus
          />
        </div>
        <ErrorText message={error} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || code.length !== 6}
            onClick={() => onConfirm(code)}
          >
            {pending ? "Confirming…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OwnerProfilePage() {
  const router = useRouter();
  const { user, setUser, clear } = useAuthStore();
  const [tab, setTab] = useState<Tab>("profile");

  // ---- basic info ----
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const nameMutation = useMutation({
    mutationFn: () => updateProfile({ full_name: fullName.trim() }),
    onSuccess: (updated) => setUser(updated),
  });

  // ---- email change ----
  const [newEmail, setNewEmail] = useState("");
  const [emailOtpOpen, setEmailOtpOpen] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const requestEmailMutation = useMutation({
    mutationFn: () => requestEmailChange(newEmail.trim()),
    onSuccess: () => {
      setEmailError(null);
      setEmailOtpOpen(true);
    },
    onError: (err) => setEmailError(errMessage(err)),
  });
  const verifyEmailMutation = useMutation({
    mutationFn: (code: string) => verifyEmailChange(code),
    onSuccess: (updated) => {
      setUser(updated);
      setEmailOtpOpen(false);
      setNewEmail("");
    },
    onError: (err) => setEmailError(errMessage(err)),
  });

  // ---- phone change ----
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtpOpen, setPhoneOtpOpen] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const requestPhoneMutation = useMutation({
    mutationFn: () => requestPhoneChange(newPhone.trim()),
    onSuccess: () => {
      setPhoneError(null);
      setPhoneOtpOpen(true);
    },
    onError: (err) => setPhoneError(errMessage(err)),
  });
  const verifyPhoneMutation = useMutation({
    mutationFn: (code: string) => verifyPhoneChange(code),
    onSuccess: (updated) => {
      setUser(updated);
      setPhoneOtpOpen(false);
      setNewPhone("");
    },
    onError: (err) => setPhoneError(errMessage(err)),
  });

  // ---- password change ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOtpOpen, setPasswordOtpOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmPassword;
  const requestPasswordMutation = useMutation({
    mutationFn: () => requestPasswordChange(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordError(null);
      setPasswordOtpOpen(true);
    },
    onError: (err) => setPasswordError(errMessage(err)),
  });
  const verifyPasswordMutation = useMutation({
    mutationFn: (code: string) => verifyPasswordChange(code),
    onSuccess: () => {
      // The backend revokes every session on success — send the owner back
      // to log in with the new password.
      clear();
      router.replace("/login");
    },
    onError: (err) => setPasswordError(errMessage(err)),
  });

  if (!user) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Profile" },
    { key: "security", label: "Security" },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and sign-in details" />
      <div className="ah-ocanvas animate-fade-in">
        <section className="ah-card">
          <div className="ah-tabs ah-tabs-scroll" role="tablist" aria-label="Settings sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`panel-${t.key}`}
                className={tab === t.key ? "ah-tab is-on" : "ah-tab"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ah-card-body">
            {tab === "profile" && (
              <div id="panel-profile" role="tabpanel" aria-labelledby="tab-profile" className="ah-grid ah-g-23 ah-settings">
                <div className="ah-owner-card">
                  <span className="ah-owner-avatar" aria-hidden="true">
                    {initials(user.full_name)}
                  </span>
                  <b>{user.full_name}</b>
                  <p>{user.email}</p>
                  {user.phone && <p>{user.phone}</p>}
                  <span className="ah-tag">Owner</span>
                </div>

                <div className="ah-stack" style={{ gap: 22 }}>
                  <div className="ah-field">
                    <Label htmlFor="full-name">Full name</Label>
                    <div className="ah-field-row">
                      <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                      <Button
                        disabled={nameMutation.isPending || !fullName.trim() || fullName.trim() === user.full_name}
                        onClick={() => nameMutation.mutate()}
                      >
                        {nameMutation.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    {nameMutation.isSuccess && <span className="ah-saved">Saved.</span>}
                    <ErrorText message={nameMutation.isError ? errMessage(nameMutation.error) : null} />
                  </div>

                  <div className="ah-field">
                    <Label htmlFor="new-email">Email address</Label>
                    <p className="ah-field-hint">Now {user.email}. We send a code to the new address to confirm it.</p>
                    <div className="ah-field-row">
                      <Input
                        id="new-email"
                        type="email"
                        placeholder="new@address.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={requestEmailMutation.isPending || !newEmail.trim()}
                        onClick={() => requestEmailMutation.mutate()}
                      >
                        {requestEmailMutation.isPending ? "Sending…" : "Change email"}
                      </Button>
                    </div>
                    <ErrorText message={emailError} />
                  </div>

                  <div className="ah-field">
                    <Label htmlFor="new-phone">Phone number</Label>
                    <p className="ah-field-hint">
                      {user.phone ? `Now ${user.phone}. ` : ""}We send a code to the new number to confirm it.
                    </p>
                    <div className="ah-field-row">
                      <Input
                        id="new-phone"
                        inputMode="tel"
                        placeholder="03XXXXXXXXX"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={requestPhoneMutation.isPending || !newPhone.trim()}
                        onClick={() => requestPhoneMutation.mutate()}
                      >
                        {requestPhoneMutation.isPending ? "Sending…" : "Change phone"}
                      </Button>
                    </div>
                    <ErrorText message={phoneError} />
                  </div>
                </div>
              </div>
            )}

            {tab === "security" && (
              <div id="panel-security" role="tabpanel" aria-labelledby="tab-security" className="ah-settings-narrow">
                <p className="ah-eyebrow">Change password</p>
                <p className="ah-field-hint" style={{ margin: "8px 0 18px" }}>
                  You&apos;ll confirm with a code emailed to {user.email}. Every device is signed out afterwards.
                </p>
                <div className="ah-stack" style={{ gap: 16 }}>
                  <div className="ah-field">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className="ah-grid ah-g-2" style={{ gap: 16 }}>
                    <div className="ah-field">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div className="ah-field">
                      <Label htmlFor="confirm-password">Confirm new password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <ErrorText message={passwordError} />
                </div>
                <div className="ah-save-row">
                  <Button
                    disabled={requestPasswordMutation.isPending || !currentPassword || !passwordsMatch}
                    onClick={() => requestPasswordMutation.mutate()}
                  >
                    {requestPasswordMutation.isPending ? "Sending…" : "Send verification code"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <OtpDialog
        open={emailOtpOpen}
        onOpenChange={setEmailOtpOpen}
        title="Confirm your new email"
        description={`We sent a 6-digit code to ${newEmail}.`}
        pending={verifyEmailMutation.isPending}
        error={emailError}
        onConfirm={(code) => verifyEmailMutation.mutate(code)}
      />
      <OtpDialog
        open={phoneOtpOpen}
        onOpenChange={setPhoneOtpOpen}
        title="Confirm your new phone number"
        description={`We sent a 6-digit code to ${newPhone}.`}
        pending={verifyPhoneMutation.isPending}
        error={phoneError}
        onConfirm={(code) => verifyPhoneMutation.mutate(code)}
      />
      <OtpDialog
        open={passwordOtpOpen}
        onOpenChange={setPasswordOtpOpen}
        title="Confirm password change"
        description={`We sent a 6-digit code to ${user.email}.`}
        pending={verifyPasswordMutation.isPending}
        error={passwordError}
        onConfirm={(code) => verifyPasswordMutation.mutate(code)}
      />
    </>
  );
}
