"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { SplitAuthShell } from "@/components/auth/split-auth-shell";
import { readSavedStep, saveStep } from "@/components/auth/signup-step";
import { useCodeEntry } from "@/components/auth/use-code-entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { fetchMe, register, resendOtp, verifyOtp } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const fields = err.fieldErrors.map((f) => f.message).join(" ");
    return fields ? `${err.message}: ${fields}` : err.message;
  }
  return fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setSession, setTokens } = useAuthStore();

  const [step, setStep] = useState<"form" | "otp">("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sent, setSent] = useState<{ sentTo: string; codeSent: boolean; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // a refresh on the code step comes back to it
  useEffect(() => {
    const saved = readSavedStep();
    if (!saved) return;
    setEmail(saved.email);
    setSent({ sentTo: saved.sentTo, codeSent: saved.codeSent, at: saved.at });
    setStep("otp");
  }, []);

  async function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await register({ full_name: fullName, email, phone, password });
      const step = { email, sentTo: result.otp_sent_to, codeSent: result.code_sent !== false, at: Date.now() };
      setSent(step);
      saveStep(step);
      setStep("otp");
    } catch (err) {
      setError(errorMessage(err, "Registration failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyCode(code: string) {
    const tokens = await verifyOtp(email, code);
    // Persist tokens first so fetchMe() sends the Authorization header.
    setTokens(tokens);
    const me = await fetchMe();
    saveStep(null);
    if (me.role !== "owner") {
      // a player confirming from the owner pages: the email is confirmed; the app is where they sign in
      useAuthStore.getState().clear();
      setStep("form");
      setError("Your email is confirmed. This dashboard is for arena owners: sign in on the ArenaHub app.");
      return;
    }
    setSession(tokens, me);
    router.replace("/owner");
  }

  return (
    <SplitAuthShell
      variant="owner"
      imageSrc="/images/court-signup.jpg"
      imageAlt=""
      credit="For arena owners"
      quote={{
        eyebrow: "Join the network",
        title: (
          <>
            Get seen by players <em>the moment</em> you go live.
          </>
        ),
        desc: "List your courts, set your prices, and start taking real-time bookings the same day you sign up.",
      }}
      stats={[
        { value: "List", label: "Courts and amenities" },
        { value: "Price", label: "Peak and off-peak rules" },
        { value: "Earn", label: "Real-time bookings" },
      ]}
    >
      {step === "form" ? (
        <>
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sent
              ? "Change your email, then continue. We will send a new code."
              : "Set up your Arena Hub owner account to list and manage arenas."}
          </p>

          <form onSubmit={onSubmitForm} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                autoComplete="name"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="owner@arenahub.pk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="03001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <div>
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="h-11 w-full"
            >
              {submitting ? (sent ? "Sending…" : "Creating account…") : sent ? "Continue" : "Create Account"}
            </Button>
          </form>
        </>
      ) : (
        <CodeStep
          // a new code step (and its timer) for each code sent
          key={`${email}-${sent?.at ?? 0}`}
          sentTo={sent?.sentTo ?? ""}
          codeSent={sent?.codeSent ?? true}
          firstWait={sent ? 60 - (Date.now() - sent.at) / 1000 : 0}
          onVerify={onVerifyCode}
          onResend={() => resendOtp(email)}
          onBack={() => {
            saveStep(null);
            setStep("form");
            setError(null);
          }}
        />
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground"
        >
          Sign in
        </Link>
      </p>
    </SplitAuthShell>
  );
}

/** "Verify your email": the shared code entry, with the form's Back kept (what was typed is still there). */
function CodeStep({
  sentTo,
  codeSent,
  firstWait,
  onVerify,
  onResend,
  onBack,
}: {
  sentTo: string;
  codeSent: boolean;
  firstWait: number;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<unknown>;
  onBack: () => void;
}) {
  const entry = useCodeEntry({ sentTo, codeSent, firstWait, onVerify, onResend });
  return (
    <>
      <h1 className="text-2xl font-bold text-foreground">Verify your email</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{sentTo || "your email"}</span>. It
        works for 10 minutes.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          entry.confirm();
        }}
        className="mt-7 space-y-4"
      >
        {entry.boxes}

        <Button type="submit" size="lg" disabled={entry.loading || !entry.ready} className="h-11 w-full">
          {entry.loading ? "Verifying…" : "Verify & Continue"}
        </Button>

        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          {entry.resendLink}
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground"
          >
            Wrong email? Use a different email
          </button>
        </div>
      </form>
    </>
  );
}
