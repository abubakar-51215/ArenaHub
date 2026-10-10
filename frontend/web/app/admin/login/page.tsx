"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBrandMark } from "@/components/admin/brand";
import { CodeBoxes } from "@/components/auth/code-boxes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { fetchMe, isAdminChallenge, login, resendAdminCode, verifyAdminCode } from "@/services/auth";
import { useAuthStore } from "@/store/auth";
import type { Tokens } from "@/types";

const RESEND_WAIT_S = 60;
const EMPTY_CODE = "      ";

/** Server messages about the code, in plain words. */
function codeMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Too many requests from this device. Wait a minute and try again.";
    if (/too many incorrect attempts/i.test(err.message))
      return "Too many wrong tries for this code. Ask for a new code below.";
    if (/verification code/i.test(err.message))
      return "That code is wrong, has expired, or was already used. Check the newest email, or ask for a new code.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

// The prototype's sign-in illustration: a fixed set of lime nodes, joined when
// they are closer than 260 units (design/prototypes/arena-hub-admin.html).
const DOTS: [number, number][] = [
  [150, 210],
  [420, 170],
  [300, 330],
  [190, 470],
  [470, 430],
  [330, 600],
  [120, 660],
  [500, 640],
];
const LINES = DOTS.flatMap((p, i) =>
  DOTS.slice(i + 1)
    .filter((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 260)
    .map((q) => [p, q] as const),
);

const EyeIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function AdminLoginPage() {
  const router = useRouter();
  const { setSession, hydrated, user } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // step 2: the emailed code (admins only)
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState(EMPTY_CODE);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (hydrated && user?.role === "admin") router.replace("/admin");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function finish(tokens: Tokens) {
    useAuthStore.getState().setTokens(tokens);
    const me = await fetchMe();
    if (me.role !== "admin") {
      useAuthStore.getState().clear();
      setChallenge(null);
      setError("This is the admin console. Please use an admin account.");
      return;
    }
    setSession(tokens, me);
    router.replace("/admin");
  }

  function backToPassword(message: string | null = null) {
    setChallenge(null);
    setCode(EMPTY_CODE);
    setInfo(null);
    setError(message);
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge || !/^\d{6}$/.test(code)) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await finish(await verifyAdminCode(challenge, code));
    } catch (err) {
      // an expired or unusable sign-in step goes back to the password
      if (err instanceof ApiError && err.status === 401) backToPassword(err.message);
      else {
        setCode(EMPTY_CODE);
        setError(codeMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!challenge) return;
    setError(null);
    setInfo(null);
    try {
      await resendAdminCode(challenge);
      setWait(RESEND_WAIT_S);
      setCode(EMPTY_CODE);
      setInfo("A new code is on its way. Only the newest code works.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) backToPassword(err.message);
      else setError(codeMessage(err));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (isAdminChallenge(result)) {
        setChallenge(result.challenge_token);
        setCode(EMPTY_CODE);
        setWait(RESEND_WAIT_S);
        return;
      }
      await finish(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-theme="arena" data-admin="" className="ah-auth">
      <div className="ah-auth-form">
        <div className="ah-auth-brand">
          <AdminBrandMark tone="theme" />
          <div className="ah-brand-name" style={{ color: "var(--text)" }}>
            Arena Hub<small>Platform admin</small>
          </div>
        </div>
        <p className="ah-eyebrow" style={{ margin: "0 0 10px" }}>
          Restricted access
        </p>
        {challenge ? (
          <>
            <h1 className="ah-h1 ah-auth-title">Verification code</h1>
            <p className="ah-mute" style={{ margin: "0 0 28px", fontSize: 14 }}>
              We emailed a 6-digit code to <b style={{ color: "var(--text)" }}>{email}</b>. It works for
              10 minutes.
            </p>
            <form onSubmit={onVerify} className="ah-stack" style={{ gap: 16, maxWidth: 410 }}>
              <CodeBoxes value={code} onChange={setCode} invalid={!!error} autoFocus />
              {error && (
                <p role="alert" className="ah-auth-error">
                  {error}
                </p>
              )}
              {info && (
                <p role="status" className="ah-auth-info">
                  {info}
                </p>
              )}
              <Button type="submit" disabled={submitting || !/^\d{6}$/.test(code)} className="ah-signin">
                {submitting ? "Checking…" : "Verify and sign in"}
              </Button>
              <div className="ah-auth-code-links">
                {wait > 0 ? (
                  <span aria-live="polite">
                    Resend code in {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}
                  </span>
                ) : (
                  <button type="button" className="ah-auth-link" onClick={onResend}>
                    Resend code
                  </button>
                )}
                <button type="button" className="ah-auth-link" onClick={() => backToPassword()}>
                  Back
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 className="ah-h1 ah-auth-title">Control tower.</h1>
            <p className="ah-mute" style={{ margin: "0 0 28px", fontSize: 14 }}>
              Approvals, payouts and disputes across every arena on the network.
            </p>

            <form onSubmit={onSubmit} className="ah-stack" style={{ gap: 16, maxWidth: 410 }}>
              <div className="ah-field">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@arenahub.pk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="ah-field">
                <Label htmlFor="password">Password</Label>
                <div className="ah-pw-wrap">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="ah-pw-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {EyeIcon}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="ah-auth-error">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={submitting} className="ah-signin">
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </>
        )}

        <p className="ah-mute ah-auth-foot">© 2026 Arena Hub · Internal use only</p>
      </div>

      <div className="ah-auth-side" aria-hidden="true">
        <svg className="ah-pitch-art" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="ah-l1" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#C4F546" stopOpacity=".3" />
              <stop offset="100%" stopColor="#C4F546" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ah-tf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0C1F16" />
              <stop offset="100%" stopColor="#050B08" />
            </linearGradient>
          </defs>
          <rect width="600" height="800" fill="url(#ah-tf)" />
          <ellipse cx="300" cy="300" rx="340" ry="300" fill="url(#ah-l1)" />
          <g stroke="#C4F546" strokeOpacity=".22" strokeWidth="1">
            {LINES.map(([p, q], i) => (
              <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />
            ))}
          </g>
          <g>
            {DOTS.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={i % 3 === 0 ? 6 : 3.5}
                fill="#C4F546"
                fillOpacity={i % 3 === 0 ? 0.9 : 0.45}
              />
            ))}
          </g>
        </svg>
        <div className="ah-auth-quote">
          <h3>
            One network. <em>One set of rules.</em>
          </h3>
          <p>Every arena that joins is verified here before a single slot goes on sale.</p>
        </div>
        {/* the prototype's .auth-stats row, with what the panel is for instead of
            counts: a signed-out page cannot show real numbers */}
        <div className="ah-auth-stats">
          <div>
            <b>Review</b>
            <span>Pending arenas</span>
          </div>
          <div>
            <b>Manage</b>
            <span>Owners and players</span>
          </div>
          <div>
            <b>Resolve</b>
            <span>Complaints</span>
          </div>
        </div>
      </div>
    </div>
  );
}
