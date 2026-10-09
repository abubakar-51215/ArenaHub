/** Auth + current-user API calls. */
import { api } from "@/services/api";
import type { RegisterResult, Tokens, User } from "@/types";

/** What /auth/login returns to an admin with the right password: no tokens
 *  yet; a 6-digit code was emailed, and the challenge carries the sign-in to
 *  the code step (valid 10 minutes). */
export interface AdminChallenge {
  mfa_required: true;
  challenge_token: string;
  expires_in: number;
}

export function isAdminChallenge(r: Tokens | AdminChallenge): r is AdminChallenge {
  return "mfa_required" in r && r.mfa_required === true;
}

export function login(email: string, password: string): Promise<Tokens | AdminChallenge> {
  return api.post<Tokens | AdminChallenge>("/auth/login", { email, password });
}

/** Second step of an admin sign-in: the emailed code; returns the normal tokens. */
export function verifyAdminCode(challengeToken: string, code: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/admin/verify-code", { challenge_token: challengeToken, code });
}

/** A new admin code (the server sends nothing new within 60 s of the last). */
export function resendAdminCode(challengeToken: string): Promise<null> {
  return api.post<null>("/auth/admin/resend-code", { challenge_token: challengeToken });
}

export function fetchMe(): Promise<User> {
  return api.get<User>("/users/me");
}

export function logout(refreshToken: string): Promise<null> {
  return api.post<null>("/auth/logout", { refresh_token: refreshToken });
}

/** Owner self-registration — the web dashboard only ever creates owner
 * accounts; players register from the mobile app. */
export function register(data: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<RegisterResult> {
  return api.post<RegisterResult>("/auth/register", { ...data, role: "owner" });
}

export function verifyOtp(email: string, code: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/verify-otp", { email, code });
}

export function forgotPassword(email: string): Promise<null> {
  return api.post<null>("/auth/forgot-password", { email });
}

/** Reset with the emailed 6-digit code. The code is checked only here, with
 *  the new password: there is no separate "check code" endpoint. */
export function resetPassword(email: string, otp: string, newPassword: string): Promise<null> {
  return api.post<null>("/auth/reset-password", { email, otp, new_password: newPassword });
}

export function updateProfile(data: { full_name?: string }): Promise<User> {
  return api.put<User>("/users/me", data);
}

/** Step 1 of the OTP-gated password change — sends a code to the current email. */
export function requestPasswordChange(currentPassword: string, newPassword: string): Promise<null> {
  return api.put<null>("/users/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/** Step 2 — confirms with the emailed code. On success the backend revokes
 * every session (including this one), so the app must send the owner back to
 * the login page. */
export function verifyPasswordChange(code: string): Promise<null> {
  return api.post<null>("/users/me/password/verify", { code });
}

export function requestPhoneChange(newPhone: string): Promise<null> {
  return api.post<null>("/users/me/phone", { new_phone: newPhone });
}

export function verifyPhoneChange(code: string): Promise<User> {
  return api.post<User>("/users/me/phone/verify", { code });
}

export function requestEmailChange(newEmail: string): Promise<null> {
  return api.post<null>("/users/me/email", { new_email: newEmail });
}

export function verifyEmailChange(code: string): Promise<User> {
  return api.post<User>("/users/me/email/verify", { code });
}
