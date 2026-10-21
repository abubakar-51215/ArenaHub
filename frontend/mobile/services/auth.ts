/** Auth + current-user API calls. */
import { api } from "../lib/api";
import type { RegisterResult, Tokens, User } from "../types";

/** What /auth/login gives an admin with the right password: no tokens, a code was emailed. */
export interface AdminChallenge {
  mfa_required: true;
  challenge_token: string;
  expires_in: number;
  /** The masked address the code went to. */
  sent_to: string;
  /** false when the email could not be sent. */
  code_sent: boolean;
}

export function isAdminChallenge(r: Tokens | AdminChallenge): r is AdminChallenge {
  return (r as AdminChallenge).mfa_required === true;
}

/** `identifier` is an email or a phone number (the older `email` field still works on the server). */
export function login(identifier: string, password: string, opts?: { timeoutMs?: number }): Promise<Tokens | AdminChallenge> {
  return api.post<Tokens | AdminChallenge>("/auth/login", { identifier, password }, opts);
}

export function verifyAdminCode(challengeToken: string, code: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/admin/verify-code", { challenge_token: challengeToken, code });
}

export function resendAdminCode(challengeToken: string): Promise<null> {
  return api.post<null>("/auth/admin/resend-code", { challenge_token: challengeToken });
}

/** Continue with Google: the server checks Google's ID token and answers with a session. */
export interface GoogleSignIn extends Tokens {
  /** The account has no phone yet: "One more step" asks for it before anything else. */
  phone_needed: boolean;
  /** A sign-up with this email that was never confirmed: Google confirmed it and its password was removed. */
  password_removed: boolean;
  user: User;
}

export function googleSignIn(idToken: string): Promise<GoogleSignIn> {
  return api.post<GoogleSignIn>("/auth/google", { id_token: idToken });
}

/** "One more step": the phone of an account made with Google (the sign-up rules apply). */
export function saveGooglePhone(phone: string): Promise<User> {
  return api.post<User>("/auth/google/phone", { phone });
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
  notification_preferences?: Record<string, unknown>;
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

/** The password is checked again before a code goes to the new address; the old address stays until it is used. */
export function requestEmailChange(newEmail: string, currentPassword: string): Promise<null> {
  return api.post<null>("/users/me/email", { new_email: newEmail, current_password: currentPassword });
}

export function verifyEmailChange(code: string): Promise<User> {
  return api.post<User>("/users/me/email/verify", { code });
}

/** A 6-digit code goes to the account's own email; the account is deleted only once it is confirmed. */
export function requestAccountDeletion(): Promise<null> {
  return api.post<null>("/users/me/delete", {});
}

export function verifyAccountDeletion(code: string): Promise<null> {
  return api.post<null>("/users/me/delete/verify", { code });
}
