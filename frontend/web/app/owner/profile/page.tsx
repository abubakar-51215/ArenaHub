"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-blue-600 text-white hover:bg-blue-700"
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

  return (
    <>
      <PageHeader title="Profile" />
      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <Section title="Basic information">
          <div className="space-y-4">
            <div>
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <ErrorText message={nameMutation.isError ? errMessage(nameMutation.error) : null} />
            <div className="flex items-center justify-between">
              {nameMutation.isSuccess && (
                <span className="text-sm text-emerald-600">Saved.</span>
              )}
              <Button
                className="ml-auto bg-blue-600 text-white hover:bg-blue-700"
                disabled={
                  nameMutation.isPending || !fullName.trim() || fullName.trim() === user.full_name
                }
                onClick={() => nameMutation.mutate()}
              >
                {nameMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Email address" description={`Current: ${user.email}`}>
          <div className="flex gap-3">
            <Input
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
        </Section>

        <Section title="Phone number" description={`Current: ${user.phone}`}>
          <div className="flex gap-3">
            <Input
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
        </Section>

        <Section
          title="Change password"
          description="You'll be asked to confirm with a code emailed to your current address."
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <ErrorText message={passwordError} />
            <div className="flex justify-end">
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={
                  requestPasswordMutation.isPending || !currentPassword || !passwordsMatch
                }
                onClick={() => requestPasswordMutation.mutate()}
              >
                {requestPasswordMutation.isPending ? "Sending…" : "Send verification code"}
              </Button>
            </div>
          </div>
        </Section>
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
