/** Auth + current-user API calls. */
import { api } from "@/services/api";
import type { RegisterResult, Tokens, User } from "@/types";

export function login(email: string, password: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/login", { email, password });
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

export function resetPassword(token: string, newPassword: string): Promise<null> {
  return api.post<null>("/auth/reset-password", { token, new_password: newPassword });
}
