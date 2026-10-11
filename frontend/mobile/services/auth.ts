/** Auth + current-user API calls. */
import { api } from "../lib/api";
import type { RegisterResult, Tokens, User } from "../types";

/** What /auth/login gives an admin with the right password: no tokens, a code was emailed. */
export interface AdminChallenge {
  mfa_required: true;
  challenge_token: string;
  expires_in: number;
}

export function isAdminChallenge(r: Tokens | AdminChallenge): r is AdminChallenge {
  return (r as AdminChallenge).mfa_required === true;
}

/** `identifier` is an email or a phone number (the older `email` field still works on the server). */
export function login(identifier: string, password: string): Promise<Tokens | AdminChallenge> {
  return api.post<Tokens | AdminChallenge>("/auth/login", { identifier, password });
}

export function verifyAdminCode(challengeToken: string, code: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/admin/verify-code", { challenge_token: challengeToken, code });
}

export function resendAdminCode(challengeToken: string): Promise<null> {
  return api.post<null>("/auth/admin/resend-code", { challenge_token: challengeToken });
}

export function fetchMe(opts?: { timeoutMs?: number }): Promise<User> {
  return api.get<User>("/users/me", opts);
}

export function logout(refreshToken: string): Promise<null> {
  return api.post<null>("/auth/logout", { refresh_token: refreshToken });
}

/** Player self-registration — the mobile app only ever creates player
 * accounts; owners register from the web dashboard. */
export function register(data: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<RegisterResult> {
  return api.post<RegisterResult>("/auth/register", {
    ...data,
    role: "player",
  });
}

export function verifyOtp(email: string, code: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/verify-otp", { email, code });
}

export function resendOtp(email: string): Promise<null> {
  return api.post<null>("/auth/resend-otp", { email });
}

export function forgotPassword(email: string): Promise<null> {
  return api.post<null>("/auth/forgot-password", { email });
}

/** Reset with the emailed 6-digit code. The server has no separate "check the
 *  code" step: email, code and new password go together, once, at the end. */
export function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<null> {
  return api.post<null>("/auth/reset-password", {
    email,
    otp,
    new_password: newPassword,
  });
}

export function updateProfile(data: {
  full_name?: string;
  bio?: string | null;
  profile_picture?: string | null;
  preferred_sports?: string[];
  preferred_locations?: string[];
  notification_preferences?: Record<string, boolean>;
}): Promise<User> {
  return api.put<User>("/users/me", data);
}

/** Step 1 of the OTP-gated password change — sends a code to the current email. */
export function requestPasswordChange(
  currentPassword: string,
  newPassword: string,
): Promise<null> {
  return api.put<null>("/users/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/** Step 2 — confirms with the emailed code. On success the backend revokes
 * every session (including this one), so the app must send the user back to
 * the login screen. */
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

export function deleteAccount(): Promise<null> {
  return api.del<null>("/users/me");
}
