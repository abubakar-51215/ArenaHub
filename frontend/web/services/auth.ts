/** Auth + current-user API calls. */
import { api } from "@/services/api";
import type { Tokens, User } from "@/types";

export function login(email: string, password: string): Promise<Tokens> {
  return api.post<Tokens>("/auth/login", { email, password });
}

export function fetchMe(): Promise<User> {
  return api.get<User>("/users/me");
}

export function logout(refreshToken: string): Promise<null> {
  return api.post<null>("/auth/logout", { refresh_token: refreshToken });
}
