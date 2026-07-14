/** Auth + current-user API calls. */
import { api } from '../lib/api';
import type { RegisterResult, Tokens, User } from '../types';

export function login(email: string, password: string): Promise<Tokens> {
  return api.post<Tokens>('/auth/login', { email, password });
}

export function fetchMe(): Promise<User> {
  return api.get<User>('/users/me');
}

export function logout(refreshToken: string): Promise<null> {
  return api.post<null>('/auth/logout', { refresh_token: refreshToken });
}

/** Player self-registration — the mobile app only ever creates player
 * accounts; owners register from the web dashboard. */
export function register(data: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<RegisterResult> {
  return api.post<RegisterResult>('/auth/register', { ...data, role: 'player' });
}

export function verifyOtp(email: string, code: string): Promise<Tokens> {
  return api.post<Tokens>('/auth/verify-otp', { email, code });
}

export function forgotPassword(email: string): Promise<null> {
  return api.post<null>('/auth/forgot-password', { email });
}

export function resetPassword(token: string, newPassword: string): Promise<null> {
  return api.post<null>('/auth/reset-password', { token, new_password: newPassword });
}

export function updateProfile(data: {
  full_name?: string;
  bio?: string | null;
  profile_picture?: string | null;
  preferred_sports?: string[];
  preferred_locations?: string[];
}): Promise<User> {
  return api.put<User>('/users/me', data);
}

/** Step 1 of the OTP-gated password change — sends a code to the current email. */
export function requestPasswordChange(currentPassword: string, newPassword: string): Promise<null> {
  return api.put<null>('/users/me/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/** Step 2 — confirms with the emailed code. On success the backend revokes
 * every session (including this one), so the app must send the user back to
 * the login screen. */
export function verifyPasswordChange(code: string): Promise<null> {
  return api.post<null>('/users/me/password/verify', { code });
}
